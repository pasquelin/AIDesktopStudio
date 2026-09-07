// SPDX-License-Identifier: MIT

import type { Component } from '@shared/domain/component'
import type { Vector3 } from '@shared/domain/transform'
import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { numberOf } from '../componentFields'
import { aheadOf, type Look } from '../playView'

/**
 * The pivot an arm turns around. Apart from the system so the viewport can draw a resting arm
 * from the very lines the game will ride — a second copy is how a helper comes to draw another.
 */
export function armPivot(
  anchor: Vector3,
  height: number,
  shoulder: number,
  yaw: number,
  into: Vector3,
): Vector3 {
  into.x = anchor.x + Math.cos(yaw) * shoulder
  into.y = anchor.y + height
  into.z = anchor.z - Math.sin(yaw) * shoulder
  return into
}

/** The seat itself: the pivot pushed back along the look, by the length asked for. */
export function armSeat(pivot: Vector3, ahead: Vector3, length: number, into: Vector3): Vector3 {
  into.x = pivot.x - ahead.x * length
  into.y = pivot.y - ahead.y * length
  into.z = pivot.z - ahead.z * length
  return into
}

/**
 * The two offsets a resting arm hangs by: `lift` reaches its anchor up to the pivot, `back` the
 * pivot out to the seat. Written here beside the primitives because THREE callers derived them —
 * the viewport aid, the node factory and the templates — and a third copy is how they drift.
 */
export function armRestOffsets(
  arm: Component | null,
  look: Look,
  lift: Vector3,
  back: Vector3,
): void {
  armPivot(
    ORIGIN,
    numberOf(arm, 'height', ARM.height),
    numberOf(arm, 'shoulder', ARM.shoulder),
    look.yaw,
    lift,
  )
  armSeat(ORIGIN, aheadOf(look, AHEAD), numberOf(arm, 'length', ARM.length), back)
}

const ARM = COMPONENT_DEFAULTS.SpringArm
const ORIGIN: Vector3 = { x: 0, y: 0, z: 0 }
/** Rewritten in place: an offset is worked out once per arm and allocates nothing doing it. */
const AHEAD: Vector3 = { x: 0, y: 0, z: 0 }
