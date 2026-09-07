import {
  AnimationMixer,
  Vector3,
  LoopOnce,
  Bone,
  Group,
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three'
import type * as SkeletonUtilsModule from 'three/addons/utils/SkeletonUtils.js'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { profileWithRole, skeletonSignatureOf } from '@shared/domain/skeletonProfile'
import { retargetPlanOf, wireClipOf, wireBonesOf, clipFromWire } from './retarget'
import type { RetargetOptions, RetargetResponse, WireBone, WireClip } from './retargetMessage'

/** three's sampling, made to fail on demand: what is under test is what the worker does then. */
const sampling = vi.hoisted(() => ({ fails: false }))

vi.mock('three/addons/utils/SkeletonUtils.js', async importOriginal => {
  const real = await importOriginal<typeof SkeletonUtilsModule>()
  return {
    ...real,
    retargetClip: (...args: Parameters<typeof real.retargetClip>) => {
      if (sampling.fails) throw new Error('out of memory')
      return real.retargetClip(...args)
    },
  }
})

const posted: RetargetResponse[] = []

// Imported once for the file: the module registers its listener on import, and a second import
// would leave two of them answering every request.
beforeAll(async () => {
  vi.spyOn(self, 'postMessage').mockImplementation((message: unknown) => {
    posted.push(message as RetargetResponse)
  })
  await import('./retarget.worker')
})

beforeEach(() => {
  sampling.fails = false
  posted.length = 0
})

function boneAt(name: string, parent: number, y: number): WireBone {
  return { name, parent, position: [0, y, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }
}

/** Mixamo's spelling. */
const SOURCE: WireBone[] = [
  boneAt('mixamorigHips', -1, 1),
  boneAt('mixamorigSpine', 0, 0.2),
  boneAt('mixamorigHead', 1, 0.4),
]

/** Tripo's, on a character twice as tall — the case a bone map alone cannot handle. */
const TARGET: WireBone[] = [boneAt('Hip', -1, 2), boneAt('Waist', 0, 0.4), boneAt('Head', 1, 0.8)]

/** A quarter turn of the spine over one second. */
function spineTurn(): WireClip {
  return wireClipOf(
    new AnimationClip('walk', 1, [
      new QuaternionKeyframeTrack(
        'mixamorigSpine.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, 0.383, 0, 0.924],
      ),
    ]),
  )
}

/** `null` asks for no rate at all — passing `undefined` would fall back on the default below. */
function ask(
  id: number,
  clips: readonly WireClip[],
  fps: number | null = 30,
  source: readonly WireBone[] = SOURCE,
  options?: RetargetOptions,
): void {
  self.dispatchEvent(
    new MessageEvent('message', {
      data: {
        id,
        target: TARGET,
        source,
        clips,
        names: { Hip: 'mixamorigHips', Waist: 'mixamorigSpine', Head: 'mixamorigHead' },
        hip: 'mixamorigHips',
        fps: fps ?? undefined,
        options,
      },
    }),
  )
}

/** The source walks one unit forward on hips that start at the origin. */
function hipTravel(): WireClip {
  return wireClipOf(
    new AnimationClip('walk', 1, [
      new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 1, 0, 1, 1, 0]),
    ]),
  )
}

/** `frames` keys spread over one second, so the clip's own rate is `frames` per second. */
function spineTurnAt(frames: number): WireClip {
  const times = Array.from({ length: frames }, (_, frame) => frame / (frames - 1))
  const values = times.flatMap((_, frame) => [0, frame / (frames - 1), 0, 1])

  return wireClipOf(
    new AnimationClip('walk', 1, [
      new QuaternionKeyframeTrack('mixamorigSpine.quaternion', times, values),
    ]),
  )
}

/**
 * The SAME bones, resting 45° about Z on the spine — what a Mixamo rig does and what a
 * fitted one never does, its rests all being the identity. Derived, so the two cannot drift apart.
 */
const TURNED_SOURCE: WireBone[] = SOURCE.map(bone =>
  bone.name === 'mixamorigSpine' ? { ...bone, quaternion: [0, 0, 0.383, 0.924] } : bone,
)

/** A clip that holds the source exactly where it rests: nothing of the target should move. */
function restingClip(): WireClip {
  return wireClipOf(
    new AnimationClip('rest', 1, [
      new QuaternionKeyframeTrack(
        'mixamorigSpine.quaternion',
        [0, 1],
        [0, 0, 0.383, 0.924, 0, 0, 0.383, 0.924],
      ),
    ]),
  )
}

function settled(): RetargetResponse | undefined {
  return posted.find(response => response.done)
}

