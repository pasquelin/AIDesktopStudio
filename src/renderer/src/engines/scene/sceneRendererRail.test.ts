import { Group, PerspectiveCamera, Vector3 } from 'three'
import type { Object3D } from 'three'
import { expect, it, vi } from 'vitest'
import { SceneRenderer } from './SceneRenderer'
import type { BvhBuilder } from './bvhBuilder'
import type * as ModelCache from './modelCache'
import { animationTrack, cameraShot } from './animation-fixtures'
import { cameraNodeFixture, meshNode, pathNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE, IDENTITY_TRANSFORM, type SceneState } from './sceneState'
import {
  EMPTY_TIMELINE,
  type AnimationTimeline,
  type AnimationTrack,
  type CameraShot,
  type Keyframe,
} from '@shared/domain/animation'
import { SECOND } from '@shared/domain/time'

/**
 * The instance the scene mounts is a clone, which nothing outside the engine can reach. Handing
 * the source back in its place is what makes the mixer's work observable — and it is the source's
 * clips that drive it either way, since `Object3D.copy` carries none.
 */
vi.mock('./modelCache', async importOriginal => ({
  ...(await importOriginal<typeof ModelCache>()),
  instanceOf: (source: Object3D) => source,
}))

/* A cube travelling one unit along X over one second. */
/* The same, carrying a skeleton — which is where a role is read from now, never a document. */
/** No worker under vitest, and no tree is what this file is about. */
const bvh: BvhBuilder = { accelerate: () => Promise.resolve(), dispose: () => {} }

const objectOf = (engine: SceneRenderer, id: string): Object3D | undefined => {
  const scene: { children: Object3D[] } = Reflect.get(engine, 'viewport').scene
  return scene.children.find(child => child.name === id)
}

const channel = (
  id: string,
  target: AnimationTrack['target'],
  keys: Keyframe[],
  muted = false,
): AnimationTrack => animationTrack(id, target.property, keys, { target, muted })

/** A rail ten units long down X, a camera bound to it for the whole of a four-second shot. */
const stagedScene = (
  extra: Partial<CameraShot> = {},
  timeline: Partial<AnimationTimeline> = {},
): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [
    cameraNodeFixture('cam'),
    pathNodeFixture('rail', {
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
      ],
    }),
    {
      ...meshNode('watched'),
      transform: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 0, z: -20 } },
    },
  ],
  animation: {
    ...EMPTY_TIMELINE,
    ...timeline,
    shots: [
      cameraShot('s1', {
        cameraId: 'cam',
        start: 0,
        duration: 4 * SECOND,
        motion: { pathId: 'rail', easing: 'linear', from: 0, to: 1 },
        ...extra,
      }),
    ],
  },
})

const stagedOn = (scene: SceneState): SceneRenderer => {
  const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
  engine.apply(scene)
  return engine
}

const staged = (
  extra: Partial<CameraShot> = {},
  timeline: Partial<AnimationTimeline> = {},
): SceneRenderer => stagedOn(stagedScene(extra, timeline))

it('stands the camera at the start of the rail, and at its end when the shot is over', () => {
  const engine = staged()

  expect(objectOf(engine, 'cam')?.position.x).toBeCloseTo(0, 4)

  // One microsecond before the end: a shot covers `[start, start + duration)`, so the very
  // instant it ends is already outside it — see `activeShotAt`.
  engine.setPlayhead(4 * SECOND - 1)
  expect(objectOf(engine, 'cam')?.position.x).toBeCloseTo(10, 4)
  engine.dispose()
})

/**
 * Placing the head straight there must give the very same STATE as walking to it — where the
 * camera stands, where it aims and what its lens reads, the three at once. That is the whole
 * reason nothing here accumulates frame by frame, and the aim is the one that would drift:
 * it is taken from a target that is itself animated.
 */
