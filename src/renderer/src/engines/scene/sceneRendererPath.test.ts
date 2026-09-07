import {
  AnimationClip,
  Bone,
  Group,
  Mesh,
  type PerspectiveCamera,
  SphereGeometry,
  VectorKeyframeTrack,
} from 'three'
import type { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { clipLane, type ClipRef } from '@shared/domain/scene'
import { SceneRenderer } from './SceneRenderer'
import type { BvhBuilder } from './bvhBuilder'
import type * as ModelCache from './modelCache'
import { cameraNodeFixture, meshNode, modelNodeFixture, pathNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE, IDENTITY_TRANSFORM, type SceneNode, type SceneState } from './sceneState'
import { EMPTY_TIMELINE, type AnimationTimeline } from '@shared/domain/animation'

/**
 * The instance the scene mounts is a clone, which nothing outside the engine can reach. Handing
 * the source back in its place is what makes the mixer's work observable — and it is the source's
 * clips that drive it either way, since `Object3D.copy` carries none.
 */
vi.mock('./modelCache', async importOriginal => ({
  ...(await importOriginal<typeof ModelCache>()),
  instanceOf: (source: Object3D) => source,
}))

/** A cube travelling one unit along X over one second. */
const walk = (name = 'walk'): AnimationClip =>
  new AnimationClip(name, 1, [new VectorKeyframeTrack('cube.position', [0, 1], [0, 0, 0, 1, 0, 0])])

function animatedModel(clips: AnimationClip[]): Group {
  const root = new Group()
  const cube = new Mesh(new SphereGeometry(1, 4, 4))
  cube.name = 'cube'
  root.add(cube)
  root.animations = clips
  return root
}

/* The same, carrying a skeleton — which is where a role is read from now, never a document. */
/** No worker under vitest, and no tree is what this file is about. */
const bvh: BvhBuilder = { accelerate: () => Promise.resolve(), dispose: () => {} }

function withModel(loaded: Group): SceneRenderer {
  return new SceneRenderer({
    onSelect: () => {},
    onTransform: () => {},
    loadModel: () => Promise.resolve(loaded),
    bvh,
  })
}

const modelNode = (clip: ClipRef | null) => ({
  ...modelNodeFixture('a'),
  model: { assetId: 'asset-1', ...(clip && { lanes: [clipLane('main', [clip])] }) },
})

describe('SceneRenderer and a rail drawn click by click', () => {
  const railScene = (extra: Partial<SceneState> = {}): SceneState => ({
    ...EMPTY_SCENE,
    nodes: [pathNodeFixture('rail')],
    selectedIds: ['rail'],
    ...extra,
  })

  /** An engine whose pointer lands dead centre of the view, having no canvas to read one off. */
  const aiming = (
    scene: SceneState,
    ndc: { x: number; y: number } | null = { x: 0, y: 0 },
  ): SceneRenderer => {
    const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
    engine.apply(scene)

    const viewport: { camera: PerspectiveCamera } = Reflect.get(engine, 'viewport')
    // What a frame does before any click can land. Left out, the view's matrix still holds the
    // placement it was BUILT with, and every ray leaves the origin looking down -Z.
    viewport.camera.updateMatrixWorld()
    Object.assign(viewport, { pointerNdcOf: () => ndc })
    return engine
  }

  /** Ends at DIFFERENT heights, so which end anchors the fallback plane is observable. */
  const SLOPED = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 3, z: -5 },
  ]

  const spotOf = (
    engine: SceneRenderer,
  ): { nodeId: string; point: { x: number; y: number; z: number } } | null =>
    Reflect.get(engine, 'railSpotAt').call(engine, new MouseEvent('pointerup'))

  /**
   * The height comes from the rail's LAST point, and the frame from the rail: a sloped rail a
   * hundred units out reads (3, 3, 3) of the world as (-97, 3, 3) of its own.
   */
  it('lays the point in the rail’s OWN frame, level with the end it is growing from', () => {
    const engine = aiming(
      railScene({
        nodes: [
          {
            ...pathNodeFixture('rail', { points: SLOPED }),
            transform: { ...IDENTITY_TRANSFORM, position: { x: 100, y: 0, z: 0 } },
          },
        ],
      }),
    )

    const spot = spotOf(engine)
    expect(spot?.nodeId).toBe('rail')
    expect(spot?.point.y).toBeCloseTo(3, 4)
    expect(spot?.point.x).toBeCloseTo(-97, 4)
    engine.dispose()
  })

  /**
   * The scenery wins over the fallback plane, which is what makes the gesture read as "I clicked
   * on that": a click on a crate lays the point ON the crate, not at the height of the last one.
   */
  it('lays the point on what the ray meets, above the level of the point before it', () => {
    const engine = aiming(railScene({ nodes: [pathNodeFixture('rail'), meshNode('crate')] }))

    // The unit cube of the fixture sits at the origin, and the view looks down at it from
    // (5, 5, 5) — so the ray meets its corner well above the y = 0 the rail's last point holds.
    expect(spotOf(engine)?.point.y).toBeCloseTo(0.5, 4)
    engine.dispose()
  })

  /**
   * Extending whichever rail came first would pose a point on one nobody aimed at, and a gesture
   * repeated ten times would scatter half of them. Neither too few nor too many will do.
   */
  it('answers nothing unless exactly ONE rail is being worked on', () => {
    const none = aiming(railScene({ selectedIds: [] }))
    expect(spotOf(none)).toBeNull()
    none.dispose()

    const both = aiming(
      railScene({
        nodes: [pathNodeFixture('rail'), pathNodeFixture('other')],
        selectedIds: ['rail', 'other'],
      }),
    )
    expect(spotOf(both)).toBeNull()
    both.dispose()
  })

  // Routine in a quad view: `pointerNdcOf` answers nothing for a pointer outside every pane.
  it('answers nothing for a pointer the viewport places nowhere', () => {
    const engine = aiming(railScene(), null)

    expect(spotOf(engine)).toBeNull()
    engine.dispose()
  })

  /**
   * The three things a ray walks past, and each reappears THROUGH a parent that passed: the
   * filter has to read the ancestors, not the roots handed to `intersectObjects`.
   */
  describe('and what the ray is not allowed to land on', () => {
    const LEVEL_SPOT = { x: 0, y: 0, z: 0 }

    const holder = (id: string): SceneNode => ({
      ...meshNode(id),
      castShadow: false,
      receiveShadow: false,
      type: 'group',
    })

    it('walks past a node the outliner has hidden, however solid it still is', () => {
      const crate = meshNode('crate')
      const engine = aiming(railScene({ nodes: [pathNodeFixture('rail'), crate] }))
      expect(spotOf(engine)?.point.y).toBeCloseTo(0.5, 4)

      engine.apply(railScene({ nodes: [pathNodeFixture('rail'), { ...crate, visible: false }] }))
      expect(spotOf(engine)?.point).toMatchObject(LEVEL_SPOT)
      engine.dispose()
    })

    /**
     * A camera sits ON the rail it rides, and selecting it is what makes that rail the one worked
     * on — so its body is squarely in the way of the very gesture that extends the rail.
     */
    it('walks past the body of a camera, which is a marker and not scenery', () => {
      const engine = aiming(
        railScene({
          nodes: [pathNodeFixture('rail'), { ...cameraNodeFixture('cam'), parentId: null }],
        }),
      )

      expect(spotOf(engine)?.point).toMatchObject(LEVEL_SPOT)
      engine.dispose()
    })

    /** A rail inside a group is reached through the group, and its knobs are 14 cm spheres. */
    it('walks past its own knobs when the rail hangs inside a group', () => {
      const engine = aiming(
        railScene({
          nodes: [
            holder('holder'),
            { ...pathNodeFixture('rail', { points: SLOPED }), parentId: 'holder' },
          ],
        }),
      )

      // The knob on the last point stands at y = 3, right where the fallback plane is: a hit on
      // its surface would read a radius above it.
      expect(spotOf(engine)?.point.y).toBeCloseTo(3, 4)
      engine.dispose()
    })
  })
})

