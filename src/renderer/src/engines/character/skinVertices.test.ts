import { describe, expect, it, vi } from 'vitest'
import { INFLUENCES, SKIN_REGIONS, type SkinRegion, type SkinRequest } from './skinMessage'
import { skinVertices, vertexCountOf } from './skinVertices'
import { loadSkinVerticesWasm } from './skinVerticesWasm'

const regionIndex = (region: SkinRegion): number => SKIN_REGIONS.indexOf(region)

type Bone = { head: [number, number, number]; tail: [number, number, number]; region: SkinRegion }

function request(
  vertices: readonly [number, number, number][],
  bones: readonly Bone[],
): SkinRequest {
  return {
    id: 1,
    position: new Float32Array(vertices.flat()),
    segments: new Float32Array(bones.flatMap(bone => [...bone.head, ...bone.tail])),
    regions: new Uint8Array(bones.map(bone => regionIndex(bone.region))),
  }
}

/** The weights of one vertex, paired with the bone each belongs to, heaviest first. */
function influences(binding: { skinIndex: Uint16Array; skinWeight: Float32Array }, vertex = 0) {
  return Array.from({ length: INFLUENCES }, (_, slot) => ({
    bone: binding.skinIndex[vertex * INFLUENCES + slot] ?? 0,
    weight: binding.skinWeight[vertex * INFLUENCES + slot] ?? 0,
  }))
    .filter(influence => influence.weight > 0)
    .sort((left, right) => right.weight - left.weight)
}

async function expectWasmAgrees(input: SkinRequest): Promise<void> {
  const expected = skinVertices(input)
  if (!expected) throw new Error('the TypeScript walk was not cancelled')

  const wasm = (await loadSkinVerticesWasm())(input)
  wasm.skinRange(0, vertexCountOf(input))
  const actual = wasm.binding()

  for (let vertex = 0; vertex < vertexCountOf(input); vertex += 1) {
    const byBone = (left: { bone: number }, right: { bone: number }) => left.bone - right.bone
    const actualInfluences = influences(actual, vertex).sort(byBone)
    const expectedInfluences = influences(expected, vertex).sort(byBone)
    expect(actualInfluences.map(influence => influence.bone)).toEqual(
      expectedInfluences.map(influence => influence.bone),
    )
    for (const [slot, influence] of actualInfluences.entries()) {
      expect(influence.weight).toBeCloseTo(expectedInfluences[slot]?.weight ?? 0, 6)
    }
  }
}

const bind = (...args: Parameters<typeof request>) => {
  const binding = skinVertices(request(...args))
  if (!binding) throw new Error('the walk was not cancelled')
  return binding
}

