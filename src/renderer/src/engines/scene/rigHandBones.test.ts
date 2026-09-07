import { describe, expect, it } from 'vitest'
import { rigFaultOf, type RigBone } from '@shared/domain/rig'
import type { Vector3 } from '@shared/domain/transform'
import { rigFit, type Bounds } from './rigFit'
import type { MeshSample } from './rigSnap'
import { rigHandBones } from './rigHandBones'

/** A metre-eighty character standing on the ground, arms DOWN the body. */
const STANDING: Bounds = { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } }

/**
 * The same, arms held OUT. The fit then lays each hand on the shoulder line pointing along X,
 * which is the one frame a fixture can name its own lanes in: `up` is Y and `across` is Z.
 */
const SPREAD: Bounds = { min: { x: -0.9, y: 0, z: -0.2 }, max: { x: 0.9, y: 1.8, z: 0.2 } }

const HEIGHT = 1.8
/** Where the fit puts a wrist on `SPREAD`: the shoulder line, an arm span from the middle. */
const WRIST: Vector3 = { x: 0.42 * HEIGHT, y: 0.82 * HEIGHT, z: 0 }

/** Which hand: the fixture mirrors on X, so both are measured and neither takes the other's. */
const SIDES: readonly (1 | -1)[] = [1, -1]

/** One lane of flesh: how far across it sits, how far it reaches, and how far out of the palm. */
type Lane = { across: number; reach: number; lift: number }

/**
 * A thumb reaching half as far as the fingers and standing wide of them, then four fingers of
 * falling length. The proportions of a hand, which is what tells one lane from the next.
 */
const HAND: readonly Lane[] = [
  { across: -0.062, reach: 0.1, lift: -0.035 },
  { across: -0.03, reach: 0.172, lift: 0 },
  { across: 0, reach: 0.18, lift: 0 },
  { across: 0.03, reach: 0.17, lift: 0 },
  { across: 0.06, reach: 0.157, lift: 0 },
]

/**
 * A hand built out of lanes, at both wrists, in the model's own space.
 *
 * A palm from the wrist to the knuckles, then one bar of flesh per lane. Mirrored on X so a rig
 * of two hands is measured, which is what proves the sides are not swapped.
 */
function handSample(): MeshSample {
  const points: number[] = []
  const at = (side: 1 | -1, along: number, across: number, up: number): void => {
    points.push(side * (WRIST.x + along), WRIST.y + up, across)
  }

  for (const side of SIDES) {
    for (let along = -0.01; along <= 0.09; along += 0.004) {
      for (let across = -0.07; across <= 0.07; across += 0.004) {
        for (const up of [-0.014, 0, 0.014]) at(side, along, across, up)
      }
    }

    for (const lane of HAND) {
      const from = lane.lift === 0 ? 0.09 : 0.02
      for (let along = from; along <= lane.reach; along += 0.004) {
        for (const across of [lane.across - 0.01, lane.across, lane.across + 0.01]) {
          for (const up of [lane.lift - 0.01, lane.lift, lane.lift + 0.01])
            at(side, along, across, up)
        }
      }
    }
  }

  return { bounds: SPREAD, points: new Float32Array(points) }
}

/** Where a bone stands in the model's space, by walking its parents back up. */
function worldOf(bones: readonly RigBone[], name: string): Vector3 {
  const at = { x: 0, y: 0, z: 0 }
  let current: string | null = name

  while (current) {
    const bone: RigBone | undefined = bones.find(one => one.name === current)
    if (!bone) throw new Error(`no bone named ${current}`)
    at.x += bone.rest.position.x
    at.y += bone.rest.position.y
    at.z += bone.rest.position.z
    current = bone.parent
  }

  return at
}

