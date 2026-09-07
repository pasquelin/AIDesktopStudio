// SPDX-License-Identifier: MIT

import type { Vector3 } from '@shared/domain/transform'
import { DEGREES } from '../numeric'
import type {
  BodyDescriptor,
  BodyMotion,
  BodyPose,
  PhysicsContact,
  VehicleSettings,
  VehicleWheel,
} from '../ports/physicsPort'
import { MOVING, NON_MOVING } from './joltLayers'
import type {
  Held,
  JoltBody,
  JoltBodyId,
  JoltModule,
  JoltPlace,
  JoltShape,
  JoltVector,
  Ride,
  Scratch,
  Walker,
} from './joltPhysicsTypes'

const CHARACTER_SKIN = 0.02
const MAX_PITCH_ROLL = 60
const SUSPENSION_SLACK = 0.6
const HAND_BRAKE_TORQUE = 4000
const WHEEL_CAST_ROUNDING = 0.05

export const SPUN = { x: 0, y: 0, z: 0, w: 1 }
export const FACED = { x: 0, y: 0, z: 0 }

export const idOf = (jolt: JoltModule, pointer: number): number =>
  jolt.wrapPointer(pointer, jolt.Body).GetID().GetIndexAndSequenceNumber()

/** One idiom for every buffer of this port: what a step hands out is never allocated by a step. */
export function pooled<T>(pool: T[], at: number, make: () => T): T {
  const kept = pool[at]
  if (kept) return kept

  const made = make()
  pool.push(made)
  return made
}

/**
 * Everything one probe reuses, built ONCE. A cast runs per spring arm per frame, and each of these
 * is memory the engine's own heap holds — a fresh set a frame is a leak no collector reaches.
 */
type Probe = {
  ignored: InstanceType<JoltModule['IgnoreMultipleBodiesFilter']>
  ray: InstanceType<JoltModule['RRayCast']>
  raySettings: InstanceType<JoltModule['RayCastSettings']>
  rayHit: InstanceType<JoltModule['CastRayClosestHitCollisionCollector']>
  shapeSettings: InstanceType<JoltModule['ShapeCastSettings']>
  shapeHit: InstanceType<JoltModule['CastShapeClosestHitCollisionCollector']>
  /** A unit sphere the sweep SCALES to the radius asked for, rather than one built per radius. */
  ball: InstanceType<JoltModule['SphereShape']>
  at: InstanceType<JoltModule['RMat44']>
  scale: JoltVector
  along: JoltVector
  /** Where a shape cast reports its hits from. The origin keeps the fraction the one number. */
  zero: JoltPlace
}

/**
 * 🛑 The start is built axis by axis, NOT by `RMat44.prototype.sTranslation`: the binder hangs a
 * static on the prototype, so calling it there passes a `this` with no pointer and writes its
 * matrix at address zero. Measured — every cast of the port then answered a hit at fraction 0.
 */
export function probeOf(jolt: JoltModule): Probe {
  const at = new jolt.RMat44()
  const axis = new jolt.Vec3(1, 0, 0)
  at.SetAxisX(axis)
  axis.Set(0, 1, 0)
  at.SetAxisY(axis)
  axis.Set(0, 0, 1)
  at.SetAxisZ(axis)
  jolt.destroy(axis)

  return {
    ignored: new jolt.IgnoreMultipleBodiesFilter(),
    ray: new jolt.RRayCast(),
    raySettings: new jolt.RayCastSettings(),
    rayHit: new jolt.CastRayClosestHitCollisionCollector(),
    shapeSettings: new jolt.ShapeCastSettings(),
    shapeHit: new jolt.CastShapeClosestHitCollisionCollector(),
    ball: new jolt.SphereShape(1),
    at,
    scale: new jolt.Vec3(1, 1, 1),
    along: new jolt.Vec3(1, 0, 0),
    zero: new jolt.RVec3(0, 0, 0),
  }
}

export const freshPose = (): BodyPose => ({
  body: '',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
})

