import { describe, expect, it, vi } from 'vitest'
import type { Rig } from '@shared/domain/rig'
import { HUMANOID_ROLES } from '@shared/domain/humanoid'
import {
  INFLUENCES,
  SKIN_REGION_WITHIN,
  SKIN_REGIONS,
  type SkinIncoming,
  type SkinResponse,
} from './skinMessage'
import { createSkinWeights, regionOf, wireOf } from './skinWeights'

const REST = (x: number, y: number, z: number) => ({
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
})

/** Hips at one metre, a spine above it, and a left hand off to the side. */
const RIG: Rig = {
  origin: 'local',
  bones: [
    { name: 'Hips', parent: null, rest: REST(0, 1, 0), role: 'Hips' },
    { name: 'Spine', parent: 'Hips', rest: REST(0, 0.2, 0), role: 'Spine' },
    { name: 'LeftHand', parent: 'Spine', rest: REST(0.5, -0.4, 0), role: 'LeftHand' },
  ],
}

/**
 * A worker the test answers by hand, so what is under test is the register rather than the
 * arithmetic — `bvhBuilder.test.ts` builds its fake the same way, and the cast is the same one:
 * the port calls exactly these members, and jsdom has no `Worker` at all.
 */
function scriptedWorker() {
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const sent: SkinIncoming[] = []
  let terminated = 0

  const worker = {
    postMessage: (message: SkinIncoming) => void sent.push(message),
    terminate: () => void (terminated += 1),
    addEventListener: (kind: string, listener: (event: unknown) => void) =>
      void listeners.set(kind, [...(listeners.get(kind) ?? []), listener]),
  }

  const fire = (kind: string, event: unknown): void => {
    for (const listener of listeners.get(kind) ?? []) listener(event)
  }

  return {
    spawn: () => worker as unknown as Worker,
    sent,
    get terminated() {
      return terminated
    },
    answer: (response: SkinResponse) => fire('message', { data: response }),
    die: (message: string) => fire('error', { message }),
    garble: () => fire('messageerror', {}),
  }
}

const POSITIONS = () => new Float32Array([0, 1, 0])

const bindingFor = (id: number, vertices = 1, bone = 0): SkinResponse => {
  const skinIndex = new Uint16Array(vertices * INFLUENCES)
  const skinWeight = new Float32Array(vertices * INFLUENCES)
  for (let vertex = 0; vertex < vertices; vertex += 1) {
    skinIndex[vertex * INFLUENCES] = bone
    skinWeight[vertex * INFLUENCES] = 1
  }
  return { id, done: true, ok: true, skinIndex, skinWeight }
}

describe('waiting on the skinning worker', () => {
  it('answers the binding the worker sends back', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)

    const bound = port.bind(POSITIONS(), RIG)
    fake.answer(bindingFor(1))

    expect((await bound)?.skinWeight[0]).toBe(1)
  })

  it('splits a dense mesh between workers and joins their bindings in vertex order', async () => {
    const workers = [scriptedWorker(), scriptedWorker()]
    let nextWorker = 0
    const port = createSkinWeights(() => {
      const worker = workers[nextWorker]
      nextWorker += 1
      if (!worker) throw new Error('No scripted worker left')
      return worker.spawn()
    }, workers.length)
    const vertices = 100_000

    const bound = port.bind(new Float32Array(vertices * 3), RIG)
    workers[0]?.answer(bindingFor(1, vertices / 2, 1))
    workers[1]?.answer(bindingFor(1, vertices / 2, 2))
    const binding = await bound

    expect(
      workers
        .map(worker => worker.sent[0])
        .map(message => (message && !('cancel' in message) ? message.position.length / 3 : 0)),
    ).toEqual([vertices / 2, vertices / 2])
    expect(binding?.skinIndex[0]).toBe(1)
    expect(binding?.skinIndex[(vertices - 1) * INFLUENCES]).toBe(2)
    expect(binding?.skinIndex).toHaveLength(vertices * INFLUENCES)
  })

  // The one rule the BVH register never needed: its every request answers exactly once, so it
  // deletes the slot on the first word back. A progress report is not the last word.
  it('keeps waiting through a progress report rather than settling on it', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)
    const onProgress = vi.fn()

    const bound = port.bind(POSITIONS(), RIG, { onProgress })
    fake.answer({ id: 1, done: false, progress: 0.5 })
    fake.answer(bindingFor(1))

    expect(await bound).not.toBeNull()
    expect(onProgress).toHaveBeenCalledWith(0.5)
  })

  it('rejects when the worker says the walk threw', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)

    const bound = port.bind(POSITIONS(), RIG)
    fake.answer({ id: 1, done: true, ok: false, error: 'out of memory' })

    await expect(bound).rejects.toThrow('out of memory')
  })

  it('drops a late answer to a request nothing waits on', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)

    const bound = port.bind(POSITIONS(), RIG)
    fake.answer(bindingFor(1))
    await bound

    expect(() => fake.answer(bindingFor(1))).not.toThrow()
  })
})