describe('a handle one pulls', () => {
  // 🛑 Six chains would otherwise take six handfuls of vertices away from the limbs they belong
  // to: a handle rests ON its joint, so it is always the nearest bone there is.
  it('takes no weight at all, whatever it is standing on', () => {
    const binding = bind(
      [[0, 0, 0]],
      [
        { head: [0, 0, 0], tail: [0, 1, 0], region: 'handle' },
        { head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' },
      ],
    )

    expect(influences(binding).map(one => one.bone)).toEqual([1])
  })
})

describe('weighting a vertex', () => {
  it('gives the whole of it to a bone the vertex sits on', () => {
    const binding = bind([[0, 0, 0]], [{ head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' }])

    expect(influences(binding)[0]).toMatchObject({ bone: 0, weight: 1 })
  })

  it('sums to one, whatever the distances', () => {
    const binding = bind(
      [[0.3, 0.5, 0]],
      [
        { head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' },
        { head: [1, 0, 0], tail: [1, 1, 0], region: 'trunk' },
      ],
    )

    const total = influences(binding).reduce((sum, influence) => sum + influence.weight, 0)
    expect(total).toBeCloseTo(1, 6)
  })

  it('follows the nearer bone more than the farther one', () => {
    const binding = bind(
      [[0.25, 0.5, 0]],
      [
        { head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' },
        { head: [1, 0, 0], tail: [1, 1, 0], region: 'trunk' },
      ],
    )

    const [first, second] = influences(binding)
    expect(first?.bone).toBe(0)
    expect(first?.weight).toBeGreaterThan(second?.weight ?? 1)
  })

  // Measuring to a bone's HEAD rather than to its segment puts a whole forearm's pull at the
  // elbow: the skin creases there instead of bending along the arm.
  it('measures to the segment, so a point beside a long bone is near it', () => {
    const alongside = bind([[0.1, 5, 0]], [{ head: [0, 0, 0], tail: [0, 10, 0], region: 'trunk' }])
    const beyond = bind([[0.1, 20, 0]], [{ head: [0, 0, 0], tail: [0, 10, 0], region: 'trunk' }])

    expect(influences(alongside)[0]?.weight).toBe(1)
    // Clamped at the tail rather than reaching past it: a limb has no influence beyond its end.
    expect(influences(beyond)[0]?.weight).toBe(1)
  })

  // 🛑 Under `1/d` two bones at 1 and 2 shared a vertex two thirds to one third, and the dominant
  // weight averaged 0.46 over a whole body: no bone held its own flesh, so posing one left it.
  it('drops a bone twice as far to a QUARTER of the pull, not a half', () => {
    const binding = bind(
      [[1, 0, 0]],
      [
        { head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' },
        { head: [3, 0, 0], tail: [3, 1, 0], region: 'trunk' },
      ],
    )

    const [near, far] = influences(binding)
    expect(near?.weight).toBeCloseTo(0.8, 3)
    expect(far?.weight).toBeCloseTo(0.2, 3)
  })

  it('takes at most four bones, however many are near', () => {
    const six: Bone[] = Array.from({ length: 6 }, (_, index) => ({
      head: [index * 0.1, 0, 0],
      tail: [index * 0.1, 1, 0],
      region: 'trunk',
    }))

    expect(influences(bind([[0.25, 0.5, 0]], six))).toHaveLength(INFLUENCES)
  })

  it('answers a binding of the right size for every vertex', () => {
    const binding = bind(
      [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ],
      [{ head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' }],
    )

    expect(binding.skinIndex).toHaveLength(3 * INFLUENCES)
    expect(binding.skinWeight).toHaveLength(3 * INFLUENCES)
  })
})

/**
 * The risk this whole worker was designed around: with the arms hanging beside the body, a hand
 * bone passes within centimetres of the hip, and a nearest-four taken blind would have the hip
 * follow the hand.
 */
describe('keeping a limb from catching another limb', () => {
  const ARM_BESIDE_HIP: Bone[] = [
    { head: [0, 1, 0], tail: [0, 1.2, 0], region: 'trunk' },
    { head: [0.2, 1.9, 0], tail: [0.2, 1.05, 0], region: 'armLeft' },
    { head: [0.1, 1, 0], tail: [0.1, 0.5, 0], region: 'legLeft' },
  ]

  it('leaves a hip vertex to the leg and the trunk, never to the arm beside it', () => {
    const binding = bind([[0.12, 1, 0]], ARM_BESIDE_HIP)

    expect(influences(binding).map(influence => influence.bone)).not.toContain(1)
  })

  /**
   * The case the whole guard exists for, and the one a symmetric rule let through: a hip vertex
   * is nearest the HIPS, so its region is the trunk — and a trunk that agreed with everything put
   * the hand straight back among its influences. Raising the arm then tore the hip open.
   */
  it('leaves a vertex nearest a trunk bone to the trunk alone', () => {
    const armAtTheHip: Bone[] = [
      { head: [0, 1, 0], tail: [0, 1.2, 0], region: 'trunk' },
      { head: [0.1, 0.95, 0], tail: [0.1, 0.95, 0], region: 'armLeft' },
    ]
    const binding = bind([[0.02, 1, 0]], armAtTheHip)

    expect(influences(binding).map(influence => influence.bone)).toEqual([0])
  })

  it('still lets the trunk reach into a limb, since everything hangs off it', () => {
    const binding = bind([[0.2, 1.1, 0]], ARM_BESIDE_HIP)

    expect(influences(binding).map(influence => influence.bone)).toContain(0)
  })

  it('keeps one arm off the other', () => {
    const arms: Bone[] = [
      { head: [-0.05, 1, 0], tail: [-0.05, 1.5, 0], region: 'armLeft' },
      { head: [0.05, 1, 0], tail: [0.05, 1.5, 0], region: 'armRight' },
    ]
    const binding = bind([[-0.04, 1.2, 0]], arms)

    expect(influences(binding).map(influence => influence.bone)).toEqual([0])
  })
})

describe('a walk that takes a while', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (): [number, number, number] => [0, 0.5, 0])

  it('reports how far along it is', () => {
    const report = vi.fn()
    skinVertices(request(many(9000), [{ head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' }]), {
      report,
      cancelled: () => false,
    })

    expect(report).toHaveBeenCalled()
    expect(report.mock.calls.every(([value]) => value >= 0 && value < 1)).toBe(true)
  })

  it('stops where it is when it is taken back, rather than finishing anyway', () => {
    const binding = skinVertices(
      request(many(9000), [{ head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' }]),
      { report: () => {}, cancelled: () => true },
    )

    expect(binding).toBeNull()
  })

  it('answers the same binding twice for the same request', () => {
    const bones: Bone[] = [
      { head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' },
      { head: [1, 0, 0], tail: [1, 1, 0], region: 'armLeft' },
    ]
    const vertices: [number, number, number][] = [
      [0.3, 0.4, 0.1],
      [0.7, 0.9, 0],
    ]

    expect(bind(vertices, bones).skinWeight).toEqual(bind(vertices, bones).skinWeight)
  })
})

describe('the WebAssembly kernel', () => {
  it('produces the same indices and weights as the TypeScript fallback', async () => {
    const input = request(
      [
        [0.1, 0.4, 0],
        [0.8, 0.7, 0.2],
        [0.4, 1.2, 0],
      ],
      [
        { head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' },
        { head: [1, 0, 0], tail: [1, 1, 0], region: 'armLeft' },
        { head: [0.5, 1, 0], tail: [0.5, 1.4, 0], region: 'indexLeft' },
        { head: [0.6, 1, 0], tail: [0.6, 1.4, 0], region: 'middleLeft' },
        { head: [0.5, 1.4, 0], tail: [0.5, 1.4, 0], region: 'handle' },
      ],
    )
    await expectWasmAgrees(input)
  })

  /**
   * 🛑 The kernel holds the region table in its OWN constants — the handle, and the finger ranges
   * — while the walk derives them from `SKIN_REGIONS`. Five regions exercised left the rest free
   * to drift, and the binary is a checked-in blob no build step regenerates.
   */
  it('agrees on every region of the wire format, not the five a rig usually shows', async () => {
    const bones: Bone[] = SKIN_REGIONS.map((region, at) => ({
      head: [at * 0.5, 0, 0],
      tail: [at * 0.5, 1, 0],
      region,
    }))
    const vertices: [number, number, number][] = SKIN_REGIONS.map((_, at) => [
      at * 0.5 + 0.2,
      0.5,
      0.1,
    ])

    await expectWasmAgrees(request(vertices, bones))
  })

  it('keeps overlapping requests in separate memories', async () => {
    const createBinding = await loadSkinVerticesWasm()
    const first = createBinding(
      request([[0, 0, 0]], [{ head: [0, 0, 0], tail: [0, 1, 0], region: 'trunk' }]),
    )
    const second = createBinding(
      request([[10, 0, 0]], [{ head: [10, 0, 0], tail: [10, 1, 0], region: 'trunk' }]),
    )

    first.skinRange(0, 1)
    second.skinRange(0, 1)

    expect(influences(first.binding())[0]).toMatchObject({ bone: 0, weight: 1 })
    expect(influences(second.binding())[0]).toMatchObject({ bone: 0, weight: 1 })
  })
})

describe('a mesh with no rig to bind to', () => {
  it('answers empty influences rather than dividing by nothing', () => {
    const binding = bind([[0, 0, 0]], [])

    expect(binding.skinWeight).toEqual(new Float32Array(INFLUENCES))
  })
})

describe('a hand of five fingers', () => {
  /** The index and the middle a centimetre apart, and the hand they both leave from. */
  const HAND: readonly Bone[] = [
    { head: [0, 0, 0], tail: [0, 0.08, 0], region: 'armLeft' },
    { head: [0, 0.08, 0], tail: [0, 0.16, 0], region: 'indexLeft' },
    { head: [0.01, 0.08, 0], tail: [0.01, 0.16, 0], region: 'middleLeft' },
  ]

  // 🛑 Every finger was `armLeft`, so bending one moved two — seen on screen.
  it('leaves the flesh of one finger to that finger', () => {
    const binding = bind([[0, 0.12, 0]], HAND)

    expect(influences(binding).map(one => one.bone)).toEqual([1, 0])
  })

  // The hand still drives its own knuckles: a finger is INSIDE the arm, not beside it.
  it('lets the hand drive a knuckle its finger leaves from', () => {
    const binding = bind([[0, 0.085, 0]], HAND)

    expect(influences(binding).map(one => one.bone)).toContain(0)
  })
})