export const freshMotion = (): BodyMotion => ({
  body: '',
  linear: { x: 0, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: 0 },
})

export const freshContact = (): PhysicsContact => ({
  body: '',
  other: '',
  started: false,
  sensed: false,
})

/** A pose read off whatever Jolt hands back — a body, a character, a wheel's world transform. */
export function writePose(
  pose: BodyPose,
  name: string,
  at: JoltPlaceLike,
  spun: JoltQuatLike,
): void {
  pose.body = name
  pose.position.x = at.GetX()
  pose.position.y = at.GetY()
  pose.position.z = at.GetZ()
  pose.rotation.x = spun.GetX()
  pose.rotation.y = spun.GetY()
  pose.rotation.z = spun.GetZ()
  pose.rotation.w = spun.GetW()
}

type JoltPlaceLike = { GetX: () => number; GetY: () => number; GetZ: () => number }
type JoltQuatLike = JoltPlaceLike & { GetW: () => number }

export const writeVector = (into: Vector3, read: JoltPlaceLike): void => {
  into.x = read.GetX()
  into.y = read.GetY()
  into.z = read.GetZ()
}

export const writeContact = (
  contact: PhysicsContact,
  body: string,
  other: string,
  started: boolean,
  sensed: boolean,
): void => {
  contact.body = body
  contact.other = other
  contact.started = started
  contact.sensed = sensed
}

export const sensorOf = (held: Map<string, Held>, name: string): boolean =>
  held.get(name)?.descriptor.sensor === true

/** Where the GAME puts a body rather than the simulation — what `place` moves and `poses` skips. */
export const driven = (descriptor: BodyDescriptor): boolean =>
  descriptor.kind === 'kinematic' || descriptor.sensor

/**
 * 🛑 A sensor is KINEMATIC whatever its author said: a Jolt sensor feels ACTIVE bodies only, so a
 * crate asleep in a trigger goes unreported unless the sensor is itself in motion's layer with
 * `mCollideKinematicVsNonDynamic` on. Rapier bought the same thing with `ActiveCollisionTypes`.
 */
export function motionOf(jolt: JoltModule, descriptor: BodyDescriptor): number {
  if (descriptor.character !== null || descriptor.kind === 'kinematic' || descriptor.sensor) {
    return jolt.EMotionType_Kinematic
  }
  return descriptor.kind === 'dynamic' ? jolt.EMotionType_Dynamic : jolt.EMotionType_Static
}

export function addedBody(
  jolt: JoltModule,
  bodies: InstanceType<JoltModule['BodyInterface']>,
  descriptor: BodyDescriptor,
  shape: JoltShape,
  scratch: Scratch,
): { id: JoltBodyId; body: JoltBody } {
  const motion = motionOf(jolt, descriptor)
  const layer = motion === jolt.EMotionType_Static ? NON_MOVING : MOVING
  const settings = new jolt.BodyCreationSettings(shape, scratch.place, scratch.turn, motion, layer)

  settings.mFriction = descriptor.friction
  settings.mRestitution = descriptor.restitution
  settings.mGravityFactor = descriptor.gravityScale
  settings.mIsSensor = descriptor.sensor
  // A kinematic body against a fixed one is OUT of Jolt's default set, which is exactly the pair
  // a trigger on the floor and a driven platform make.
  settings.mCollideKinematicVsNonDynamic = motion === jolt.EMotionType_Kinematic
  if (descriptor.sensor) settings.mAllowSleeping = false
  // Translation alone: an inertia made infinite still lets the solver turn the body a little.
  if (descriptor.lockRotation) {
    settings.mAllowedDOFs =
      jolt.EAllowedDOFs_TranslationX |
      jolt.EAllowedDOFs_TranslationY |
      jolt.EAllowedDOFs_TranslationZ
  }
  // 🛑 NOT divided by the pieces, unlike Rapier: Jolt weighs one shape once, so a solid carved
  // into thirty-two convexes weighs exactly what its author asked for.
  if (descriptor.mass > 0) {
    scratch.weight.mMass = descriptor.mass
    settings.mOverrideMassProperties = jolt.EOverrideMassProperties_CalculateInertia
    settings.mMassPropertiesOverride = scratch.weight
  }

  const made = bodies.CreateBody(settings)
  const id = new jolt.BodyID(made.GetID().GetIndexAndSequenceNumber())
  bodies.AddBody(id, jolt.EActivation_Activate)
  jolt.destroy(settings)
  return { id, body: made }
}

