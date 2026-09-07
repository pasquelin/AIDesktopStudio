import type { Vector3 } from '@shared/domain/transform'
import { COMPONENT_DEFAULTS } from '@game/runtime/componentDefaults'
import { textOf } from '@game/runtime/componentFields'
import { lookOf, type Look } from '@game/runtime/playView'
import { armRestOffsets } from '@game/runtime/systems/springArmRig'
import { restingAxes } from '@game/physics/quaternion'
import { nodesByWord, withBoundPlayerArm } from './playerModule'
import type { SceneNode } from './sceneState'

const ARM = COMPONENT_DEFAULTS.SpringArm

/**
 * An arm as a viewport can draw it. OFFSETS and not world points, so the aid follows a dragged
 * module without being recomputed: `lift` reaches the body up to the pivot, `back` the pivot out
 * to the seat.
 */
export type ArmRig = { subjectId: string; lift: Vector3; back: Vector3 }

/** How a node is turned, in world — what only the scene graph can answer. */
export type ArmFacing = (id: string) => Vector3 | null

/**
 * Every arm's rest shape, keyed by the node carrying it. 🛑 Built off `withBoundPlayerArm`, so the
 * aid draws the arm the GAME will ride — a field naming `Capsule` resolves inside its own module,
 * past any namesake elsewhere. The look is the one the first frame of play takes.
 */
export function springArmRigsOf(
  nodes: readonly SceneNode[],
  facingOf: ArmFacing,
): ReadonlyMap<string, ArmRig> {
  const bound = withBoundPlayerArm(nodes)
  const found = new Map<string, ArmRig>()
  // Built only once an arm is actually found: a scene of forty thousand nodes and no spring arm
  // paid a Map of forty thousand entries on every selection and every frame of a drag.
  let held: Map<string, SceneNode> | null = null

  for (const node of bound) {
    const arm = node.components?.find(one => one.type === 'SpringArm')
    if (!arm) continue

    // The id first and the FIRST name after, exactly as `entityNamed` resolves one: an arm outside
    // a module keeps the name its author typed, and reading ids alone drew nothing for those.
    held ??= nodesByWord(bound)
    const subjectId = held.get(textOf(arm, 'subject', ARM.subject))?.id
    if (!subjectId) continue

    // 🛑 The three arms of `aimedAt` (`springArm.ts`) and its fallback, or the aid draws an arm
    // otherwise than it will be ridden: an orientation the registry gains later falls back on the
    // POINTER there, and reading anything else here would be silently wrong.
    const orientation = textOf(arm, 'orientation', ARM.orientation)
    const turned =
      orientation === 'subject'
        ? facingOf(subjectId)
        : orientation === 'fixed'
          ? facingOf(node.id)
          : null
    const look = turned ? lookOf(turned, AXES, LOOK) : LEVEL

    const lift = { x: 0, y: 0, z: 0 }
    const back = { x: 0, y: 0, z: 0 }
    armRestOffsets(arm, look, lift, back)
    found.set(node.id, { subjectId, lift, back })
  }
  return found
}

const AXES = restingAxes()
const LOOK: Look = { yaw: 0, pitch: 0 }
const LEVEL: Look = { yaw: 0, pitch: 0 }
/** Both offsets are worked out from nothing, which is what makes them offsets. */