it('gives the same camera state whether the head arrived in one step or in twenty', () => {
  const drifting = (): SceneRenderer =>
    staged(
      { target: { kind: 'node', nodeId: 'watched' } },
      {
        tracks: [
          channel('lens', { nodeId: 'cam', property: 'fov' }, [
            { time: 0, value: { x: 0, y: 0, z: 0 } },
            { time: 4 * SECOND, value: { x: 20, y: 0, z: 0 } },
          ]),
          channel('walk', { nodeId: 'watched', property: 'position' }, [
            { time: 0, value: { x: 0, y: 0, z: 0 } },
            { time: 4 * SECOND, value: { x: 30, y: 5, z: 0 } },
          ]),
        ],
      },
    )

  const stateOf = (engine: SceneRenderer): number[] => {
    const camera = objectOf(engine, 'cam')
    if (!(camera instanceof PerspectiveCamera)) throw new Error('the fixture stages a camera')
    return [...camera.position.toArray(), ...camera.quaternion.toArray(), camera.fov]
  }

  const straight = drifting()
  straight.setPlayhead(2.5 * SECOND)
  const once = stateOf(straight)

  // What the head reads there, spelled out: without this the comparison below would hold just
  // as well on a camera that never left its rest, which is the one way it could mean nothing.
  expect(once[0]).toBeCloseTo(6.25, 4)
  expect(once.at(-1)).toBeCloseTo(62.5, 4)
  expect(Math.abs(once[4] ?? 0)).toBeGreaterThan(0.1)

  const walked = drifting()
  for (let step = 1; step <= 20; step += 1) walked.setPlayhead((2.5 * SECOND * step) / 20)

  // Compared WHOLE rather than index by index: a state one number shorter would otherwise pass.
  expect(stateOf(walked)).toEqual(once.map(value => expect.closeTo(value, 10)))
  straight.dispose()
  walked.dispose()
})

it('turns the camera towards the node its shot watches', () => {
  const engine = staged({ target: { kind: 'node', nodeId: 'watched' } })
  const camera = objectOf(engine, 'cam')

  // The watched mesh stands down -Z, which is where a camera looks by default: aimed at it
  // from the start of the rail, the camera is barely turned at all.
  expect(camera?.quaternion.y ?? 1).toBeCloseTo(0, 2)

  // One microsecond before the end: a shot covers `[start, start + duration)`, so the very
  // instant it ends is already outside it — see `activeShotAt`.
  engine.setPlayhead(4 * SECOND - 1)
  // From the far end of the rail it has to turn to keep the same mesh in frame.
  expect(Math.abs(objectOf(engine, 'cam')?.quaternion.y ?? 0)).toBeGreaterThan(0.1)
  engine.dispose()
})

it('opens the lens by what its fov channel adds, and puts it back when that channel goes quiet', () => {
  const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
  const lensTrack = (muted: boolean): AnimationTimeline => ({
    ...EMPTY_TIMELINE,
    tracks: [
      channel(
        'lens',
        { nodeId: 'cam', property: 'fov' },
        [
          { time: 0, value: { x: 0, y: 0, z: 0 } },
          { time: 2 * SECOND, value: { x: 20, y: 0, z: 0 } },
        ],
        muted,
      ),
    ],
  })

  const nodes = [cameraNodeFixture('cam', { fov: 50 })]
  engine.apply({ ...EMPTY_SCENE, nodes, animation: lensTrack(false) })

  const lens = objectOf(engine, 'cam')
  expect(lens instanceof PerspectiveCamera && lens.fov).toBe(50)

  engine.setPlayhead(1 * SECOND)
  expect(lens instanceof PerspectiveCamera && lens.fov).toBeCloseTo(60, 5)

  // Muted, the lens takes back what the document says rather than keeping the last scrub.
  engine.apply({ ...EMPTY_SCENE, nodes, animation: lensTrack(true) })
  expect(lens instanceof PerspectiveCamera && lens.fov).toBe(50)
  engine.dispose()
})

// Scrubbing past the end of a shot used to strand the camera wherever its rail left it — and
// the film went on being taken from there.
it('puts the camera back where the document holds it once no shot drives it', () => {
  const engine = staged()

  engine.setPlayhead(4 * SECOND - 1)
  expect(objectOf(engine, 'cam')?.position.x).toBeCloseTo(10, 4)

  engine.setPlayhead(5 * SECOND)
  expect(objectOf(engine, 'cam')?.position.x).toBeCloseTo(0, 4)
  engine.dispose()
})