/**
 * 🛑 Forward is −Z here, as every other system of this tree reads it, where Jolt defaults to +Z:
 * the constraint AND each wheel are told so, or the car reverses on a forward pedal.
 */
export function rideOf(
  jolt: JoltModule,
  system: InstanceType<JoltModule['PhysicsSystem']>,
  body: JoltBody,
  wanted: VehicleSettings,
  scratch: Scratch,
): Ride | null {
  if (wanted.wheels.length === 0) return null

  const settings = new jolt.VehicleConstraintSettings()
  settings.mMaxPitchRollAngle = MAX_PITCH_ROLL * DEGREES
  scratch.vector.Set(0, 0, -1)
  settings.mForward = scratch.vector
  settings.mWheels.clear()
  for (const wheel of wanted.wheels)
    settings.mWheels.push_back(wheelSettings(jolt, wheel, wanted, scratch))

  const axles = pairedByAxle(wanted.wheels)
  settings.mController = controllerSettings(jolt, wanted.maxTorque, axles)
  addAntiRollBars(jolt, settings, axles)

  const constraint = new jolt.VehicleConstraint(body, settings)
  constraint.AddRef()
  jolt.destroy(settings)
  const tester = new jolt.VehicleCollisionTesterCastCylinder(MOVING, WHEEL_CAST_ROUNDING)
  tester.AddRef()
  constraint.SetVehicleCollisionTester(tester)
  system.AddConstraint(constraint)
  // Without it the constraint is solved but never STEPPED: no suspension, no engine, no wheel.
  const listener = new jolt.VehicleConstraintStepListener(constraint)
  system.AddStepListener(listener)
  const controller = jolt.castObject(constraint.GetController(), jolt.WheeledVehicleController)
  return { constraint, listener, tester, controller, wheels: wanted.wheels }
}

type Axle = { left: number; right: number; driven: boolean }

function wheelSettings(
  jolt: JoltModule,
  wheel: VehicleWheel,
  wanted: VehicleSettings,
  scratch: Scratch,
): InstanceType<JoltModule['WheelSettingsWV']> {
  const one = new jolt.WheelSettingsWV()
  scratch.vector.Set(wheel.at.x, wheel.at.y + wanted.suspensionLength, wheel.at.z)
  one.mPosition = scratch.vector
  scratch.vector.Set(0, 0, -1)
  one.mWheelForward = scratch.vector
  one.mRadius = wanted.wheelRadius
  one.mWidth = wanted.wheelWidth
  one.mSuspensionMinLength = wanted.suspensionLength * SUSPENSION_SLACK
  one.mSuspensionMaxLength = wanted.suspensionLength
  one.mMaxSteerAngle = wheel.steers ? wanted.maxSteerAngle * DEGREES : 0
  one.mMaxHandBrakeTorque = wheel.handBraked ? HAND_BRAKE_TORQUE : 0
  return one
}

function controllerSettings(jolt: JoltModule, torque: number, axles: readonly Axle[]) {
  const settings = new jolt.WheeledVehicleControllerSettings()
  settings.mEngine.mMaxTorque = torque
  settings.mDifferentials.clear()
  const driving = axles.filter(axle => axle.driven)
  for (const axle of driving) {
    const differential = new jolt.VehicleDifferentialSettings()
    differential.mLeftWheel = axle.left
    differential.mRightWheel = axle.right
    differential.mEngineTorqueRatio = 1 / driving.length
    settings.mDifferentials.push_back(differential)
    jolt.destroy(differential)
  }
  return settings
}

