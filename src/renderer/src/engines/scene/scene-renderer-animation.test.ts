import { AnimationClip, Bone, Group, Mesh, SphereGeometry, VectorKeyframeTrack } from 'three'
import type { Object3D } from 'three'
import { BONE_SHAPES } from './boneShapes'
import { describe, expect, it, vi } from 'vitest'
import { clipLane, embeddedClip, type ClipRef } from '@shared/domain/scene'
import { SceneRenderer } from './SceneRenderer'
import type { BvhBuilder } from './bvhBuilder'
import type * as ModelCache from './modelCache'
import { cameraNodeFixture, meshNode, modelNodeFixture } from './scene-fixtures'
import { STUDIO_METADATA_KEY } from '@shared/domain/studioMetadata'
import { EMPTY_SCENE, IDENTITY_TRANSFORM, type SceneNode } from './sceneState'
import {
  EMPTY_TIMELINE,
  type AnimationTimeline,
  type AnimationTrack,
} from '@shared/domain/animation'
import { SECOND } from '@shared/domain/time'
import { animationTrack } from './animation-fixtures'

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

/** The same, carrying a skeleton — which is where a role is read from now, never a document. */
function riggedModel(clips: AnimationClip[], roles?: Record<string, string>): Group {
  const root = animatedModel(clips)
  const hips = new Bone()
  hips.name = 'b0'
  hips.position.set(0, 1, 0)
  const spine = new Bone()
  spine.name = 'b1'
  hips.add(spine)
  root.add(hips)
  if (roles) root.userData = { iastudio: { roles } }

  return root
}

const cubeOf = (root: Group): Object3D => {
  const cube = root.getObjectByName('cube')
  if (!cube) throw new Error('the fixture builds one named child')
  return cube
}

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

/** A block on `walk`, since that is the clip every fixture of this file brings. */
const walkBlock = (extra: Partial<ClipRef> = {}): ClipRef => embeddedClip('block-1', 'walk', extra)

describe('SceneRenderer and the clips a model brought', () => {
  it('poses the model where the document says, without waiting for a frame', async () => {
    const loaded = animatedModel([walk()])
    const engine = withModel(loaded)

    engine.apply({
      ...EMPTY_SCENE,
      nodes: [modelNode(walkBlock({ offset: 0.5 }))],
    })

    // The file lands a tick after the sync that built its holder; the pose lands with it.
    await vi.waitFor(() => expect(cubeOf(loaded).position.x).toBeCloseTo(0.5, 5))
    engine.dispose()
  })

  it('leaves a model at rest when the document names no clip', async () => {
    const loaded = animatedModel([walk()])
    const engine = withModel(loaded)

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })

    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())
    expect(cubeOf(loaded).position.x).toBe(0)
    engine.dispose()
  })

  it('follows the document when the head is moved on a model already on stage', async () => {
    const loaded = animatedModel([walk()])
    const engine = withModel(loaded)

    engine.apply({
      ...EMPTY_SCENE,
      nodes: [modelNode(walkBlock({ offset: 0 }))],
    })
    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())

    engine.apply({
      ...EMPTY_SCENE,
      nodes: [modelNode(walkBlock({ offset: 0.25 }))],
    })

    expect(cubeOf(loaded).position.x).toBeCloseTo(0.25, 5)
    engine.dispose()
  })

  /**
   * A held preview has no loop of its own to write the pose again, and applying the document
   * poses the model from the scene's head: editing the speed of the very block being looked at
   * would otherwise snap the character back to where the band stands.
   */
  it('keeps a pose the preview is held at when the document is applied again', async () => {
    const loaded = animatedModel([walk()])
    const engine = withModel(loaded)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(walkBlock({ offset: 0 }))] })
    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())

    engine.setPreview({ nodeId: 'a', clipId: 'block-1', at: 0.4, playing: false })
    expect(cubeOf(loaded).position.x).toBeCloseTo(0.4, 5)

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(walkBlock({ offset: 0, speed: 2 }))] })

    expect(cubeOf(loaded).position.x).toBeCloseTo(0.8, 5)
    engine.dispose()
  })

  it('gives the model back to the head once the preview is dropped', async () => {
    const loaded = animatedModel([walk()])
    const engine = withModel(loaded)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(walkBlock({ offset: 0 }))] })
    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())
    engine.setPreview({ nodeId: 'a', clipId: 'block-1', at: 0.4, playing: false })

    engine.setPreview(null)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(walkBlock({ offset: 0 }))] })

    expect(cubeOf(loaded).position.x).toBeCloseTo(0, 5)
    engine.dispose()
  })

  it('takes a model with no clip at all without complaining', async () => {
    const loaded = animatedModel([])
    const engine = withModel(loaded)

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })

    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())
    engine.dispose()
  })

  it('lets go of the mixer when the node goes, so a released model keeps no bones alive', async () => {
    const loaded = animatedModel([walk()])
    const engine = withModel(loaded)

    engine.apply({
      ...EMPTY_SCENE,
      nodes: [modelNode(walkBlock({ offset: 0.5 }))],
    })
    await vi.waitFor(() => expect(cubeOf(loaded).position.x).toBeCloseTo(0.5, 5))

    engine.apply(EMPTY_SCENE)

    // With no action left driving it, three puts back the value the file was loaded with.
    expect(cubeOf(loaded).position.x).toBe(0)
    engine.dispose()
  })
})

