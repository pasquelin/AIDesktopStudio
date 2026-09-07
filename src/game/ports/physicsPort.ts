// SPDX-License-Identifier: MIT

import type { Transform, Vector3 } from '@shared/domain/transform'
import type { Quaternion } from '../physics/quaternion'
import type { ColliderShape } from '../physics/shape'

/** Who moves a body: nobody, the simulation, or the game writing its pose. */
export type BodyKind = 'fixed' | 'dynamic' | 'kinematic'

export type BodyDescriptor = {
  /** The entity it stands for — or a name of the world's own, for a floor that is not one. */
  body: string
  kind: BodyKind
  shape: ColliderShape
  transform: Transform
  friction: number
  restitution: number
  /** Zero leaves the engine to weigh the shape itself, which is what an author usually wants. */
  mass: number
  gravityScale: number
  lockRotation: boolean
  /** Feels contacts and stops nothing — what a `Trigger` is. */
  sensor: boolean
  /** Moved by `moveCharacters` rather than by the step, and told what it hit. */
  character: CharacterSettings | null
  /** Carried on wheels the engine suspends and drives — what a `Vehicle` is. */
  vehicle: VehicleSettings | null
}

/** What the engine's character controller is given, in the units an author reads. */
export type CharacterSettings = {
  /** The tallest ledge walked over rather than bumped into. */
  stepHeight: number
  /** Degrees. Past it the character slides back down instead of climbing. */
  slopeLimit: number
  /** How far below the feet the ground is still caught, so a slope down is walked, not fallen. */
  snapDistance: number
}

/**
 * One wheel. `body` is the entity that DRAWS it, and its world pose comes back in `poses`.
 *
 * 🛑 `at` is where the wheel RESTS in the body's frame; the engine anchors the spring above it.
 */
export type VehicleWheel = {
  body: string
  at: Vector3
  steers: boolean
  driven: boolean
  handBraked: boolean
}

export type VehicleSettings = {
  wheelRadius: number
  wheelWidth: number
  /** Metres of travel: the spring is anchored that far ABOVE `at`, and compresses under load. */
  suspensionLength: number
  /** Degrees, at full lock. */
  maxSteerAngle: number
  /** Newton-metres the engine can put through the driven wheels. */
  maxTorque: number
  wheels: readonly VehicleWheel[]
}

/** What a driver asks of a vehicle this step, each between −1 and 1 or 0 and 1. */
export type VehicleDrive = {
  body: string
  forward: number
  /** Full lock to the right at 1, to the left at −1. */
  steer: number
  brake: number
  handBrake: number
}

/** Newtons and newton-metres, in WORLD space, applied for the coming step only. */
export type BodyForce = { body: string; force: Vector3; torque: Vector3 }

/** How a body moves, in world space — what an aerodynamic model reads before pushing back. */
export type BodyMotion = { body: string; linear: Vector3; angular: Vector3 }

export type BodyPose = { body: string; position: Vector3; rotation: Quaternion }

export type PhysicsContact = {
  body: string
  other: string
  /** Whether the two have just met or just parted. */
  started: boolean
  /** Either of them is a sensor, so a trigger and a hit read apart without a second lookup. */
  sensed: boolean
}

/**
 * 🛑 `facing` is a yaw in radians, and `null` means « leave the body turned as it is » — a walker
 * whose author asked for no turn speed keeps the heading the scene put it at.
 */
export type CharacterMove = { body: string; wanted: Vector3; facing: number | null }

export type CharacterMoved = { body: string; moved: Vector3; grounded: boolean }

/**
 * What simulates. Grouped from end to end for the reason `InputState` is: a call across the
 * script bridge costs nine times what the same work costs inside the engine, and a port that
 * answered one body at a time would pay it per body per frame.
 *
 * 🛑 `poses` and `contacts` hand back arrays the port REUSES between steps. Read them within the
 * step; keeping one keeps a view of whatever the next step wrote.
 */
export type PhysicsPort = {
  setGravity: (y: number) => void
  /** Answers the bodies it could NOT build — a cloud enclosing nothing, a shape with no volume. */
  add: (bodies: readonly BodyDescriptor[]) => readonly string[]
  remove: (bodies: readonly string[]) => void
  /** Where a KINEMATIC body is put next. Ignored for anything the simulation owns. */
  place: (poses: readonly BodyPose[]) => void
  /** Before the step, never after: the controller reads where the obstacles stand right now. */
  moveCharacters: (wanted: readonly CharacterMove[]) => readonly CharacterMoved[]
  /**
   * What each vehicle's driver asks. 🛑 A car is the ENGINE's and a wing is a system's: engines
   * ship a suspended car and none ships an aerofoil, so the port descends a rung here alone.
   */
  drive: (wanted: readonly VehicleDrive[]) => void
  /** Forces for the coming step. Ignored for anything the simulation does not own. */
  push: (forces: readonly BodyForce[]) => void
  /** 🛑 Reused between calls, like `poses`. A name the port does not hold is left out. */
  motion: (bodies: readonly string[]) => readonly BodyMotion[]
  /**
   * How far a probe gets from `from` towards `to` before something stops it, as a fraction of the
   * way — nothing when the way is clear. Above zero, `radius` sweeps a SPHERE: a ray of no
   * thickness slips through the seam where two boxes meet, and a camera behind it then sees wall.
   *
   * 🛑 A sensor stops nothing, a cast included: that is what `sensor` says on a descriptor.
   */
  cast: (from: Vector3, to: Vector3, radius: number, ignore: readonly string[]) => number | null
  step: (dt: number) => void
  poses: () => readonly BodyPose[]
  contacts: () => readonly PhysicsContact[]
  dispose: () => void
}
