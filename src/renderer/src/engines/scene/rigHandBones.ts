/**
 * The thirty finger bones, laid INSIDE the hands a body fit stops at the wrists.
 *
 * A hand is MEASURED where a mesh is handed over — its length, its width, the tip of each
 * finger's lane. Without one the forearm's proportions answer, which lays a chain along the hand.
 */
import {
  fingerRole,
  HUMANOID_FINGER_JOINTS,
  HUMANOID_FINGERS,
  HUMANOID_SIDES,
  type HumanoidSide,
} from '@shared/domain/humanoid'
import type { RigBone } from '@shared/domain/rig'
import type { Vector3 } from '@shared/domain/transform'
import { worldPlaces } from '../character/rigWorld'
import type { MeshSample } from './rigSnap'

/** Where a hand stands and which way it runs — the frame every finger is placed in. */
type HandFrame = { wrist: Vector3; along: Vector3; across: Vector3; up: Vector3 }

/**
 * 🛑 How far past the wrist a hand may reach, and how wide, as fractions of height. A hand is
 * 0.107 of a body long and 0.045 wide: at 0.25 and 0.09 the cylinder swallowed the hip of a
 * figure whose arms hang down, and one vertex there doubled the length read below.
 */
const HAND_REACH = 0.15
const HAND_GIRTH = 0.05

/**
 * 🛑 Where a tip is read. NOT 0.995: `floor(n * 0.995)` is `n - 1` for every lane under two
 * hundred points, which is most of them — the "quantile" was the raw maximum, and a single stray
 * vertex set a finger's reach.
 */
const TIP_QUANTILE = 0.98

/** How many points a hand must hold before it is measured rather than proportioned. */
const ENOUGH = 64

/** Where the knuckles sit along the hand, as a fraction of its length — the palm's own share. */
const KNUCKLE = 0.5
/** The same for the thumb, which leaves the hand at the wrist rather than at the knuckle line. */
const THUMB_KNUCKLE = 0.2

/** How far a finger must reach to be one of the four, as a fraction of the hand's own length. */
const FINGER_REACH = 0.8

/** Where each joint of a finger sits between its knuckle and its tip. */
const PHALANX: readonly number[] = [0, 0.45, 0.75]

/** How thick a slice a joint reads its centre from, as a fraction of the hand's length. */
const SLICE = 0.12

/** How far ACROSS its own finger a joint may look, so a chain never steps into the next one. */
const GRASP = 0.16

/**
 * 🛑 The shortest a chain may span, as a fraction of the hand. A lane whose flesh stops before the
 * knuckle line put all three joints at one place — two bones of ZERO length, which no `rigFaultOf`
 * refuses and which the gizmo cannot tell apart.
 */
const LEAST_REACH = 0.2

/** Three of them make half a forearm, which is a hand's own proportion. */
const SEGMENT = 1 / 6

/** The longest a hand may measure, as a fraction of the forearm it hangs from. */
const HAND_OF_FOREARM = 1

/** How wide an unmeasured hand is taken to be, as a fraction of its own length. */
const SPREAD = 0.7

/** The thirty bones, or `null` when the rig names no hand or already carries fingers. */
export function rigHandBones(
  bones: readonly RigBone[],
  sample: MeshSample | null = null,
): RigBone[] | null {
  const added: RigBone[] = []
  const world = worldPlaces(bones)

  for (const side of HUMANOID_SIDES) {
    const hand = bones.find(bone => bone.role === `${side}Hand`)
    const wrist = hand && world.get(hand.name)
    const arm = bones.find(bone => bone.role === `${side}LowerArm`)
    const elbow = arm && world.get(arm.name)
    // A hand that already has fingers is left alone: laying a second set on it would be thirty
    // names already taken, and `rigWithBones` would refuse the lot for one side's sake.
    if (!hand || !wrist || !elbow || bones.some(bone => bone.role === `${side}Thumb1`)) continue

    const frame = frameOf(wrist, elbow)
    const forearm = lengthOf(minus(wrist, elbow))
    if (!frame || forearm <= 0) continue

    const measured = sample && handOf(sample, frame, forearm)
    added.push(...fingersOf(side, hand.name, frame, measured ?? proportioned(forearm, side)))
  }

  return added.length > 0 ? added : null
}

