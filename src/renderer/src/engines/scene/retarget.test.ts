import {
  AnimationClip,
  Bone,
  Matrix4,
  Object3D,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three'
import { describe, expect, it } from 'vitest'
import type { HumanoidRole } from '@shared/domain/humanoid'
import { skeletonSignatureOf } from '@shared/domain/skeletonProfile'
import {
  clipFromWire,
  createRetarget,
  nodeTrackNameOf,
  retargetFitOf,
  restOffsetsOf,
  retargetPlanOf,
  sameSkeleton,
  skeletonScaleOf,
  skinnedFromWire,
  wireBonesOf,
  wireClipOf,
} from './retarget'
import type { RetargetIncoming, RetargetResponse, WireBone } from './retargetMessage'

function boneAt(name: string, parent: number, y: number, scale = 1): WireBone {
  return {
    name,
    parent,
    position: [0, y, 0],
    quaternion: [0, 0, 0, 1],
    scale: [scale, scale, scale],
  }
}

/**
 * Mixamo's spelling AS THREE HOLDS IT: `GLTFLoader` runs every node name through
 * `PropertyBinding.sanitizeNodeName`, which DELETES `:` rather than replacing it. A bone still
 * named `mixamorig:Hips` binds to nothing — measured on the real file on 2026-08-18.
 */
const UTHANA: WireBone[] = [
  boneAt('mixamorigHips', -1, 1),
  boneAt('mixamorigSpine', 0, 0.2),
  boneAt('mixamorigHead', 1, 0.4),
  boneAt('mixamorigLeftArm', 1, 0.3),
]

/** Tripo's, on a character twice as tall. */
const TRIPO: WireBone[] = [
  boneAt('Hip', -1, 2),
  boneAt('Waist', 0, 0.4),
  boneAt('Head', 1, 0.8),
  boneAt('L_Upperarm', 1, 0.6),
  boneAt('L_UpperarmTwist01', 3, 0.1),
]

/**
 * A worker the test answers by hand, so what is under test is the register rather than three's
 * sampling — `skinWeights.test.ts` builds its fake the same way, and the cast is the same one:
 * the port calls exactly these members, and jsdom has no `Worker` at all.
 */
function scriptedWorker() {
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const sent: RetargetIncoming[] = []
  let spawned = 0

  const worker = {
    postMessage: (message: RetargetIncoming) => void sent.push(message),
    terminate: () => {},
    addEventListener: (kind: string, listener: (event: unknown) => void) =>
      void listeners.set(kind, [...(listeners.get(kind) ?? []), listener]),
  }

  return {
    spawn: () => {
      spawned += 1
      return worker as unknown as Worker
    },
    sent,
    get spawned() {
      return spawned
    },
    answer: (response: RetargetResponse) => {
      for (const listener of listeners.get('message') ?? []) listener({ data: response })
    },
  }
}

function turnClip(boneName: string): AnimationClip {
  return new AnimationClip('walk', 1, [
    new QuaternionKeyframeTrack(`${boneName}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0.7, 0, 0.7]),
  ])
}

describe('pairing two skeletons', () => {
  it('spells the map from target bone to source bone, which is the direction three reads', () => {
    const plan = retargetPlanOf(TRIPO, UTHANA, [])

    expect(plan.names.Hip).toBe('mixamorigHips')
    expect(plan.names.Waist).toBe('mixamorigSpine')
    expect(plan.names.L_Upperarm).toBe('mixamorigLeftArm')
  })

  it('leaves a target bone filling no role out of the map, so it rests', () => {
    expect(retargetPlanOf(TRIPO, UTHANA, []).names.L_UpperarmTwist01).toBeUndefined()
  })

  it('names the hips under their source spelling, which is what three compares', () => {
    expect(retargetPlanOf(TRIPO, UTHANA, []).hip).toBe('mixamorigHips')
  })

  it('pairs bones that already share a name, even where no role was read', () => {
    const odd: WireBone[] = [boneAt('Hip', -1, 2), boneAt('Antenna', 0, 0.5)]
    const other: WireBone[] = [boneAt('Hips', -1, 1), boneAt('Antenna', 0, 0.3)]

    expect(retargetPlanOf(odd, other, []).names.Antenna).toBe('Antenna')
  })
})

describe('pairing a skeleton whose mapping was put right by hand', () => {
  /** A rig spelling nothing this studio reads: only a correction can say what these bones are. */
  const ODD: WireBone[] = [boneAt('b0', -1, 2), boneAt('b1', 0, 1.5), boneAt('b2', 1, 1)]

  const learnt = (roles: Record<string, HumanoidRole>) =>
    new Map([[skeletonSignatureOf(ODD.map(bone => bone.name)), { signature: 'ignored', roles }]])

  it('reads nothing at all off names that spell no role', () => {
    expect(retargetPlanOf(ODD, UTHANA, []).names).toEqual({})
  })

  it('pairs by the correction once the skeleton has been recognised', () => {
    const plan = retargetPlanOf(ODD, UTHANA, [], undefined, learnt({ b0: 'Hips', b2: 'Head' }))

    expect(plan.names).toEqual({ b0: 'mixamorigHips', b2: 'mixamorigHead' })
  })

  // A correction is made BECAUSE the name lied: it has to beat what the name spells, and take
  // the role off whichever bone was reading it.
  it('takes a role off the bone whose name had claimed it', () => {
    const named = [boneAt('Hips', -1, 2), boneAt('Pelvis', 0, 1.8)]
    const known = new Map([
      [
        skeletonSignatureOf(named.map(bone => bone.name)),
        { signature: 'ignored', roles: { Pelvis: 'Hips' as HumanoidRole } },
      ],
    ])

    const plan = retargetPlanOf(named, UTHANA, [], undefined, known)

    expect(plan.names.Pelvis).toBe('mixamorigHips')
    expect(plan.names.Hips).toBeUndefined()
  })

  it('leaves a skeleton it has never been told about exactly as its names read', () => {
    const other: WireBone[] = [boneAt('c0', -1, 2)]

    expect(retargetPlanOf(other, UTHANA, [], undefined, learnt({ b0: 'Hips' })).names).toEqual({})
  })
})

describe('how well an animation fits a character', () => {
  /** A tree of named bones, so the fit is read off two real skeletons rather than off wire rows. */
  const treeOf = (names: readonly string[]): Object3D => {
    const root = new Object3D()
    let parent: Object3D = root
    for (const name of names) {
      const bone = new Bone()
      bone.name = name
      parent.add(bone)
      parent = bone
    }
    return root
  }

  const HUMAN = treeOf(['mixamorigHips', 'mixamorigSpine', 'mixamorigNeck', 'mixamorigHead'])

  it('names the joints both of them know, in roles rather than in bone names', () => {
    const tripo = treeOf(['Hip', 'Spine01', 'NeckTwist01', 'Head'])

    // `mixamorigHips` and `Hip` are the same joint, and no string comparison says so. `Spine01`
    // is deliberately absent: Tripo spells the CHEST that way, which `boneRoles` measured.
    expect([...retargetFitOf(tripo, HUMAN).matched].sort()).toEqual(['Head', 'Hips', 'Neck'])
  })

  it('says which joint the character has and the animation never moves', () => {
    const withArms = treeOf(['mixamorigHips', 'mixamorigSpine', 'mixamorigLeftArm'])

    expect(retargetFitOf(withArms, HUMAN).missingInSource).toContain('LeftUpperArm')
  })

  it('says which joint the animation drives and the character does not have', () => {
    const bare = treeOf(['mixamorigHips'])

    expect(retargetFitOf(bare, HUMAN).missingInTarget).toContain('Head')
  })

  /**
   * 🛑 The screen said « this joint stays at rest » about a joint the transfer went on to drive:
   * the plan read the corrections and the verdict read the names alone.
   */
  it('reads the roles put right by hand, exactly as a transfer does', () => {
    const odd = treeOf(['b0', 'b1'])
    const corrected = new Map([
      [
        skeletonSignatureOf(['b0', 'b1']),
        { signature: 'ignored', roles: { b0: 'Hips' as HumanoidRole } },
      ],
    ])

    expect(retargetFitOf(odd, HUMAN).matched).toEqual([])
    expect(retargetFitOf(odd, HUMAN, corrected).matched).toEqual(['Hips'])
  })

  // « Compatible » has to be a measurement rather than a hope: two skeletons of one convention
  // leave nothing on either side.
  it('finds nothing missing between two skeletons of the same convention', () => {
    const fit = retargetFitOf(HUMAN, HUMAN)

    expect([...fit.missingInSource, ...fit.missingInTarget]).toEqual([])
  })
})

describe('deciding whether to retarget at all', () => {
  it('calls two skeletons the same when names, tree and rest pose all agree', () => {
    expect(sameSkeleton(UTHANA, [...UTHANA])).toBe(true)
  })

  it('tells apart two skeletons spelled alike but built to other proportions', () => {
    const taller = UTHANA.map(bone => boneAt(bone.name, bone.parent, bone.position[1] * 2))

    // The names match exactly; playing one's rotations on the other is the very case retargeting
    // exists for, so this must not short-circuit.
    expect(sameSkeleton(UTHANA, taller)).toBe(false)
  })

  it('tells apart two skeletons of the same bones hung differently', () => {
    const flat = UTHANA.map(bone =>
      boneAt(bone.name, bone.parent === 1 ? 0 : bone.parent, bone.position[1]),
    )

    expect(sameSkeleton(UTHANA, flat)).toBe(false)
  })
})

describe('asking the worker', () => {
  it('answers an identical skeleton without starting a worker at all', async () => {
    const script = scriptedWorker()
    const clips = [turnClip('mixamorigSpine')]
    const model = skinnedFromWire(UTHANA)

    const adapted = await createRetarget(script.spawn).adapt(model, skinnedFromWire(UTHANA), clips)

    expect(adapted).toEqual(clips)
    expect(script.spawned).toBe(0)
  })

  it('sends the two skeletons and the clips, and answers what comes back', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)

    const pending = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [
      turnClip('mixamorigSpine'),
    ])
    const request = script.sent[0]
    if (!request || 'cancel' in request) throw new Error('nothing was asked of the worker')

    expect(request.names.Waist).toBe('mixamorigSpine')
    script.answer({ id: request.id, done: true, ok: true, clips: [wireClipOf(turnClip('Waist'))] })

    expect((await pending)?.[0]?.tracks[0]?.name).toBe('Waist.quaternion')
  })

  it('reports each clip as it lands', async () => {
    const script = scriptedWorker()
    const seen: number[] = []
    const port = createRetarget(script.spawn)

    const pending = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('x')], {
      onProgress: progress => void seen.push(progress),
    })
    const request = script.sent[0]
    if (!request || 'cancel' in request) throw new Error('nothing was asked of the worker')

    script.answer({ id: request.id, done: false, progress: 0.5 })
    script.answer({ id: request.id, done: true, ok: true, clips: [] })
    await pending

    expect(seen).toEqual([0.5])
  })

  it('lets a caller take a request back, and tells the worker to stop', async () => {
    const script = scriptedWorker()
    const stop = new AbortController()
    const port = createRetarget(script.spawn)

    const pending = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('x')], {
      signal: stop.signal,
    })
    stop.abort()

    expect(await pending).toBeNull()
    expect(script.sent.at(-1)).toEqual({ id: 1, cancel: true })
  })

  it('answers nothing once the port has let go, rather than waiting forever', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)
    port.dispose()

    expect(await port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [])).toBeNull()
  })

  it('answers nothing to a caller whose signal had already fired', async () => {
    const script = scriptedWorker()
    const stop = new AbortController()
    stop.abort()

    // An `abort` already delivered never reaches a listener added after it: without a check of
    // its own, the worker would do the whole job and hand clips to a caller already gone.
    const adapted = await createRetarget(script.spawn).adapt(
      skinnedFromWire(TRIPO),
      skinnedFromWire(UTHANA),
      [turnClip('x')],
      { signal: stop.signal },
    )

    expect(adapted).toBeNull()
    expect(script.sent.at(-1)).toEqual({ id: 1, cancel: true })
  })
})

describe('reading how much bigger one skeleton is than another', () => {
  it('answers the ratio of their torsos', () => {
    const twice = UTHANA.map(bone => boneAt(bone.name, bone.parent, bone.position[1] * 2))

    expect(skeletonScaleOf(skinnedFromWire(twice), skinnedFromWire(UTHANA))).toBeCloseTo(2, 5)
  })

  it('answers one when a skeleton has no head to measure to', () => {
    const headless = UTHANA.filter(bone => !bone.name.endsWith('Head'))

    // Hip HEIGHT would be the obvious measure and cannot be used: Uthana builds its skeleton with
    // the hips at the origin, measured on the real file.
    expect(skeletonScaleOf(skinnedFromWire(headless), skinnedFromWire(UTHANA))).toBe(1)
  })
})

describe('cancelling the difference of rest poses', () => {
  const TURNED: WireBone[] = UTHANA.map(bone =>
    bone.name.endsWith('Spine') ? { ...bone, quaternion: [0, 0, 0.383, 0.924] } : bone,
  )

  it('leaves nothing to cancel between two skeletons resting alike', () => {
    const names = Object.fromEntries(UTHANA.map(bone => [bone.name, bone.name]))
    const offsets = restOffsetsOf(skinnedFromWire(UTHANA), skinnedFromWire(UTHANA), names)

    for (const offset of Object.values(offsets)) {
      expect(offset.elements).toEqual(new Matrix4().elements)
    }
  })

  // Two target bones may follow ONE source bone, and the quaternion maths of three writes in
  // place: the second read a rest the first had already inverted.
  it('answers the same turn twice when two bones follow one source bone', () => {
    const spine = UTHANA.find(bone => bone.name.endsWith('Spine'))?.name ?? ''
    const head = UTHANA.find(bone => bone.name.endsWith('Head'))?.name ?? ''
    const names = { [spine]: spine, [head]: spine }

    const offsets = restOffsetsOf(skinnedFromWire(UTHANA), skinnedFromWire(TURNED), names)

    expect(offsets[head]?.elements).toEqual(offsets[spine]?.elements)
  })
})

/** A rig hung under an armature that turns and shrinks it — the shape every Blender export has. */
function armatured(): { root: Object3D; hips: Bone } {
  const root = new Object3D()
  const armature = new Object3D()
  armature.name = 'Armature'
  armature.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
  armature.scale.setScalar(0.01)
  const hips = new Bone()
  hips.name = 'Hips'
  hips.position.set(0, 100, 0)
  root.add(armature)
  armature.add(hips)
  root.updateMatrixWorld(true)

  return { root, hips }
}

const worldOf = (object: Object3D | undefined): number[] => {
  if (!object) throw new Error('no such object')

  return new Vector3()
    .setFromMatrixPosition(object.matrixWorld)
    .toArray()
    .map(one => +one.toFixed(5))
}

describe('crossing the wire', () => {
  it('reads a skeleton off a model, parents before children', () => {
    const bones = wireBonesOf(skinnedFromWire(TRIPO))

    expect(bones.map(bone => bone.name)).toEqual(TRIPO.map(bone => bone.name))
    expect(bones.every((bone, index) => bone.parent < index)).toBe(true)
  })

  it('carries the armature above the first bone, so the wire skeleton stands where the model does', () => {
    const { root, hips } = armatured()
    const wired = skinnedFromWire(wireBonesOf(root))
    wired.updateMatrixWorld(true)

    expect(worldOf(wired.getObjectByName('Hips'))).toEqual(worldOf(hips))
  })

  it('gives that armature back on the way out, so the real one never applies it twice', () => {
    const { root, hips } = armatured()
    const wired = skinnedFromWire(wireBonesOf(root))
    wired.updateMatrixWorld(true)
    const sampled = wired.getObjectByName('Hips')
    if (!sampled) throw new Error('the wire skeleton has no hips')
    const stood = worldOf(hips)

    // What a retargeted track writes back: the local three sampled off the wire skeleton, played
    // on the model, where the hips still hang under the armature.
    hips.position.copy(sampled.position)
    hips.quaternion.copy(sampled.quaternion)
    hips.scale.copy(sampled.scale)
    root.updateMatrixWorld(true)

    expect(worldOf(hips)).toEqual(stood)
  })

  it('carries a clip out and back unchanged', () => {
    const clip = new AnimationClip('walk', 2, [
      new QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 0, 1, 0]),
    ])
    const back = clipFromWire(wireClipOf(clip))

    expect(back.name).toBe('walk')
    expect(back.tracks.map(track => track.ValueTypeName)).toEqual(['quaternion', 'vector'])
    expect([...(back.tracks[1]?.values ?? [])]).toEqual([0, 0, 0, 0, 1, 0])
  })

  it('reads three’s skeleton spelling as the node spelling every glTF clip uses', () => {
    expect(nodeTrackNameOf('.bones[mixamorigHips].quaternion')).toBe('mixamorigHips.quaternion')
    expect(nodeTrackNameOf('Hips.position')).toBe('Hips.position')
  })
})
