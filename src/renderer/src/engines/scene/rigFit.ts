/**
 * A humanoid skeleton fitted to a mesh, from its bounding box alone.
 *
 * Arithmetic and nothing else — no three objects, no GPU — because this is where a rig is either
 * right or visibly wrong, and it has to be held to account without a viewport.
 *
 * The body only, twenty-two bones, stopping at the wrists: a bounding box cannot say where a
 * knuckle is, and thirty finger bones dropped at a guess would capture vertices at a guess.
 */
import { HUMANOID_BODY_ROLES, type HumanoidBodyRole } from '@shared/domain/humanoid'
import type { Rig, RigBone } from '@shared/domain/rig'
import type { Vector3 } from '@shared/domain/transform'

export type Bounds = { min: Vector3; max: Vector3 }

/** Why a mesh cannot be fitted, or nothing. Named so the inspector can say which it is. */
export type RigFitFault = 'noGeometry' | 'lyingDown'

export const RIG_FIT_FAULTS: readonly RigFitFault[] = ['noGeometry', 'lyingDown']

/**
 * How tall a mesh must be before a proportion means anything. Below it every bone would land on
 * every other, and the weights would be noise.
 */
const MIN_HEIGHT = 1e-4

/**
 * Where each role sits, as a fraction of the mesh's height and half-width.
 *
 * These are the proportions of a standing adult, and they are the whole of the fit: `y` counts up
 * from the feet, `x` is signed outward from the centre, `z` forward. A model that is not roughly
 * human-shaped gets a rig that is roughly wrong — which is why the fit is a starting point the
 * skeleton editor exists to correct.
 */
type Placement = {
  role: HumanoidBodyRole
  parent: HumanoidBodyRole | null
  y: number
  x: number
  z: number
}

const SPINE: readonly Placement[] = [
  { role: 'Hips', parent: null, y: 0.53, x: 0, z: 0 },
  { role: 'Spine', parent: 'Hips', y: 0.6, x: 0, z: 0 },
  { role: 'Chest', parent: 'Spine', y: 0.68, x: 0, z: 0 },
  { role: 'UpperChest', parent: 'Chest', y: 0.76, x: 0, z: 0 },
  { role: 'Neck', parent: 'UpperChest', y: 0.86, x: 0, z: 0 },
  { role: 'Head', parent: 'Neck', y: 0.92, x: 0, z: 0 },
]

/**
 * A limb's parent is either a bone of the trunk, which has no side, or the limb part above it,
 * which takes the same side. Told apart here rather than by spelling, since `UpperChest` prefixed
 * with a side is a role that does not exist.
 */
type LimbParent = { trunk: HumanoidBodyRole } | { sided: string }

/**
 * One side, mirrored by `x`, with the arms hanging DOWN the body. `Left` is the mesh's own left.
 *
 * The arms are lifted from here by `ARM_OUT` when the box says they are spread — see `spreadOf`.
 */
const LIMB: readonly { part: string; parent: LimbParent; y: number; x: number; z: number }[] = [
  { part: 'Shoulder', parent: { trunk: 'UpperChest' }, y: 0.82, x: 0.05, z: 0 },
  { part: 'UpperArm', parent: { sided: 'Shoulder' }, y: 0.82, x: 0.12, z: 0 },
  { part: 'LowerArm', parent: { sided: 'UpperArm' }, y: 0.63, x: 0.14, z: 0 },
  { part: 'Hand', parent: { sided: 'LowerArm' }, y: 0.45, x: 0.16, z: 0 },
  { part: 'UpperLeg', parent: { trunk: 'Hips' }, y: 0.52, x: 0.07, z: 0 },
  { part: 'LowerLeg', parent: { sided: 'UpperLeg' }, y: 0.28, x: 0.07, z: 0 },
  { part: 'Foot', parent: { sided: 'LowerLeg' }, y: 0.04, x: 0.07, z: 0 },
  { part: 'Toes', parent: { sided: 'Foot' }, y: 0.01, x: 0.07, z: 0.06 },
]

/** Where the shoulder sits, and where an arm held out stays. */
const SHOULDER_Y = 0.82

/**
 * How far out each arm joint reaches at FULL spread, as a fraction of height: an adult's arm span
 * is about their own height, so half of it at the wrist, less a hand.
 */
const ARMS_OUT_REACH = 0.42
const ARM_OUT: Record<string, number> = { UpperArm: 0.12, LowerArm: 0.27, Hand: ARMS_OUT_REACH }

/**
 * The widest a figure with its arms DOWN gets, as a fraction of height — shoulders plus the hands
 * beside them. Past it, the extra span is arms held out.
 */
const BODY_HALF_WIDTH = 0.17

/**
 * How much wider than tall a figure may be before it is taken for one lying down.
 *
 * A T-pose — the commonest bind pose there is — spans about as wide as it stands, so requiring
 * height to WIN would refuse half the characters there are and blame the user for it. A figure
 * actually on its side is several times wider than tall, so the two do not overlap.
 */