describe('SceneRenderer and the bones a rig carries', () => {
  const rigged = (): Group => {
    const root = animatedModel([walk()])
    const bone = new Bone()
    bone.name = 'spine'
    root.add(bone)
    return root
  }

  /**
   * The helpers hang beside the nodes, so the scene is where they are counted — reached by
   * walking up from the mounted model rather than into the engine: holder, then scene.
   */
  const bonesAround = (loaded: Group): Object3D[] =>
    (loaded.parent?.parent?.children ?? []).filter(child => child.name === BONE_SHAPES)

  it('draws no bones for a model that carries none', async () => {
    const loaded = animatedModel([walk()])
    const engine = withModel(loaded)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })

    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())
    expect(bonesAround(loaded)).toHaveLength(0)
    engine.dispose()
  })

  // The solids and not three's `SkeletonHelper`: its lines showed through them, and a skeleton
  // read as half wireframe — measured on screen. The helper is kept, never hung in the scene.
  it('hangs the bones beside the nodes for a rigged model, hidden until asked for', async () => {
    const loaded = rigged()
    const engine = withModel(loaded)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })

    await vi.waitFor(() => expect(bonesAround(loaded)).toHaveLength(1))
    expect(bonesAround(loaded)[0]?.visible).toBe(false)
    expect(
      (loaded.parent?.parent?.children ?? []).filter(child => child.type === 'SkeletonHelper'),
    ).toHaveLength(0)

    engine.setSkeletons(true)
    expect(bonesAround(loaded)[0]?.visible).toBe(true)
    engine.dispose()
  })

  // What POSING is, as opposed to editing the rest: the bone moves and its skin follows, so
  // nothing of the file's own skeleton is touched.
  it('poses one bone where a hand asked', async () => {
    const loaded = riggedModel([walk()])
    const engine = withModel(loaded)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })
    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())

    engine.poseBone('a', 'b1', { ...IDENTITY_TRANSFORM, position: { x: 0, y: 0.5, z: 0 } })

    expect(loaded.getObjectByName('b1')?.position.y).toBeCloseTo(0.5, 5)
    engine.dispose()
  })

  /**
   * A sword in a hand: the node still hangs from the CHARACTER, and the socket says which of its
   * bones to follow. Hung from the model itself, it stood still while the arm swung.
   */
  it('hangs a node at the socket transform on the bone that socket names', async () => {
    const loaded = riggedModel([walk()])
    const rest = {
      ...IDENTITY_TRANSFORM,
      position: { x: 0.2, y: 0.3, z: 0.4 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
    }
    loaded.userData = {
      [STUDIO_METADATA_KEY]: {
        character: {
          sockets: [{ id: 'hand', name: 'Main', bone: 'b1', rest }],
        },
      },
    }
    const engine = withModel(loaded)
    const sword = { ...meshNode('sword'), parentId: 'a', attach: { socket: 'hand' } }

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null), sword] })
    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null), sword] })

    await vi.waitFor(() => expect(loaded.getObjectByName('sword')?.parent?.parent?.name).toBe('b1'))
    expect(loaded.getObjectByName('sword')?.parent?.position.toArray()).toEqual([0.2, 0.3, 0.4])
    expect(loaded.getObjectByName('sword')?.parent?.rotation.toArray().slice(0, 3)).toEqual([
      0.1, 0.2, 0.3,
    ])
    engine.dispose()
  })

  it('takes the bones away with the node they belonged to', async () => {
    const loaded = rigged()
    const engine = withModel(loaded)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })
    await vi.waitFor(() => expect(bonesAround(loaded)).toHaveLength(1))

    // Kept before the node goes: the model is unparented with it, and the walk up would end early.
    const scene = loaded.parent?.parent
    engine.apply(EMPTY_SCENE)

    expect((scene?.children ?? []).filter(child => child.name === BONE_SHAPES)).toHaveLength(0)
    engine.dispose()
  })
})