/**
 * Unbinding a rail, or deleting it, leaves the shot covering the head with nothing left to write
 * the camera's position — so it stayed where the rail had put it, on screen as in the film.
 */
it('puts the camera back where the document holds it once its shot has no rail to run', () => {
  // The nodes travel by REFERENCE, as a command that writes only `animation` leaves them:
  // rebuilding them here would have `syncNode` write every transform again and hide the defect.
  const scene = stagedScene()

  const unbound = stagedOn(scene)
  unbound.setPlayhead(2 * SECOND)
  expect(objectOf(unbound, 'cam')?.position.x).toBeCloseTo(5, 4)
  unbound.apply({
    ...scene,
    animation: {
      ...scene.animation,
      shots: scene.animation.shots.map(shot => ({ ...shot, motion: undefined })),
    },
  })
  expect(objectOf(unbound, 'cam')?.position.x).toBeCloseTo(0, 4)
  unbound.dispose()

  const deleted = stagedOn(scene)
  deleted.setPlayhead(2 * SECOND)
  deleted.apply({ ...scene, nodes: scene.nodes.filter(node => node.type !== 'path') })
  expect(objectOf(deleted, 'cam')?.position.x).toBeCloseTo(0, 4)
  deleted.dispose()
})

/**
 * A camera may watch another that is itself riding a rail, and the watcher's line can outrank
 * the rider's — so every rail runs before any aim, rather than one camera at a time.
 */
it('aims at where the camera it watches stands ON its rail, not where the document holds it', () => {
  const engine = stagedOn({
    ...EMPTY_SCENE,
    nodes: [
      {
        ...cameraNodeFixture('watcher'),
        transform: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 0, z: 10 } },
      },
      cameraNodeFixture('rider'),
      pathNodeFixture('rail', {
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
        ],
      }),
    ],
    animation: {
      ...EMPTY_TIMELINE,
      // The watcher FIRST, which is the order that puts its line above the rider's.
      shots: [
        cameraShot('watching', {
          cameraId: 'watcher',
          start: 0,
          duration: 4 * SECOND,
          target: { kind: 'node', nodeId: 'rider' },
        }),
        cameraShot('riding', {
          cameraId: 'rider',
          start: 0,
          duration: 4 * SECOND,
          motion: { pathId: 'rail', easing: 'linear', from: 0, to: 1 },
        }),
      ],
    },
  })

  engine.setPlayhead(2 * SECOND)
  const watcher = objectOf(engine, 'watcher')
  const rider = objectOf(engine, 'rider')
  if (!watcher || !rider) throw new Error('both cameras stand in the scene')

  expect(rider.position.x).toBeCloseTo(5, 4)
  const aim = new Vector3(0, 0, -1).applyQuaternion(watcher.quaternion)
  expect(aim.angleTo(rider.position.clone().sub(watcher.position))).toBeCloseTo(0, 4)
  engine.dispose()
})

/**
 * And when the SHOT itself goes — deleted, or the undo of one just opened. The camera leaves
 * the roll this pass walks, so nothing reached it at all and it stayed on its rail.
 */
it('puts the camera back where the document holds it once no shot names it any more', () => {
  const scene = stagedScene()
  const engine = stagedOn(scene)
  engine.setPlayhead(2 * SECOND)
  expect(objectOf(engine, 'cam')?.position.x).toBeCloseTo(5, 4)

  engine.apply({ ...scene, animation: { ...scene.animation, shots: [] } })
  expect(objectOf(engine, 'cam')?.position.x).toBeCloseTo(0, 4)
  engine.dispose()
})

/**
 * A rail is a working aid like the grid: the preview and the film both draw through
 * `hideWorkshop`, and a line with a knob per point ran across every frame of both.
 */
it('hides the rails for a pass that shows what a camera films', () => {
  const engine = staged()
  const rail = objectOf(engine, 'rail')
  // `hideWorkshop` is what both the inset pass and `renderFilm` take; reached here directly,
  // since neither of the two can run without a GL context.
  const restore: () => void = Reflect.get(engine, 'hideWorkshop').call(engine)

  expect(rail?.visible).toBe(false)
  restore()
  expect(rail?.visible).toBe(true)
  engine.dispose()
})

