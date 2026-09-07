// SPDX-License-Identifier: MIT

import type { BodyMotion, BodyPose, CharacterMoved, PhysicsContact } from '../ports/physicsPort'
import { MOVING, layerJoltSettings } from './joltLayers'
import { probeOf } from './joltPhysicsSupport'
import type { Held, JoltModule, Scratch, Target } from './joltPhysicsTypes'

const MAX_BODIES = 16384
const MAX_BODY_PAIRS = 16384
const MAX_CONTACT_CONSTRAINTS = 8192

export function physicsContext(jolt: JoltModule) {
  const settings = new jolt.JoltSettings()
  settings.mMaxBodies = MAX_BODIES
  settings.mMaxBodyPairs = MAX_BODY_PAIRS
  settings.mMaxContactConstraints = MAX_CONTACT_CONSTRAINTS
  settings.mMaxWorkerThreads = 0
  layerJoltSettings(jolt, settings)
  const world = new jolt.JoltInterface(settings)
  jolt.destroy(settings)
  const system = world.GetPhysicsSystem()
  const scratch = scratchOf(jolt)
  const held = new Map<string, Held>()
  return {
    world,
    system,
    bodies: system.GetBodyInterface(),
    allocator: world.GetTempAllocator(),
    query: system.GetNarrowPhaseQuery(),
    scratch,
    active: new jolt.BodyIDVector(),
    broadFilter: new jolt.DefaultBroadPhaseLayerFilter(
      world.GetObjectVsBroadPhaseLayerFilter(),
      MOVING,
    ),
    layerFilter: new jolt.DefaultObjectLayerFilter(world.GetObjectLayerPairFilter(), MOVING),
    bodyFilter: new jolt.BodyFilter(),
    shapeFilter: new jolt.ShapeFilter(),
    probe: probeOf(jolt),
    held,
    ...buffersOf(),
  }
}

type ContextBuffers = {
  namesById: Map<number, string>
  walking: Held[]
  riding: Held[]
  sensing: Held[]
  targets: Map<string, Target>
  refused: string[]
  pool: BodyPose[]
  poses: BodyPose[]
  contacts: PhysicsContact[]
  contactPool: PhysicsContact[]
  moved: CharacterMoved[]
  motions: BodyMotion[]
  motionPool: BodyMotion[]
}

function buffersOf(): ContextBuffers {
  return {
    namesById: new Map(),
    walking: [],
    riding: [],
    sensing: [],
    targets: new Map(),
    refused: [],
    pool: [],
    poses: [],
    contacts: [],
    contactPool: [],
    moved: [],
    motions: [],
    motionPool: [],
  }
}

function scratchOf(jolt: JoltModule): Scratch {
  return {
    place: new jolt.RVec3(0, 0, 0),
    turn: new jolt.Quat(0, 0, 0, 1),
    vector: new jolt.Vec3(0, 0, 0),
    zero: new jolt.Vec3(0, 0, 0),
    identity: new jolt.Quat(0, 0, 0, 1),
    up: new jolt.Vec3(0, 1, 0),
    weight: new jolt.MassProperties(),
    axle: new jolt.Vec3(0, 1, 0),
    rim: new jolt.Vec3(1, 0, 0),
  }
}