describe('SceneRenderer and a track on one bone', () => {
  const boneTimeline = (value: number): AnimationTimeline => ({
    ...EMPTY_TIMELINE,
    tracks: [
      {
        id: 'track-bone',
        name: 'arm',
        index: 0,
        muted: false,
        solo: false,
        locked: false,
        target: { nodeId: 'a', bone: 'spine', property: 'position' },
        keys: [{ time: 0, value: { x: value, y: 0, z: 0 } }],
      },
    ],
  })

  it('moves the bone the track names, and leaves the model where it stands', async () => {
    const loaded = animatedModel([walk()])
    const bone = new Bone()
    bone.name = 'spine'
    loaded.add(bone)

    const engine = withModel(loaded)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)], animation: boneTimeline(3) })

    await vi.waitFor(() => expect(bone.position.x).toBe(3))
    // The model itself was never a target of that track.
    expect(loaded.parent?.position.x).toBe(0)
    engine.dispose()
  })

  it('lays the track over the pose the FILE gave the bone, not over zero', async () => {
    const loaded = animatedModel([walk()])
    const bone = new Bone()
    bone.name = 'spine'
    bone.position.set(10, 0, 0)
    loaded.add(bone)

    const engine = withModel(loaded)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)], animation: boneTimeline(3) })

    await vi.waitFor(() => expect(bone.position.x).toBe(13))
    engine.dispose()
  })
})
// @vitest-environment jsdom