/**
 * An `AbortController` counting what stays hooked on its signal, the way `DictationSettings` and
 * `useAppearance` count theirs: a listener nobody takes off outlives every request that added it.
 */
function countedSignal() {
  const stop = new AbortController()
  const add = stop.signal.addEventListener.bind(stop.signal)
  const remove = stop.signal.removeEventListener.bind(stop.signal)
  let live = 0

  let added = 0

  stop.signal.addEventListener = (...args: Parameters<typeof add>) => {
    added += 1
    live += 1
    add(...args)
  }
  // Counted where one was hooked, since taking off what was never on is a no-op the DOM allows.
  stop.signal.removeEventListener = (...args: Parameters<typeof remove>) => {
    if (live > 0) live -= 1
    remove(...args)
  }

  return { stop, added: () => added, live: () => live }
}

describe('taking a bind back', () => {
  it('tells the worker to stop, and answers nothing', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)
    const stop = new AbortController()

    const bound = port.bind(POSITIONS(), RIG, { signal: stop.signal })
    stop.abort()

    expect(await bound).toBeNull()
    expect(fake.sent.at(-1)).toEqual({ id: 1, cancel: true })
  })

  it('answers nothing for a bind whose signal was taken back before it was asked', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)
    const stop = new AbortController()
    stop.abort()

    expect(await port.bind(POSITIONS(), RIG, { signal: stop.signal })).toBeNull()
    expect(fake.sent.at(-1)).toEqual({ id: 1, cancel: true })
  })

  it('says nothing to the worker when the signal is taken back after the answer', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)
    const stop = new AbortController()

    const bound = port.bind(POSITIONS(), RIG, { signal: stop.signal })
    fake.answer(bindingFor(1))
    await bound
    stop.abort()

    expect(fake.sent).toHaveLength(1)
  })

  it('hooks nothing onto a signal that was already taken back', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)
    const signal = countedSignal()
    signal.stop.abort()

    await port.bind(POSITIONS(), RIG, { signal: signal.stop.signal })

    expect(signal.added()).toBe(0)
  })

  // One controller serves every mesh of a model, so a listener left behind by each bind piles up
  // for the whole binding — each one holding the worker and this request's `resolve`.
  it('takes its listener off the signal once the bind is answered', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)
    const signal = countedSignal()

    const bound = port.bind(POSITIONS(), RIG, { signal: signal.stop.signal })
    fake.answer(bindingFor(1))
    await bound

    expect(signal.live()).toBe(0)
  })

  it('ignores an answer that was already on its way', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)
    const stop = new AbortController()

    const bound = port.bind(POSITIONS(), RIG, { signal: stop.signal })
    stop.abort()
    fake.answer(bindingFor(1))

    expect(await bound).toBeNull()
  })
})

describe('when the worker dies or the port goes', () => {
  it('fails everyone waiting, saying why', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)

    const bound = port.bind(POSITIONS(), RIG)
    fake.die('killed')

    await expect(bound).rejects.toThrow(/killed/)
    expect(fake.terminated).toBe(1)
  })

  it('fails them on an answer it cannot read either', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)

    const bound = port.bind(POSITIONS(), RIG)
    fake.garble()

    await expect(bound).rejects.toThrow(/unreadable/)
  })

  it('resolves rather than rejects when the port is disposed of', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)

    const bound = port.bind(POSITIONS(), RIG)
    port.dispose()

    expect(await bound).toBeNull()
  })

  it('answers nothing for a bind asked after the port went', async () => {
    const fake = scriptedWorker()
    const port = createSkinWeights(fake.spawn)
    port.dispose()

    expect(await port.bind(POSITIONS(), RIG)).toBeNull()
  })
})