async function drain(): Promise<void> {
  // The worker comes back for air between clips; two turns of the timer queue clear a short run.
  for (let turn = 0; turn < 8; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

describe('replaying an animation on another skeleton', () => {
  it('answers tracks named for the target bones, in the node spelling glTF uses', async () => {
    ask(1, [spineTurn()])
    await drain()

    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('the worker did not answer with clips')
    const names = answer.clips[0]?.tracks.map(track => track.name) ?? []

    expect(names).toContain('Waist.quaternion')
    // `.bones[Waist].quaternion` is what three writes, and it binds against nothing this studio
    // plays a clip on.
    expect(names.every(name => !name.startsWith('.bones['))).toBe(true)
  })

  it('carries the turn over to the bone that fills the same role', async () => {
    ask(1, [spineTurn()])
    await drain()

    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('the worker did not answer with clips')
    const turned = answer.clips[0]?.tracks.find(track => track.name === 'Waist.quaternion')
    const last = turned?.values.slice(-4) ?? new Float32Array()

    // A quarter turn about Y, sampled: the identity quaternion would be [0, 0, 0, 1].
    expect(Math.abs(last[1] ?? 0)).toBeGreaterThan(0.3)
  })

  // 🛑 three copies the source bone's WORLD orientation onto the target one. Two skeletons whose
  // rests differ therefore fold the character in two — measured on a fitted rig, whose rests are
  // all the identity, playing a Mixamo motion.
  it('leaves a bone at rest when the motion holds its source at rest, whatever the rests are', async () => {
    ask(1, [restingClip()], 30, TURNED_SOURCE)
    await drain()

    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('the worker did not answer with clips')
    const turned = answer.clips[0]?.tracks.find(track => track.name === 'Waist.quaternion')
    const last = turned?.values.slice(-4) ?? new Float32Array()

    expect(Math.abs(last[2] ?? 1)).toBeLessThan(0.01)
    expect(Math.abs(last[3] ?? 0)).toBeGreaterThan(0.99)
  })

  it('reads the hips’ travel at the target’s size, so its feet do not slide', async () => {
    ask(1, [hipTravel()])
    await drain()

    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('the worker did not answer with clips')
    const travel = answer.clips[0]?.tracks.find(track => track.name === 'Hip.position')
    if (!travel) throw new Error('the hips carried no translation at all')

    // The source walks one unit forward on a torso of 0.4; the target's is 0.8, so it must cover
    // two. Carried over unchanged — three's default `scale` of 1 — it would cover one and slide.
    expect(Math.abs(travel.values[travel.values.length - 3] ?? 0)).toBeGreaterThan(1.5)
  })

  it('scales Mixamo centimetres on a root hip down to the target’s metres', async () => {
    const centimetres: WireBone[] = [
      {
        name: 'mixamorigHips',
        parent: -1,
        position: [0, 0.99, 0],
        quaternion: [0, 0, 0, 1],
        scale: [0.01, 0.01, 0.01],
      },
      boneAt('mixamorigSpine', 0, 20),
      boneAt('mixamorigHead', 1, 40),
    ]
    const metres: WireBone[] = [
      boneAt('Hip', -1, 0.99),
      boneAt('Waist', 0, 0.2),
      boneAt('Head', 1, 0.4),
    ]
    const clip = wireClipOf(
      new AnimationClip('walk', 1, [
        new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 99, 0, 0, 99, -99]),
      ]),
    )
    self.dispatchEvent(
      new MessageEvent('message', {
        data: {
          id: 1,
          target: metres,
          source: centimetres,
          clips: [clip],
          names: { Hip: 'mixamorigHips', Waist: 'mixamorigSpine', Head: 'mixamorigHead' },
          hip: 'mixamorigHips',
          fps: 30,
        },
      }),
    )
    await drain()

    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('the worker did not answer with clips')
    const travel = answer.clips[0]?.tracks.find(track => track.name === 'Hip.position')
    const z = travel?.values[travel.values.length - 1] ?? 0

    // Unscaled, z is −99 m — the body stands behind the north wall. Folded by 0,01 it is a metre.
    expect(Math.abs(z)).toBeGreaterThan(0.5)
    expect(Math.abs(z)).toBeLessThan(2)
  })

  it('does not export tracks for a bone explicitly removed from matching', async () => {
    const signature = skeletonSignatureOf(SOURCE.map(bone => bone.name))
    const profile = profileWithRole({ signature, roles: {} }, 'mixamorigSpine', null)
    const plan = retargetPlanOf(SOURCE, SOURCE, [spineTurn()], 30, new Map([[signature, profile]]))
    self.dispatchEvent(new MessageEvent('message', { data: { id: 81, ...plan } }))
    await drain()
    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('missing result')
    expect(answer.clips[0]?.tracks.map(track => track.name)).not.toContain(
      'mixamorigSpine.quaternion',
    )
  })

  it('applies explicit scale and can remove horizontal root travel', async () => {
    ask(41, [hipTravel()], 30, SOURCE, { scale: 3 })
    await drain()
    const scaled = settled()
    if (!scaled?.done || !scaled.ok) throw new Error('missing scaled result')
    const travel = scaled.clips[0]?.tracks.find(track => track.name === 'Hip.position')
    expect(travel?.values.at(-3)).toBeGreaterThan(2.5)
    posted.length = 0
    ask(42, [hipTravel()], 30, SOURCE, { rootMotion: 'inPlace' })
    await drain()
    const stationary = settled()
    if (!stationary?.done || !stationary.ok) throw new Error('missing stationary result')
    const hips = stationary.clips[0]?.tracks.find(track => track.name === 'Hip.position')
    expect(hips?.values.at(-3)).toBeCloseTo(0)
    expect(hips?.values.at(-2)).toBeGreaterThan(0)
  })

  it('keeps the length the source was authored at', async () => {
    ask(1, [spineTurn()])
    await drain()

    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('the worker did not answer with clips')

    expect(answer.clips[0]?.duration).toBe(1)
  })

  it('samples at the source clip’s own rate when none is asked for', async () => {
    // The two measured providers disagree — Tripo authored at 24, Uthana at 30 — so a fixed rate
    // would resample one of them for nothing.
    ask(1, [spineTurnAt(12)], null)
    await drain()

    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('the worker did not answer with clips')

    expect(answer.clips[0]?.tracks[0]?.times).toHaveLength(12)
  })

  it('reports one step per clip', async () => {
    ask(1, [spineTurn(), spineTurn()])
    await drain()

    expect(posted.filter(response => !response.done)).toEqual([
      { id: 1, done: false, progress: 0.5 },
      { id: 1, done: false, progress: 1 },
    ])
  })
})

