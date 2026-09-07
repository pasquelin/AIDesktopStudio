// SPDX-License-Identifier: MIT

import type { Vector3 } from '@shared/domain/transform'
import { clamp } from '../numeric'

export type Quaternion = { x: number; y: number; z: number; w: number }

/**
 * Intrinsic XYZ — what three.js reads an `Euler` in by default, so what every angle already
 * written in a document means. By hand rather than through three, which an exported game would
 * then carry whole for two conversions.
 */
export function quaternionFromEuler(angles: Vector3, into = restingTurn()): Quaternion {
  const c1 = Math.cos(angles.x / 2)
  const c2 = Math.cos(angles.y / 2)
  const c3 = Math.cos(angles.z / 2)
  const s1 = Math.sin(angles.x / 2)
  const s2 = Math.sin(angles.y / 2)
  const s3 = Math.sin(angles.z / 2)

  into.x = s1 * c2 * c3 + c1 * s2 * s3
  into.y = c1 * s2 * c3 - s1 * c2 * s3
  into.z = c1 * c2 * s3 + s1 * s2 * c3
  into.w = c1 * c2 * c3 - s1 * s2 * s3
  return into
}

const restingTurn = (): Quaternion => ({ x: 0, y: 0, z: 0, w: 1 })

/**
 * The same convention back. Written INTO the vector it is given: a step reads a pose per body per
 * frame, and a fresh object each would be the only allocation a settled scene still made.
 */
export function eulerFromQuaternion(rotation: Quaternion, into: Vector3): Vector3 {
  const { x, y, z, w } = rotation
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2

  const m11 = 1 - (yy + zz)
  const m12 = xy - wz
  const m13 = xz + wy
  const m22 = 1 - (xx + zz)
  const m23 = yz - wx
  const m32 = yz + wx
  const m33 = 1 - (xx + yy)

  into.y = Math.asin(clamp(m13, -1, 1))
  // Straight up or straight down: the first and third angles turn about the SAME axis there, so
  // only their sum is defined. three.js hands the whole of it to the first, and so does this.
  if (Math.abs(m13) < 0.9999999) {
    into.x = Math.atan2(-m23, m33)
    into.z = Math.atan2(-m12, m11)
  } else {
    into.x = Math.atan2(m32, m22)
    into.z = 0
  }

  return into
}

/**
 * The turn that points a node's FORWARD — three's −Z — along `direction`, with +Y up. A direction
 * of nothing leaves `into` as it was: turning to an arbitrary one would be a visible flick.
 */
export function quaternionLookingAt(direction: Vector3, into = restingTurn()): Quaternion {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (length === 0) return into

  // The node's own +Z points AWAY from what it looks at, which is what makes −Z the forward.
  const backX = -direction.x / length
  const backY = -direction.y / length
  const backZ = -direction.z / length

  // The side axis is `up × back` with up at +Y, which has no y of its own. Straight up or down it
  // has no length either, so the look is nudged off the pole — what three's own `lookAt` does,
  // and what keeps a turret tracking something overhead instead of freezing.
  const nudged = Math.hypot(backZ, backX) === 0 ? backZ + 1e-4 : backZ
  const across = Math.hypot(nudged, backX)
  const sideX = nudged / across
  const sideZ = -backX / across

  const upX = backY * sideZ
  const upY = nudged * sideX - backX * sideZ
  const upZ = -backY * sideX

  return quaternionFromBasis({ backX, backY, sideX, sideZ, upX, upY, upZ, nudged }, into)
}

type LookBasis = {
  backX: number
  backY: number
  sideX: number
  sideZ: number
  upX: number
  upY: number
  upZ: number
  nudged: number
}