/**
 * The gizmo stands where the object stands, so a camera aimed at a selected node filled its
 * preview — and its film — with the arrows instead of the node. Stood in for: the real one
 * needs a GL canvas, and `hideWorkshop` asks it for nothing but its helper.
 */
it('hides the transform gizmo for a pass that shows what a camera films', () => {
  const engine = staged()
  const helper = new Group()
  Reflect.set(engine, 'gizmo', { getHelper: () => helper })
  const restore: () => void = Reflect.get(engine, 'hideWorkshop').call(engine)

  expect(helper.visible).toBe(false)
  restore()
  expect(helper.visible).toBe(true)

  // Back to none before disposing: the stand-in answers `getHelper` and nothing else, and
  // teardown unsubscribes from the real one.
  Reflect.set(engine, 'gizmo', null)
  engine.dispose()
})

/**
 * A knob per control point on every rail of the scene is what buries a five-camera sequence,
 * and only a SELECTED rail hands its points to the gizmo anyway — see `pathPointAt`.
 */
it('shows a rail its knobs only while it is the selected one', () => {
  const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
  const scene = {
    ...EMPTY_SCENE,
    nodes: [
      pathNodeFixture('rail', {
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
        ],
      }),
    ],
  }
  const knobs = (): boolean[] =>
    (objectOf(engine, 'rail')?.children ?? [])
      .filter(child => child.name.startsWith('path-knob-'))
      .map(knob => knob.visible)

  engine.apply(scene)
  expect(knobs()).toEqual([false, false])

  engine.apply({ ...scene, selectedIds: ['rail'] })
  expect(knobs()).toEqual([true, true])
  engine.dispose()
})

/**
 * What ties a rail to its camera on screen: the line does start at the camera and follow its
 * axis, but unmarked it reads as somebody else's.
 */
it('shows a rail its knobs when the camera riding it is the one selected', () => {
  const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
  const scene = {
    ...EMPTY_SCENE,
    nodes: [
      cameraNodeFixture('cam-a'),
      pathNodeFixture('rail', {
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
        ],
      }),
    ],
    animation: {
      ...EMPTY_TIMELINE,
      shots: [
        cameraShot('shot-1', {
          motion: { pathId: 'rail', easing: 'linear', from: 0, to: 1 },
        }),
      ],
    },
  }
  const knobs = (): boolean[] =>
    (objectOf(engine, 'rail')?.children ?? [])
      .filter(child => child.name.startsWith('path-knob-'))
      .map(knob => knob.visible)

  engine.apply(scene)
  expect(knobs()).toEqual([false, false])

  engine.apply({ ...scene, selectedIds: ['cam-a'] })
  expect(knobs()).toEqual([true, true])
  engine.dispose()
})

it('leaves a camera with no shot exactly where its transform puts it', () => {
  const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
  engine.apply({ ...EMPTY_SCENE, nodes: [cameraNodeFixture('cam')] })
  engine.setPlayhead(3 * SECOND)

  expect(objectOf(engine, 'cam')?.position.x).toBe(0)
  engine.dispose()
})
// @vitest-environment jsdom

it('reuses unchanged shadow maps while a camera travels on a rail', () => {
  const engine = staged()
  const redraw = vi.spyOn(engine['viewport'], 'requestRender')
  const refresh = vi.spyOn(engine['viewport'], 'requestCameraRender')

  engine.setPlayhead(SECOND)

  // The shot moves what is looked FROM, and a shadow map is drawn from a light.
  expect(redraw).not.toHaveBeenCalled()
  expect(refresh).toHaveBeenCalledOnce()
  engine.dispose()
})

it('refreshes shadow maps when a camera shot carries a shadow caster', () => {
  const scene = stagedScene()
  const engine = stagedOn({ ...scene, nodes: [...scene.nodes, meshNode('carried', 'cam')] })
  const redraw = vi.spyOn(engine['viewport'], 'requestRender')

  engine.setPlayhead(SECOND)

  expect(redraw).toHaveBeenCalledOnce()
  engine.dispose()
})