describe('when a run goes wrong or is taken back', () => {
  it('reports a failure rather than dying silently', async () => {
    sampling.fails = true
    ask(1, [spineTurn()])
    await drain()

    expect(settled()).toEqual({ id: 1, done: true, ok: false, error: 'out of memory' })
  })

  it('says nothing more about a request taken back mid-run', async () => {
    ask(1, [spineTurn(), spineTurn(), spineTurn()])
    self.dispatchEvent(new MessageEvent('message', { data: { id: 1, cancel: true } }))
    await drain()

    expect(settled()).toBeUndefined()
  })

  /**
   * A cancellation crossing paths with the answer it meant to stop is the ordinary case, not an
   * edge: the caller drops its slot and posts one anyway. Remembered, that id would silence the
   * next request wearing it — and would sit in the worker's memory for the life of the window.
   */
  it('forgets a cancellation that arrived after the run it named had ended', async () => {
    ask(1, [spineTurn()])
    await drain()
    self.dispatchEvent(new MessageEvent('message', { data: { id: 1, cancel: true } }))
    posted.length = 0

    ask(1, [spineTurn()])
    await drain()

    expect(settled()).toBeDefined()
  })
})

function walkArmature(): Group {
  const model = new Group()
  const armature = new Group()
  armature.quaternion.set(0.7071068287, 0, 0, 0.7071068287).normalize()
  armature.scale.setScalar(0.01)
  const hips = new Bone()
  hips.name = 'Hips'
  hips.position.set(0, 0, -99.7919)
  model.add(armature)
  armature.add(hips)
  return model
}

it.each([false, true])(
  'transfers Walk forward at target rest height (converted target: %s)',
  async converted => {
    const model = walkArmature()
    const clip = wireClipOf(
      new AnimationClip('Walk', 1, [
        new VectorKeyframeTrack(
          'Hips.position',
          [0, 1],
          [-0.07555, 0.0721, -97.9534, -0.07555, 177.0242, -97.95345],
        ),
      ]),
    )
    const targetModel = new Group()
    const targetFrame = new Group()
    const targetHips = new Bone()
    targetHips.name = 'Hips'
    targetHips.position.y = converted ? 1.5736 : 0.7868
    if (converted) {
      targetFrame.rotation.y = Math.PI / 2
      targetFrame.scale.setScalar(0.5)
    }
    targetModel.add(targetFrame)
    targetFrame.add(targetHips)
    self.dispatchEvent(
      new MessageEvent('message', {
        data: {
          id: 99,
          ...retargetPlanOf(wireBonesOf(targetModel), wireBonesOf(model), [clip], 30),
          options: { scale: 1 },
        },
      }),
    )
    await drain()
    const answer = settled()
    if (!answer?.done || !answer.ok) throw new Error('missing transfer')
    const adapted = answer.clips[0]
    if (!adapted) throw new Error('missing clip')
    const mixer = new AnimationMixer(targetModel)
    const action = mixer.clipAction(clipFromWire(adapted)).setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    mixer.setTime(0)
    const first = targetHips.getWorldPosition(new Vector3())
    mixer.setTime(1)
    const last = targetHips.getWorldPosition(new Vector3())
    expect(first.y).toBeCloseTo(0.7868 + 0.979534 - 0.997919, 4)
    expect(last.y - first.y).toBeCloseTo(0, 4)
    expect(last.z - first.z).toBeGreaterThan(1.7)
    expect(Math.abs(last.x - first.x)).toBeLessThan(0.0001)
    expect(adapted.tracks.every(track => track.name.startsWith('Hips.'))).toBe(true)
  },
)