/** What a hand is, in its own frame: how far it reaches, and where each finger's lane runs. */
type HandShape = {
  length: number
  /** One per finger, in `HUMANOID_FINGERS` order. */
  fingers: readonly FingerShape[]
}

/** Where a joint sits across its finger, and how far up the finger it is. */
type Across = { across: number; up: number }

/** Where one finger's joints stand, measured from the wrist in the hand's own frame. */
type FingerShape = {
  tip: number
  /** The centre of the flesh at that depth, sought around `from` — or over the whole slice. */
  at: (along: number, from: Across | null) => Across
}

/** Along its own bone, up out of the world's vertical, across the two. `null` where neither reads. */
function frameOf(wrist: Vector3, elbow: Vector3): HandFrame | null {
  const along = normalised(minus(wrist, elbow))
  if (!along) return null

  // An arm hanging straight down leaves no vertical to lean on; the world's X answers instead.
  const seed = Math.abs(along.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const up = normalised(minus(seed, scaled(along, dot(seed, along))))
  if (!up) return null

  return { wrist, along, across: cross(along, up), up }
}

/** What the mesh says this hand is, or `null` where too few points sit past the wrist. */
function handOf(sample: MeshSample, frame: HandFrame, forearm: number): HandShape | null {
  const height = sample.bounds.max.y - sample.bounds.min.y
  if (height <= 0) return null

  const held = cluster(sample, frame, height)
  if (held.length < ENOUGH) return null

  // 🛑 Bounded by the ARM it hangs from: flesh the cylinder caught by mistake — a hip, a thigh —
  // reads as a hand twice its own length, and the knuckles then fall past the fingertips.
  const length = Math.min(
    quantile(
      held.map(point => point.along),
      TIP_QUANTILE,
    ),
    forearm * HAND_OF_FOREARM,
  )
  if (length <= 0) return null

  const lanes = lanesOf(held, length)
  if (!lanes) return null

  return { length, fingers: lanes.map(lane => fingerOf(lane, length)) }
}

/** One point of the hand, in the hand's own frame. */
type HandPoint = { along: number; across: number; up: number }

/** Every sampled vertex sitting past the wrist and close enough to the hand's own axis. */
function cluster(sample: MeshSample, frame: HandFrame, height: number): HandPoint[] {
  const held: HandPoint[] = []
  const reach = height * HAND_REACH
  const girth = height * HAND_GIRTH

  for (let vertex = 0; vertex < sample.points.length; vertex += 3) {
    const offset = {
      x: (sample.points[vertex] ?? 0) - frame.wrist.x,
      y: (sample.points[vertex + 1] ?? 0) - frame.wrist.y,
      z: (sample.points[vertex + 2] ?? 0) - frame.wrist.z,
    }
    const along = dot(offset, frame.along)
    if (along < -girth || along > reach) continue

    const across = dot(offset, frame.across)
    const up = dot(offset, frame.up)
    if (Math.hypot(across, up) > girth) continue

    held.push({ along, across, up })
  }

  return held
}

/**
 * The five lanes a hand's fingers run in, in `HUMANOID_FINGERS` order.
 *
 * 🛑 A thumb is told by REACHING LESS FAR — 0.69 of the hand's length against 0.92 and beyond,
 * measured. Blind spot: a hand whose flesh stops at the four fingers on both sides, which is a
 * fist or a mitten; the width is then split five ways and one chain lands beside a finger.
 */
function lanesOf(held: readonly HandPoint[], length: number): HandPoint[][] | null {
  const far = held.filter(point => point.along > length * FINGER_REACH)
  const span = far.length < ENOUGH ? { from: 0, to: 0 } : spanOf(far)
  const below = held.filter(point => point.across < span.from)
  const above = held.filter(point => point.across > span.to)
  // Nothing reaches past the four fingers: no thumb to be told apart, so the width answers.
  if (span.to <= span.from || Math.max(below.length, above.length) < ENOUGH) {
    return lanesAcross(held, held, HUMANOID_FINGERS.length)
  }

  // 🛑 The side that reaches LESS FAR, never the one holding more points: both edges are always
  // peopled — the thenar on one, the hypothenar on the other — and a thumb tucked under the palm
  // let the little finger's edge win on count, taking the chain and reversing the four others.
  const thumb = reachOf(below) <= reachOf(above) ? below : above
  // 🛑 The four lanes take the span of the FINGERS and nothing outside it. Handed everything but
  // the thumb, the flesh past the outermost finger was clamped into its lane and carried the tip
  // 15 mm out of the hand — measured.
  const fingers = lanesAcross(
    far,
    held.filter(point => point.across >= span.from && point.across <= span.to),
    HUMANOID_FINGERS.length - 1,
  )
  if (!fingers) return null

  // Which side of the hand the thumb sits on decides which way `Index` … `Little` then runs.
  return [thumb, ...(thumb === below ? fingers : [...fingers].reverse())]
}

/** How far a set of points reaches past the wrist — what tells a thumb from a finger. */
function reachOf(points: readonly HandPoint[]): number {
  return points.length < ENOUGH
    ? Number.POSITIVE_INFINITY
    : quantile(
        points.map(point => point.along),
        TIP_QUANTILE,
      )
}

/** How wide a set of points runs across the hand, a stray vertex at either end left out. */
function spanOf(points: readonly HandPoint[]): { from: number; to: number } {
  const across = points.map(point => point.across)
  return { from: quantile(across, 1 - TIP_QUANTILE), to: quantile(across, TIP_QUANTILE) }
}

/** `count` equal lanes over the width `spread` measures, every point of `all` binned into one. */
function lanesAcross(
  spread: readonly HandPoint[],
  all: readonly HandPoint[],
  count: number,
): HandPoint[][] | null {
  if (spread.length < ENOUGH) return null

  const { from, to } = spanOf(spread)
  if (to <= from) return null

  const lanes: HandPoint[][] = Array.from({ length: count }, () => [])
  const width = (to - from) / count
  for (const point of all) {
    const lane = Math.min(count - 1, Math.max(0, Math.floor((point.across - from) / width)))
    lanes[lane]?.push(point)
  }

  return lanes
}

/**
 * One finger read off its own lane: where it leaves the hand, how far it reaches, and its line.
 *
 * 🛑 Sought within `GRASP` of the joint BEFORE it, never over the whole slice: a lane holds the
 * palm beside it, and a mean over the slice walked a tip into the finger next to it.
 */
function fingerOf(lane: readonly HandPoint[], length: number): FingerShape {
  const tip = quantile(
    lane.map(point => point.along),
    TIP_QUANTILE,
  )
  const slice = length * SLICE
  const grasp = length * GRASP

  return {
    tip: Math.max(tip, length * (KNUCKLE + LEAST_REACH)),
    at: (along, from) => {
      let across = 0
      let up = 0
      let held = 0
      for (const point of lane) {
        if (Math.abs(point.along - along) > slice) continue
        if (from && Math.hypot(point.across - from.across, point.up - from.up) > grasp) continue

        across += point.across
        up += point.up
        held += 1
      }

      return held === 0 ? (from ?? { across: 0, up: 0 }) : { across: across / held, up: up / held }
    },
  }
}

/**
 * A hand nobody measured: every finger takes the same width and reach, off the forearm alone.
 *
 * 🛑 `across` runs the opposite way on each side — it is `along × up`, and `along` is mirrored —
 * so the lanes are laid in reverse on the right, or the two thumbs point opposite ways in world.
 */
function proportioned(forearm: number, side: HumanoidSide): HandShape {
  const length = forearm * SEGMENT * 3
  const lane = (length * SPREAD) / HUMANOID_FINGERS.length
  const sign = side === 'Left' ? 1 : -1

  return {
    length,
    fingers: HUMANOID_FINGERS.map((_, index) => ({
      tip: length,
      at: () => ({ across: (index - 2) * lane * sign, up: 0 }),
    })),
  }
}

/** The fifteen bones of one hand, each resting in its parent's space. */
function fingersOf(
  side: HumanoidSide,
  hand: string,
  frame: HandFrame,
  shape: HandShape,
): RigBone[] {
  const bones: RigBone[] = []

  for (const [index, finger] of HUMANOID_FINGERS.entries()) {
    const lane = shape.fingers[index]
    if (!lane) continue

    // The thumb leaves the hand at the wrist, where the four others leave it at the knuckle line.
    const knuckle = shape.length * (finger === 'Thumb' ? THUMB_KNUCKLE : KNUCKLE)
    let held = { x: 0, y: 0, z: 0 }
    // The chain walks: each joint reads the flesh AROUND the one before it, so it follows its own
    // finger rather than the mean of everything at that depth.
    let sideways = lane.at(knuckle, null)

    for (const joint of HUMANOID_FINGER_JOINTS) {
      const share = PHALANX[joint - 1] ?? 0
      const along = knuckle + (lane.tip - knuckle) * share
      sideways = lane.at(along, sideways)
      const here = pointOf(frame, along, sideways)

      bones.push({
        name: `${side}${finger}${joint}`,
        parent: joint === 1 ? hand : `${side}${finger}${joint - 1}`,
        role: fingerRole(side, finger, joint),
        rest: {
          position: joint === 1 ? here : minus(here, held),
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      })
      held = here
    }
  }

  return bones
}

/** A place in the hand's frame, as an offset from the WRIST — which is where a chain hangs. */
function pointOf(frame: HandFrame, along: number, side: { across: number; up: number }): Vector3 {
  return {
    x: frame.along.x * along + frame.across.x * side.across + frame.up.x * side.up,
    y: frame.along.y * along + frame.across.y * side.across + frame.up.y * side.up,
    z: frame.along.z * along + frame.across.z * side.across + frame.up.z * side.up,
  }
}

/**
 * 🛑 SELECTED, never sorted: twenty of these are the whole cost of laying a hand, and sorting for
 * one order statistic cost 5.2 ms against 1.7 for the same twenty answers — measured.
 */
function quantile(values: readonly number[], at: number): number {
  if (values.length === 0) return 0

  const held = Float64Array.from(values)
  const rank = Math.min(held.length - 1, Math.floor(held.length * at))
  let from = 0
  let to = held.length - 1

  while (from < to) {
    const wall = partition(held, from, to)
    if (wall === rank) break
    if (wall < rank) from = wall + 1
    else to = wall - 1
  }

  return held[rank] ?? 0
}

/** Hoare's partition around the last value, in place — the one step of the selection above. */
function partition(held: Float64Array, from: number, to: number): number {
  const pivot = held[to] ?? 0
  let wall = from

  for (let at = from; at < to; at += 1) {
    if ((held[at] ?? 0) > pivot) continue

    const held_ = held[at] ?? 0
    held[at] = held[wall] ?? 0
    held[wall] = held_
    wall += 1
  }

  const last = held[to] ?? 0
  held[to] = held[wall] ?? 0
  held[wall] = last
  return wall
}

const minus = (one: Vector3, two: Vector3): Vector3 => ({
  x: one.x - two.x,
  y: one.y - two.y,
  z: one.z - two.z,
})

const scaled = (one: Vector3, by: number): Vector3 => ({
  x: one.x * by,
  y: one.y * by,
  z: one.z * by,
})

const dot = (one: Vector3, two: Vector3): number => one.x * two.x + one.y * two.y + one.z * two.z

const cross = (one: Vector3, two: Vector3): Vector3 => ({
  x: one.y * two.z - one.z * two.y,
  y: one.z * two.x - one.x * two.z,
  z: one.x * two.y - one.y * two.x,
})

const lengthOf = (one: Vector3): number => Math.hypot(one.x, one.y, one.z)

function normalised(one: Vector3): Vector3 | null {
  const length = lengthOf(one)
  return length > 0 ? scaled(one, 1 / length) : null
}