describe('SceneRenderer and the timeline over the scene', () => {
  const cube = meshNode('cube-1')

  const timelineWith = (value: number): AnimationTimeline => ({
    ...EMPTY_TIMELINE,
    tracks: [
      {
        id: 'track-1',
        name: 'Cube position',
        index: 0,
        muted: false,
        solo: false,
        locked: false,
        target: { nodeId: 'cube-1', property: 'position' },
        keys: [{ time: 0, value: { x: value, y: 0, z: 0 } }],
      },
    ],
  })

  /** The engine names its objects after their node, which is how one is found from outside. */
  const objectOf = (engine: SceneRenderer, id: string): Object3D | undefined => {
    const scene: { children: Object3D[] } = Reflect.get(engine, 'viewport').scene
    return scene.children.find(child => child.name === id)
  }

  it('lays what the tracks add over the pose the node holds', () => {
    const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
    engine.apply({ ...EMPTY_SCENE, nodes: [cube], animation: timelineWith(4) })

    expect(objectOf(engine, 'cube-1')?.position.x).toBe(4)
    engine.dispose()
  })

  it('follows the head without the document changing at all', () => {
    const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
    const one = timelineWith(0).tracks[0]
    if (!one) throw new Error('the fixture builds one track')

    const timeline: AnimationTimeline = {
      ...EMPTY_TIMELINE,
      tracks: [
        {
          ...one,
          keys: [
            { time: 0, value: { x: 0, y: 0, z: 0 } },
            { time: 2, value: { x: 10, y: 0, z: 0 } },
          ],
        },
      ],
    }
    engine.apply({ ...EMPTY_SCENE, nodes: [cube], animation: timeline })
    expect(objectOf(engine, 'cube-1')?.position.x).toBe(0)

    engine.setPlayhead(1)
    expect(objectOf(engine, 'cube-1')?.position.x).toBeCloseTo(5, 5)
    engine.dispose()
  })

  it('leaves a scene with no track exactly where its nodes stand', () => {
    const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
    engine.apply({ ...EMPTY_SCENE, nodes: [cube] })
    engine.setPlayhead(3)

    expect(objectOf(engine, 'cube-1')?.position.x).toBe(0)
    engine.dispose()
  })
})

/**
 * A shadow map is drawn from a light, never from a camera: a head that moves only what is looked
 * FROM can reuse the maps of the frame before, which a scrub pays on every frame otherwise.
 */
describe('SceneRenderer shadow maps during playback', () => {
  const travelling = (nodeId: string): AnimationTrack =>
    animationTrack(
      `${nodeId}-position`,
      'position',
      [
        { time: 0, value: { x: 0, y: 0, z: 0 } },
        { time: SECOND, value: { x: 1, y: 0, z: 0 } },
      ],
      { target: { nodeId, property: 'position' } },
    )

  const played = (nodes: SceneNode[], track: AnimationTrack): SceneRenderer => {
    const engine = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, bvh })
    engine.apply({
      ...EMPTY_SCENE,
      nodes,
      animation: { ...EMPTY_TIMELINE, tracks: [track] },
    })
    return engine
  }

  it('reuses unchanged shadow maps when only a camera moves', () => {
    const engine = played(
      [cameraNodeFixture('camera-1'), meshNode('cube-1')],
      travelling('camera-1'),
    )
    const redraw = vi.spyOn(engine['viewport'], 'requestRender')
    const refresh = vi.spyOn(engine['viewport'], 'requestCameraRender')

    engine.setPlayhead(SECOND / 2)

    expect(redraw).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
    engine.dispose()
  })

  it('refreshes shadow maps when an animated mesh moves', () => {
    const engine = played([cameraNodeFixture('camera-1'), meshNode('cube-1')], travelling('cube-1'))
    const redraw = vi.spyOn(engine['viewport'], 'requestRender')

    engine.setPlayhead(SECOND / 2)

    expect(redraw).toHaveBeenCalledOnce()
    engine.dispose()
  })

  it('refreshes shadow maps when a camera carries a shadow caster', () => {
    const engine = played(
      [cameraNodeFixture('camera-1'), meshNode('cube-1', 'camera-1')],
      travelling('camera-1'),
    )
    const redraw = vi.spyOn(engine['viewport'], 'requestRender')

    engine.setPlayhead(SECOND / 2)

    expect(redraw).toHaveBeenCalledOnce()
    engine.dispose()
  })

  it('refreshes shadow maps while a model clip can deform a caster', async () => {
    const onClips = vi.fn()
    const engine = new SceneRenderer({
      onSelect: () => {},
      onTransform: () => {},
      onClips,
      loadModel: () => Promise.resolve(animatedModel([walk()])),
      bvh,
    })
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(walkBlock())] })
    await vi.waitFor(() => expect(onClips).toHaveBeenCalled())
    const redraw = vi.spyOn(engine['viewport'], 'requestRender')

    engine.setPlayhead(SECOND / 2)

    expect(redraw).toHaveBeenCalledOnce()
    engine.dispose()
  })
})
