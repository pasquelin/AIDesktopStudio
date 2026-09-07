// SPDX-License-Identifier: MIT

import type { BodyDescriptor, BodyPose, VehicleWheel } from '../ports/physicsPort'
import type startJolt from 'jolt-physics/wasm-compat'

export type JoltModule = Awaited<ReturnType<typeof startJolt>>

export type JoltBodyId = InstanceType<JoltModule['BodyID']>
export type JoltShape = InstanceType<JoltModule['Shape']>
export type JoltShapeSettings = InstanceType<JoltModule['ShapeSettings']>
type JoltCharacter = InstanceType<JoltModule['CharacterVirtual']>
type JoltUpdate = InstanceType<JoltModule['ExtendedUpdateSettings']>
export type JoltVector = InstanceType<JoltModule['Vec3']>
type JoltQuat = InstanceType<JoltModule['Quat']>
export type JoltPlace = InstanceType<JoltModule['RVec3']>
export type JoltBody = InstanceType<JoltModule['Body']>
type JoltVehicle = InstanceType<JoltModule['VehicleConstraint']>

export type Scratch = {
  place: JoltPlace
  turn: JoltQuat
  vector: JoltVector
  zero: JoltVector
  identity: JoltQuat
  up: JoltVector
  weight: InstanceType<JoltModule['MassProperties']>
  /** A wheel model's axle and its top, as three.js draws a cylinder — see `poses`. */
  axle: JoltVector
  rim: JoltVector
}

/** `facing` is the last yaw actually sent across, so an unchanged heading costs no crossing. */
export type Walker = {
  character: JoltCharacter
  update: JoltUpdate
  facing: number | null
  /** Support velocity retained in flight until the next landing. */
  carried: { x: number; y: number; z: number }
}

/** What suspends and drives a `Vehicle`. Reference counted where Jolt counts, and torn down in order. */
export type Ride = {
  constraint: JoltVehicle
  listener: InstanceType<JoltModule['VehicleConstraintStepListener']>
  tester: InstanceType<JoltModule['VehicleCollisionTesterCastCylinder']>
  controller: InstanceType<JoltModule['WheeledVehicleController']>
  wheels: readonly VehicleWheel[]
}

export type Held = {
  descriptor: BodyDescriptor
  id: JoltBodyId
  /** What walks a `CharacterController`, and where its pose is read from. */
  walker: Walker | null
  ride: Ride | null
}

/** Where a kinematic body was last told to go, kept so a step that hears nothing holds it there. */
export type Target = { position: BodyPose['position']; rotation: BodyPose['rotation'] }