function addAntiRollBars(
  jolt: JoltModule,
  settings: InstanceType<JoltModule['VehicleConstraintSettings']>,
  axles: readonly Axle[],
): void {
  settings.mAntiRollBars.clear()
  for (const axle of axles) {
    const bar = new jolt.VehicleAntiRollBar()
    bar.mLeftWheel = axle.left
    bar.mRightWheel = axle.right
    settings.mAntiRollBars.push_back(bar)
    jolt.destroy(bar)
  }
}

/**
 * Wheels paired across the body, nearest by depth: what a differential and an anti-roll bar join.
 * A wheel with no opposite — three wheels, a trailer's lone one — is paired with nothing.
 *
 * 🛑 Paired by SIDE and never by sign: opened from a wheel at `x < 0` alone, a chassis whose pivot
 * sat on the left wheel line paired nothing, `mDifferentials` stayed empty, and the engine drove
 * no wheel at all. Measured — the car answered a full pedal by moving 0,016 m in two seconds.
 */
export function pairedByAxle(wheels: readonly VehicleWheel[]): Axle[] {
  const taken = new Set<number>()
  const axles: Axle[] = []
  wheels.forEach((wheel, index) => {
    if (taken.has(index)) return
    let opposite = -1
    let nearest = Number.POSITIVE_INFINITY
    wheels.forEach((other, at) => {
      const apart = Math.abs(other.at.z - wheel.at.z)
      if (taken.has(at) || at === index || other.at.x === wheel.at.x || apart >= nearest) return
      opposite = at
      nearest = apart
    })
    const other = wheels[opposite]
    if (!other) return

    taken.add(index)
    taken.add(opposite)
    const onTheLeft = wheel.at.x < other.at.x
    axles.push({
      left: onTheLeft ? index : opposite,
      right: onTheLeft ? opposite : index,
      driven: wheel.driven && other.driven,
    })
  })
  return axles
}

export function walkerOf(
  jolt: JoltModule,
  system: InstanceType<JoltModule['PhysicsSystem']>,
  shape: JoltShape,
  wanted: NonNullable<BodyDescriptor['character']>,
  scratch: Scratch,
): Walker {
  const settings = new jolt.CharacterVirtualSettings()
  settings.mShape = shape
  settings.mUp = scratch.up
  settings.mMaxSlopeAngle = wanted.slopeLimit * DEGREES
  settings.mCharacterPadding = CHARACTER_SKIN
  // An inner body, or the rest of the world feels no character at all: a `CharacterVirtual` is a
  // shape swept through the scene, and is in no broadphase of its own.
  settings.mInnerBodyShape = shape
  settings.mInnerBodyLayer = MOVING

  const character = new jolt.CharacterVirtual(settings, scratch.place, scratch.turn, system)
  jolt.destroy(settings)

  const update = new jolt.ExtendedUpdateSettings()
  const down = new jolt.Vec3(0, -wanted.snapDistance, 0)
  const climb = new jolt.Vec3(0, wanted.stepHeight, 0)
  update.mStickToFloorStepDown = down
  update.mWalkStairsStepUp = climb
  jolt.destroy(down)
  jolt.destroy(climb)
  return { character, update, facing: null, carried: { x: 0, y: 0, z: 0 } }
}

/**
 * 🛑 Nothing here nests one SETTINGS inside another: a settings a parent holds is reference
 * counted, so destroying it frees what the parent still owns and the NEXT world reads a
 * corrupted heap. Children are built into SHAPES and composed.
 */

export function carryWalker(
  walker: Walker,
  jolt: JoltModule,
  wanted: Vector3,
  dt: number,
  scratch: Scratch,
): void {
  walker.character.UpdateGroundVelocity()
  if (walker.character.GetGroundState() === jolt.EGroundState_OnGround) {
    writeVector(walker.carried, walker.character.GetGroundVelocity())
  }
  scratch.vector.Set(
    wanted.x / dt + walker.carried.x,
    wanted.y / dt + walker.carried.y,
    wanted.z / dt + walker.carried.z,
  )
  walker.character.SetLinearVelocity(scratch.vector)
}