const LYING_RATIO = 1.6

export function rigFitFaultOf(bounds: Bounds): RigFitFault | null {
  const size = sizeOf(bounds)
  if (size.y < MIN_HEIGHT || size.x <= 0 || size.z <= 0) return 'noGeometry'

  // Proportions are read off the height, so a mesh on its side would lay every bone ACROSS the
  // body. Reported rather than guessed at: standing it up is the user's call.
  return Math.max(size.x, size.z) > size.y * LYING_RATIO ? 'lyingDown' : null
}

/**
 * The rig a mesh of these bounds gets. Call `rigFitFaultOf` first — on a mesh it refuses, the
 * proportions here answer numbers nobody should pose a bone at.
 */
export function rigFit(bounds: Bounds): Rig {
  const size = sizeOf(bounds)
  const centre = { x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2 }
  const across = acrossAxisOf(size)
  const forward = across === 'x' ? 'z' : 'x'
  const spread = spreadOf(size, across)

  const world = new Map<HumanoidBodyRole, Vector3>()
  const placed: Placement[] = [...SPINE, ...mirrored('Left', spread), ...mirrored('Right', spread)]

  for (const placement of placed) {
    const here = { x: centre.x, y: bounds.min.y + placement.y * size.y, z: centre.z }
    here[across] = centre[across] + placement.x * size.y
    here[forward] = centre[forward] + placement.z * size.y
    world.set(placement.role, here)
  }

  return { origin: 'local', bones: placed.map(placement => boneOf(placement, world)) }
}

/**
 * Which horizontal axis the shoulders run along — MEASURED, never assumed.
 *
 * The wider of the two, because a figure is wider across than it is deep, arms out or down. Taking
 * X for granted laid the whole skeleton across a model authored facing +X: on screen it read as a
 * rig turned a quarter turn, and no test saw it.
 *
 * 🛑 The blind spot is the SIGN: nothing in a bounding box says whether the face points at +Z or
 * −Z, so the toes of a figure authored backwards point behind it. A joint the gizmo moves is the
 * answer to that, not a guess here.
 */
function acrossAxisOf(size: Vector3): 'x' | 'z' {
  return size.x >= size.z ? 'x' : 'z'
}

/**
 * How far the arms are held out, 0 down the body and 1 straight out.
 *
 * Read off the box and nothing else: a T-pose spans about as wide as it stands, so span past a
 * body's own width IS arms. Laid down the body whatever the mesh did, every T-posed character —
 * the commonest bind pose there is — got a skeleton whose arms ran outside its own.
 */
function spreadOf(size: Vector3, across: 'x' | 'z'): number {
  const reach = size[across] / 2 / size.y
  const out = (reach - BODY_HALF_WIDTH) / (ARMS_OUT_REACH - BODY_HALF_WIDTH)

  return Math.min(1, Math.max(0, out))
}

/**
 * One arm and one leg of the given side, with `Left`/`Right` prefixed, `x` signed, and the arm
 * raised towards the shoulder line by however much the box says it is spread.
 */
function mirrored(side: 'Left' | 'Right', spread: number): Placement[] {
  const sign = side === 'Left' ? 1 : -1

  return LIMB.map(limb => {
    const out = ARM_OUT[limb.part]

    return {
      role: roleOf(side, limb.part),
      parent: 'trunk' in limb.parent ? limb.parent.trunk : roleOf(side, limb.parent.sided),
      y: out === undefined ? limb.y : limb.y + (SHOULDER_Y - limb.y) * spread,
      x: (out === undefined ? limb.x : limb.x + (out - limb.x) * spread) * sign,
      z: limb.z,
    }
  })
}

/** Cast-free: the table's strings are role halves, and this is what makes them a role again. */
function roleOf(side: 'Left' | 'Right', part: string): HumanoidBodyRole {
  const name = `${side}${part}`
  const role = HUMANOID_BODY_ROLES.find(candidate => candidate === name)
  if (!role) throw new Error(`the limb table spells a role that does not exist: ${name}`)
  return role
}

/** A bone rests in its PARENT's space, so the parent's place is taken off before it is written. */
function boneOf(placement: Placement, world: Map<HumanoidBodyRole, Vector3>): RigBone {
  const here = world.get(placement.role)
  if (!here) throw new Error(`the fit placed no bone for ${placement.role}`)

  const parent = placement.parent === null ? null : world.get(placement.parent)

  return {
    name: placement.role,
    parent: placement.parent,
    role: placement.role,
    rest: {
      position: parent
        ? { x: here.x - parent.x, y: here.y - parent.y, z: here.z - parent.z }
        : here,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  }
}

function sizeOf(bounds: Bounds): Vector3 {
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  }
}
