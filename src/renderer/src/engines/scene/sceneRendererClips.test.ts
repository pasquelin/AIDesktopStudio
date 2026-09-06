import { retargetFitOf, wireClipOf } from './retarget'
import { AnimationClip, Bone, Group, Mesh, SphereGeometry, VectorKeyframeTrack } from 'three'
import type { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { assetClip, bundledClip, clipLane, type ClipRef } from '@shared/domain/scene'
import { bundledAnimationUrl } from '@shared/domain/animationLibrary'
import { assetUrl } from '@shared/domain/asset'
import {
  skeletonSignatureOf,
  skeletonTopologySignatureOf,
  type SkeletonProfile,
} from '@shared/domain/skeletonProfile'
import { SceneRenderer } from './SceneRenderer'
import type { BvhBuilder } from './bvhBuilder'
import type { Retarget } from './retarget'
import type * as ModelCache from './modelCache'
import { modelNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE } from './sceneState'

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

const modelNode = (clip: ClipRef | null) => ({
  ...modelNodeFixture('a'),
  model: { assetId: 'asset-1', ...(clip && { lanes: [clipLane('main', [clip])] }) },
})

describe('SceneRenderer and the animations the app ships with', () => {
  /** What the retargeting port is asked, and what it hands back — here, the clips unchanged. */
  const straightThrough = (): Retarget & {
    asked: { target: Object3D; clips: string[] }[]
    learnt: SkeletonProfile[]
  } => {
    const asked: { target: Object3D; clips: string[] }[] = []
    const learnt: SkeletonProfile[] = []
    return {
      asked,
      learnt,
      adapt: (target, _source, clips) => {
        asked.push({ target, clips: clips.map(clip => clip.name) })
        return Promise.resolve([...clips])
      },
      // Read through the corrections a transfer would use — the double has none to apply.
      fitOf: (target, source) => retargetFitOf(target, source),
      remember: profile => void learnt.push(profile),
      dispose: () => {},
    }
  }

  function withShipped(
    loaded: Group,
    shipped: Group | Error,
    retarget: Retarget,
  ): { engine: SceneRenderer; asked: string[]; reported: ReturnType<typeof vi.fn> } {
    const asked: string[] = []
    const reported = vi.fn()
    const engine = new SceneRenderer({
      onSelect: () => {},
      onTransform: () => {},
      loadModel: () => Promise.resolve(loaded),
      loadAnimation: url => {
        asked.push(url)
        return shipped instanceof Error ? Promise.reject(shipped) : Promise.resolve(shipped)
      },
      onClips: reported,
      retarget,
      bvh,
    })
    return { engine, asked, reported }
  }

  const shippedBlock = (extra: Partial<ClipRef> = {}): ClipRef =>
    bundledClip('block-1', 'Capoeira', extra)

  it('keeps duplicate source names in file order and releases preview clips', async () => {
    const { engine } = withShipped(
      animatedModel([walk('same'), new AnimationClip('same', 2, [])]),
      animatedModel([]),
      straightThrough(),
    )
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })
    await vi.waitFor(() => expect(engine.inspectMotion('a')).not.toBeNull())
    expect(engine.inspectMotion('a')?.clips.map(clip => clip.duration)).toEqual([1, 2])
    engine.installMotion('a', 'preview', wireClipOf(walk()))
    expect(engine.clipLengthsOf('a').preview).toBe(1)
    engine.removeMotion('a', 'preview')
    expect(engine.clipLengthsOf('a').preview).toBeUndefined()
    engine.dispose()
  })

  it('transfers the selected source clip instead of the first clip', async () => {
    const retarget = straightThrough()
    const { engine } = withShipped(
      animatedModel([]),
      animatedModel([walk('first'), walk('second')]),
      retarget,
    )
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })
    await vi.waitFor(() => expect(engine.inspectMotion('a')).not.toBeNull())
    engine.useGraphClips('a', [
      { key: 'chosen', url: assetUrl('motion'), label: 'Chosen', clipIndex: 1 },
    ])
    await vi.waitFor(() => expect(retarget.asked[0]?.clips).toEqual(['second']))
    engine.dispose()
  })

  it('aborts a removed request and refuses its late result after the same key returns', async () => {
    const retarget = straightThrough()
    const answers: ((clips: AnimationClip[]) => void)[] = []
    const signals: (AbortSignal | undefined)[] = []
    retarget.adapt = (_target, _source, _clips, watch) =>
      new Promise(resolve => {
        answers.push(resolve)
        signals.push(watch?.signal)
      })
    const { engine } = withShipped(animatedModel([]), animatedModel([walk()]), retarget)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock())] })
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })
    expect(signals[0]?.aborted).toBe(true)
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock())] })
    await vi.waitFor(() => expect(answers).toHaveLength(2))
    answers[0]?.([walk('stale')])
    await Promise.resolve()
    expect(engine.clipLengthsOf('a')['bundled:Capoeira']).toBeUndefined()
    answers[1]?.([walk('fresh')])
    await vi.waitFor(() => expect(engine.clipLengthsOf('a')['bundled:Capoeira']).toBe(1))
    engine.dispose()
  })

  // The whole point of the feature: a character brings no such clip, and the file that does was
  // authored for another skeleton entirely.
  it('reads the shipped file, replays it on the model, and plays the block', async () => {
    const loaded = animatedModel([])
    const retarget = straightThrough()
    const { engine, asked } = withShipped(loaded, animatedModel([walk('NlaTrack')]), retarget)

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock({ offset: 0.5 }))] })

    await vi.waitFor(() => expect(cubeOf(loaded).position.x).toBeCloseTo(0.5, 5))
    expect(asked).toEqual([bundledAnimationUrl('Capoeira')])
    // The model's own instance, since that is the skeleton the clip has to speak to.
    expect(retarget.asked[0]?.target).toBe(loaded.parent)
    engine.dispose()
  })

  // `NlaTrack` is what Tripo spells and Uthana spells nothing at all: the studio names its blocks.
  it('never lets the name inside the file reach what the model plays', async () => {
    const loaded = animatedModel([])
    const retarget = straightThrough()
    const { engine, reported } = withShipped(loaded, animatedModel([walk('NlaTrack')]), retarget)

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock({ offset: 0.5 }))] })

    await vi.waitFor(() => expect(cubeOf(loaded).position.x).toBeGreaterThan(0))
    // `NlaTrack` goes to the port, because that is what the file holds — and it reaches nothing
    // else: the block is filed under the FOLDER, and the model's own list stays empty.
    expect(retarget.asked[0]?.clips).toEqual(['NlaTrack'])
    expect(reported).toHaveBeenLastCalledWith('a', [], { 'bundled:Capoeira': 1 })
    engine.dispose()
  })

  // Loading is the expensive half — a shipped animation carries a whole character with it — and
  // every edit of a lane applies again.
  it('reads a shipped animation once, however often the lanes are applied', async () => {
    const loaded = animatedModel([])
    const { engine, asked } = withShipped(
      loaded,
      animatedModel([walk('NlaTrack')]),
      straightThrough(),
    )

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock())] })
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(bundledClip('block-2', 'Capoeira'))] })

    expect(asked).toEqual([bundledAnimationUrl('Capoeira')])
    engine.dispose()
  })

  /** Two characters on the same asset, each with its own block on the same shipped animation. */
  const twoDancers = (clip: ClipRef) => [
    { ...modelNode(clip), id: 'a' },
    { ...modelNode({ ...clip, id: 'block-2' }), id: 'b' },
  ]

  // Case 18 of the issue: the file itself is read once, not once per character.
  it('reads one animation file however many characters play it', async () => {
    const retarget = straightThrough()
    const { engine, asked } = withShipped(
      animatedModel([]),
      animatedModel([walk('NlaTrack')]),
      retarget,
    )

    engine.apply({ ...EMPTY_SCENE, nodes: twoDancers(shippedBlock()) })

    // Both characters were posed from it, and only one read paid for the two.
    await vi.waitFor(() => expect(retarget.asked).toHaveLength(2))
    expect(asked).toEqual([bundledAnimationUrl('Capoeira')])
    engine.dispose()
  })

  // Held while a block still names it, and no longer: what the second dancer saved is only worth
  // having if the file goes when the last block does.
  it('reads it again once no block names it any more', async () => {
    const { engine, asked } = withShipped(
      animatedModel([]),
      animatedModel([walk('NlaTrack')]),
      straightThrough(),
    )

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock())] })
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(null)] })
    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock())] })

    await vi.waitFor(() => expect(asked).toHaveLength(2))
    engine.dispose()
  })

  // Case 6 of the issue: a project file dropped for its motion. It carries a whole character, and
  // the scene must show none of it — only the model already standing there, moving.
  it('plays a project asset without ever letting its mesh into the scene', async () => {
    const loaded = animatedModel([])
    const source = animatedModel([walk('NlaTrack')])
    const { engine, asked } = withShipped(loaded, source, straightThrough())

    engine.apply({
      ...EMPTY_SCENE,
      nodes: [modelNode(assetClip('block-1', 'asset-9', 'jig', { offset: 0.5 }))],
    })

    await vi.waitFor(() => expect(cubeOf(loaded).position.x).toBeCloseTo(0.5, 5))
    expect(asked).toEqual([assetUrl('asset-9')])
    expect(source.parent).toBeNull()
    engine.dispose()
  })

  // A role put right by hand lives in the character's own FILE — glTF has no other place for it,
  // and the port would otherwise go on deriving roles from names, which is what was corrected.
  it('tells the port what the file says this skeleton means', async () => {
    const retarget = straightThrough()
    const { engine } = withShipped(
      riggedModel([], { b0: 'Hips' }),
      animatedModel([walk('NlaTrack')]),
      retarget,
    )

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock())] })

    await vi.waitFor(() => expect(retarget.learnt).toHaveLength(1))
    expect(retarget.learnt[0]).toEqual({
      signature: skeletonTopologySignatureOf([
        { name: 'b0', parent: null },
        { name: 'b1', parent: 'b0' },
      ]),
      roles: { b0: 'Hips' },
    })
    engine.dispose()
  })

  // The port dies with the viewport, so a mapping worked out in one document would be worked out
  // again in the next: the project keeps it, and hands it back before anything is read.
  it('hands what a project already learnt to the port, and reports what it learns', async () => {
    const known: SkeletonProfile = { signature: skeletonSignatureOf(['x']), roles: { x: 'Hips' } }
    const retarget = straightThrough()
    const learnt: SkeletonProfile[] = []
    const engine = new SceneRenderer({
      onSelect: () => {},
      onTransform: () => {},
      loadModel: () => Promise.resolve(riggedModel([], { b0: 'Hips' })),
      retarget,
      profiles: [known],
      onProfile: profile => void learnt.push(profile),
      bvh,
    })

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock())] })

    expect(retarget.learnt[0]).toEqual(known)
    await vi.waitFor(() => expect(learnt).toHaveLength(1))
    expect(learnt[0]?.roles).toEqual({ b0: 'Hips' })
    engine.dispose()
  })

  it('leaves the model standing when the shipped file will not read', async () => {
    const loaded = animatedModel([])
    const { engine } = withShipped(loaded, new Error('no such folder'), straightThrough())

    engine.apply({ ...EMPTY_SCENE, nodes: [modelNode(shippedBlock())] })

    await vi.waitFor(() => expect(loaded.parent).not.toBeNull())
    expect(cubeOf(loaded).position.x).toBe(0)
    engine.dispose()
  })
})
// @vitest-environment jsdom