function quaternionFromBasis(basis: LookBasis, into: Quaternion): Quaternion {
  const { backX, backY, sideX, sideZ, upX, upY, upZ, nudged } = basis

  const trace = sideX + upY + nudged
  if (trace > 0) {
    const scale = 0.5 / Math.sqrt(trace + 1)
    into.w = 0.25 / scale
    into.x = (upZ - backY) * scale
    into.y = (backX - sideZ) * scale
    into.z = (0 - upX) * scale
    return into
  }
  if (sideX > upY && sideX > nudged) {
    const root = 2 * Math.sqrt(1 + sideX - upY - nudged)
    into.w = (upZ - backY) / root
    into.x = 0.25 * root
    into.y = upX / root
    into.z = (backX + sideZ) / root
    return into
  }
  if (upY > nudged) {
    const root = 2 * Math.sqrt(1 + upY - sideX - nudged)
    into.w = (backX - sideZ) / root
    into.x = upX / root
    into.y = 0.25 * root
    into.z = (backY + upZ) / root
    return into
  }

  const root = 2 * Math.sqrt(1 + nudged - sideX - upY)
  into.w = (0 - upX) / root
  into.x = (backX + sideZ) / root
  into.y = (backY + upZ) / root
  into.z = 0.25 * root
  return into
}

/** A body's three axes in the world: its forward is three's −Z, its right +X, its up +Y. */
export type Axes = { forward: Vector3; right: Vector3; up: Vector3 }

/**
 * The axes a rotation turns the basis into, written INTO `into` — read per piloted body per step.
 * The columns of the rotation matrix, with the forward negated so it points where the node looks.
 */
export function axesOf(rotation: Quaternion, into: Axes): Axes {
  const { x, y, z, w } = rotation
  const xx = x * x
  const yy = y * y
  const zz = z * z
  const xy = x * y
  const xz = x * z
  const yz = y * z
  const wx = w * x
  const wy = w * y
  const wz = w * z

  into.right.x = 1 - 2 * (yy + zz)
  into.right.y = 2 * (xy + wz)
  into.right.z = 2 * (xz - wy)
  into.up.x = 2 * (xy - wz)
  into.up.y = 1 - 2 * (xx + zz)
  into.up.z = 2 * (yz + wx)
  into.forward.x = -2 * (xz + wy)
  into.forward.y = -2 * (yz - wx)
  into.forward.z = -(1 - 2 * (xx + yy))
  return into
}

export const restingAxes = (): Axes => ({
  forward: { x: 0, y: 0, z: -1 },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
})

/** The axes an entity's own Euler angles turn the basis into — what a piloted body is read by. */
export function axesOfEuler(angles: Vector3, into: Axes): Axes {
  return axesOf(quaternionFromEuler(angles, TURNED), into)
}

const TURNED: Quaternion = { x: 0, y: 0, z: 0, w: 1 }

export const dot = (one: Vector3, other: Vector3): number =>
  one.x * other.x + one.y * other.y + one.z * other.z

function normalized(turn: Quaternion): Quaternion {
  const length = Math.hypot(turn.x, turn.y, turn.z, turn.w)
  if (length === 0) return turn
  turn.x /= length
  turn.y /= length
  turn.z /= length
  turn.w /= length
  return turn
}

/**
 * The shortest turn from `from` to `to`, `fraction` of the way. 🛑 Quaternions and not Euler
 * angles: interpolating three angles walks another path and flips at the poles, which a turret
 * tracking something overhead reaches every time.
 */
export function quaternionSlerp(
  from: Quaternion,
  to: Quaternion,
  fraction: number,
  into = restingTurn(),
): Quaternion {
  let dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w
  // The far side of the same rotation: a quaternion and its negative are one turn, and taking the
  // sign as given would slerp the long way round half the time.
  const sign = dot < 0 ? -1 : 1
  dot = Math.abs(dot)

  if (dot > 0.9995) {
    into.x = from.x + (to.x * sign - from.x) * fraction
    into.y = from.y + (to.y * sign - from.y) * fraction
    into.z = from.z + (to.z * sign - from.z) * fraction
    into.w = from.w + (to.w * sign - from.w) * fraction
    return normalized(into)
  }

  const angle = Math.acos(clamp(dot, -1, 1))
  const sine = Math.sin(angle)
  const near = Math.sin((1 - fraction) * angle) / sine
  const far = (Math.sin(fraction * angle) / sine) * sign
  into.x = from.x * near + to.x * far
  into.y = from.y * near + to.y * far
  into.z = from.z * near + to.z * far
  into.w = from.w * near + to.w * far
  return into
}

/** The turn between two rotations, in radians. What a capped turning speed is measured against. */
export function angleBetween(from: Quaternion, to: Quaternion): number {
  const dot = Math.abs(from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w)
  return 2 * Math.acos(clamp(dot, -1, 1))
}