describe('a rig on the wire', () => {
  it('measures a bone from where it stands to its child, both in the mesh space', () => {
    const wire = wireOf(POSITIONS(), RIG)

    // Hips rest at y=1 and Spine 0.2 above it: the segment runs between the two world places.
    // Compared loosely because the wire is `Float32Array`, where 1.2 is not 1.2.
    ;[0, 1, 0, 0, 1.2, 0].forEach((expected, index) => {
      expect(wire.segments[index]).toBeCloseTo(expected, 5)
    })
  })

  // 🛑 As a point a leaf never won a vertex against its parent's segment: the hand, the head and
  // the toes drove no skin at all, so posing a hand left its own flesh behind.
  it('carries a leaf bone on past itself, along the bone that arrives at it', () => {
    const wire = wireOf(POSITIONS(), RIG)
    const hand = [...wire.segments.slice(12, 18)]
    const arm = [...wire.segments.slice(6, 12)]

    // The hand rests at the arm's tail and reaches one arm's length further along it.
    ;[0, 1, 2].forEach(axis => {
      const along = (hand[axis] ?? 0) - (arm[axis] ?? 0)
      expect(hand[axis + 3]).toBeCloseTo((hand[axis] ?? 0) + along, 5)
    })
    expect(hand.slice(0, 3)).not.toEqual(hand.slice(3))
  })

  it('labels each bone with the part of the body it drives', () => {
    const wire = wireOf(POSITIONS(), RIG)

    expect([...wire.regions].map(index => SKIN_REGIONS[index])).toEqual([
      'trunk',
      'trunk',
      'armLeft',
    ])
  })
})

describe('which part of a body a role belongs to', () => {
  it('sorts the four limbs apart, and keeps the head off the trunk', () => {
    expect(regionOf('LeftHand')).toBe('armLeft')
    expect(regionOf('RightLowerArm')).toBe('armRight')
    expect(regionOf('LeftFoot')).toBe('legLeft')
    expect(regionOf('RightUpperLeg')).toBe('legRight')
    expect(regionOf('Head')).toBe('head')
  })

  it('gives each finger a region of its own, under the arm that carries it', () => {
    expect(regionOf('LeftThumb1')).toBe('thumbLeft')
    expect(regionOf('LeftIndex2')).toBe('indexLeft')
    expect(regionOf('RightLittle3')).toBe('littleRight')
  })

  // A shoulder goes with its arm, and the join is still covered: the trunk agrees with every
  // region, so the vertices between chest and shoulder can follow both.
  it('gives a shoulder to its arm, and the spine to the trunk', () => {
    expect(regionOf('LeftShoulder')).toBe('armLeft')
    expect(regionOf('Spine')).toBe('trunk')
  })

  it('calls a bone filling no role trunk, which agrees with everything', () => {
    expect(regionOf(undefined)).toBe('trunk')
  })
})

describe('the regions on the wire', () => {
  /**
   * 🛑 A region crosses as its INDEX in `SKIN_REGIONS`, and the list is written by hand beside a
   * union of seventeen. One missing name answers `-1`, which a `Uint8Array` carries as 255: that
   * bone then drives nothing at all, in silence, on every character.
   */
  it('names a region of the list for every humanoid role there is', () => {
    const unlisted = HUMANOID_ROLES.filter(role => !SKIN_REGIONS.includes(regionOf(role)))

    expect(unlisted).toEqual([])
  })

  // A finger sits inside its arm, and that is what keeps the hand driving its knuckles.
  it('holds every finger inside an arm of the list', () => {
    const orphans = SKIN_REGIONS.filter(region => {
      const within = SKIN_REGION_WITHIN[region]
      return within !== undefined && !SKIN_REGIONS.includes(within)
    })

    expect(orphans).toEqual([])
    expect(Object.keys(SKIN_REGION_WITHIN)).toHaveLength(10)
  })
})