describe('adding the hands', () => {
  const HANDS = rigHandBones(rigFit(STANDING).bones) ?? []

  it('lays the thirty of the standard, and only those', () => {
    expect(HANDS).toHaveLength(30)
    expect(new Set(HANDS.map(bone => bone.role)).size).toBe(30)
  })

  it('hangs each finger off its hand, then joint after joint', () => {
    const index = HANDS.filter(bone => bone.name.startsWith('LeftIndex'))

    expect(index.map(bone => bone.parent)).toEqual(['LeftHand', 'LeftIndex1', 'LeftIndex2'])
  })

  it('makes a rig that holds, which is what lets the command write it', () => {
    expect(rigFaultOf([...rigFit(STANDING).bones, ...HANDS])).toBeNull()
  })

  it('lays no second set on a hand that already has fingers', () => {
    expect(rigHandBones([...rigFit(STANDING).bones, ...HANDS])).toBeNull()
  })

  it('lays nothing at all on a rig naming no hand', () => {
    const [hips] = rigFit(STANDING).bones
    if (!hips) throw new Error('the fit places a bone at the hips')

    expect(rigHandBones([hips])).toBeNull()
  })

  /**
   * 🛑 The chains used to be laid along the world's X and spread along Z, whatever the arm did.
   * On a character authored facing X they hung in the air beside the hand — seen on screen.
   */
  it('runs every chain along the arm it hangs from, not along an axis of the world', () => {
    const bones = rigFit(SPREAD).bones
    const laid = [...bones, ...(rigHandBones(bones) ?? [])]
    const wrist = worldOf(laid, 'LeftHand')
    const tip = worldOf(laid, 'LeftMiddle3')

    // The arms of `SPREAD` run along X, so a finger's reach is X and nothing else.
    expect(tip.x - wrist.x).toBeGreaterThan(0)
    expect(Math.abs(tip.y - wrist.y)).toBeLessThan(Math.abs(tip.x - wrist.x))
    expect(Math.abs(tip.z - wrist.z)).toBeLessThan(Math.abs(tip.x - wrist.x))
  })

  /**
   * 🛑 `across` is `along × up`, so it runs the opposite way on each side. Laid at the same lane
   * index on both, the two thumbs pointed opposite ways in the world — a hand and its mirror.
   */
  it('mirrors the two hands, so neither thumb points where the other does not', () => {
    const bones = rigFit(SPREAD).bones
    const laid = [...bones, ...(rigHandBones(bones) ?? [])]
    const across = (side: string, finger: string): number =>
      worldOf(laid, `${side}${finger}1`).z - worldOf(laid, `${side}Hand`).z

    expect(Math.sign(across('Left', 'Thumb'))).toBe(Math.sign(across('Right', 'Thumb')))
    expect(Math.sign(across('Left', 'Little'))).toBe(Math.sign(across('Right', 'Little')))
    expect(Math.sign(across('Left', 'Thumb'))).toBe(-Math.sign(across('Left', 'Little')))
  })
})

describe('hands fitted to the mesh', () => {
  const bones = rigFit(SPREAD).bones
  const laid = [...bones, ...(rigHandBones(bones, handSample()) ?? [])]

  it('reaches each finger as far as its own flesh, never as far as the longest', () => {
    const wrist = worldOf(laid, 'LeftHand')
    const reach = (finger: string): number => worldOf(laid, `Left${finger}3`).x - wrist.x

    expect(reach('Middle')).toBeGreaterThan(reach('Little'))
    expect(reach('Middle')).toBeLessThan(0.18)
  })

  // Each chain has to sit in ITS lane: laid on one line they would be a grid beside the fingers,
  // which is exactly what the arithmetic placement drew.
  it('lays each chain in the lane its own finger occupies', () => {
    const acrossOf = (finger: string): number => worldOf(laid, `Left${finger}1`).z

    expect(acrossOf('Index')).toBeLessThan(acrossOf('Middle'))
    expect(acrossOf('Middle')).toBeLessThan(acrossOf('Ring'))
    expect(acrossOf('Ring')).toBeLessThan(acrossOf('Little'))
  })

  /**
   * 🛑 The thumb is the lane that reaches LESS FAR, not the one out of the palm's plane: told
   * apart by the plane, a hand with the thumb spread flat gave it a lane among the fingers.
   */
  it('lays the thumb in the flesh that stops short of the fingers', () => {
    const tip = worldOf(laid, 'LeftThumb3')

    expect(tip.z).toBeLessThan(worldOf(laid, 'LeftIndex3').z)
    expect(tip.y).toBeLessThan(worldOf(laid, 'LeftMiddle3').y)
    expect(tip.x - worldOf(laid, 'LeftHand').x).toBeLessThan(0.1)
  })

  // Both hands are measured, and neither takes the other's answer.
  it('measures each hand on its own side of the body', () => {
    const left = worldOf(laid, 'LeftMiddle3')
    const right = worldOf(laid, 'RightMiddle3')

    expect(left.x).toBeGreaterThan(0)
    expect(right.x).toBeLessThan(0)
    expect(left.y).toBeCloseTo(right.y, 2)
  })

  // A mesh nobody can read must not make up a hand: the proportions answer instead.
  it('falls back to the proportions of the forearm where the mesh holds no hand', () => {
    const empty = { bounds: SPREAD, points: new Float32Array() }

    expect(rigHandBones(bones, empty)).toHaveLength(30)
  })
})
