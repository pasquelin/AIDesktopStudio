// SPDX-License-Identifier: MIT

import { quaternionFromEuler } from '../physics/quaternion'
import type { BodyDescriptor, PhysicsPort } from '../ports/physicsPort'
import { physicsContext } from './joltPhysicsContext'
import {
  FACED,
  SPUN,
  addedBody,
  driven,
  freshContact,
  freshMotion,
  freshPose,
  idOf,
  motionOf,
  pairedByAxle,
  pooled,
  rideOf,
  sensorOf,
  walkerOf,
  carryWalker,
  writeContact,
  writePose,
  writeVector,
} from './joltPhysicsSupport'
import { builtShape } from './joltPhysicsShapes'
import type { Held, JoltModule } from './joltPhysicsTypes'

const COLLISION_STEPS = 1
const CHARACTER_STEP = 1 / 60

export function createJoltPhysics(jolt: JoltModule): PhysicsPort {
  const context = physicsContext(jolt)
  const { world, system, bodies, allocator, query, scratch, active } = context
  const { broadFilter, layerFilter, bodyFilter, shapeFilter, probe } = context
  const { held, namesById, walking, riding, sensing, targets, refused } = context
  const { pool, poses, contacts, contactPool, moved, motions, motionPool } = context

  // Characters must read the support velocity for this step, before the rigid bodies advance.
  let preparedStep: number | null = null
  const prepareKinematics = (dt: number): void => {
    if (preparedStep === dt) return
    for (const [name, target] of targets) {
      const body = held.get(name)
      if (!body) continue
      scratch.place.Set(target.position.x, target.position.y, target.position.z)
      scratch.turn.Set(target.rotation.x, target.rotation.y, target.rotation.z, target.rotation.w)
      bodies.MoveKinematic(body.id, scratch.place, scratch.turn, dt)
    }
    preparedStep = dt
  }

  // Hoisted rather than written at the call: it captures two maps and would be rebuilt sixty
  // times a second.
  const met = (first: number, second: number, started: boolean): void => {
    const one = namesById.get(first)
    const other = namesById.get(second)
    if (one === undefined || other === undefined) return
    const sensed = sensorOf(held, one) || sensorOf(held, other)
    writeContact(pooled(contactPool, contacts.length, freshContact), one, other, started, sensed)
    contacts.push(contactPool[contacts.length]!)
    writeContact(pooled(contactPool, contacts.length, freshContact), other, one, started, sensed)
    contacts.push(contactPool[contacts.length]!)
  }

  const listener = new jolt.ContactListenerJS()
  listener.OnContactValidate = () => jolt.ValidateResult_AcceptAllContactsForThisBodyPair
  listener.OnContactAdded = (first, second) => met(idOf(jolt, first), idOf(jolt, second), true)
  listener.OnContactPersisted = () => {}
  // 🛑 A pair, not two bodies: one of them may already have been destroyed, and `met` answers
  // nothing for a name the map no longer holds.
  listener.OnContactRemoved = pair => {
    const parted = jolt.wrapPointer(pair, jolt.SubShapeIDPair)
    const first = parted.GetBody1ID().GetIndexAndSequenceNumber()
    met(first, parted.GetBody2ID().GetIndexAndSequenceNumber(), false)
  }
  system.SetContactListener(listener)

  const forget = (name: string): void => {
    const body = held.get(name)
    if (!body) return

    namesById.delete(body.id.GetIndexAndSequenceNumber())
    if (body.ride) {
      // The system's references go first, then ours: the constraint is deleted by the LAST
      // release, and a `destroy` on top of that would free it twice.
      system.RemoveStepListener(body.ride.listener)
      system.RemoveConstraint(body.ride.constraint)
      jolt.destroy(body.ride.listener)
      body.ride.constraint.Release()
      body.ride.tester.Release()
      const at = riding.indexOf(body)
      if (at >= 0) riding.splice(at, 1)
    }
    const sensed = sensing.indexOf(body)
    if (sensed >= 0) sensing.splice(sensed, 1)
    if (body.walker) {
      // The inner body goes with the character that owns it — removing it here would leave the
      // character sweeping a shape the body manager had already reclaimed.
      jolt.destroy(body.walker.update)
      jolt.destroy(body.walker.character)
      const at = walking.indexOf(body)
      if (at >= 0) walking.splice(at, 1)
    } else {
      bodies.RemoveBody(body.id)
      bodies.DestroyBody(body.id)
    }
    jolt.destroy(body.id)
    targets.delete(name)
    held.delete(name)
  }

  const build = (descriptor: BodyDescriptor): boolean => {
    if (!canBuild(jolt, system, descriptor)) return false

    const shape = builtShape(jolt, descriptor.shape, scratch)
    if (!shape) return false

    quaternionFromEuler(descriptor.transform.rotation, SPUN)
    const at = descriptor.transform.position
    scratch.place.Set(at.x, at.y, at.z)
    scratch.turn.Set(SPUN.x, SPUN.y, SPUN.z, SPUN.w)

    const walker = descriptor.character
      ? walkerOf(jolt, system, shape, descriptor.character, scratch)
      : null
    const added = walker ? null : addedBody(jolt, bodies, descriptor, shape, scratch)
    const id = added
      ? added.id
      : new jolt.BodyID(walker!.character.GetInnerBodyID().GetIndexAndSequenceNumber())
    // The body and the character each took their own reference; ours has done its work.
    shape.Release()

    const ride =
      added && descriptor.vehicle
        ? rideOf(jolt, system, added.body, descriptor.vehicle, scratch)
        : null
    registerHeld({ descriptor, id, walker, ride }, held, namesById, walking, riding, sensing)
    return true
  }

  const castRay = (): number | null => {
    probe.ray.set_mOrigin(scratch.place)
    probe.ray.set_mDirection(scratch.vector)
    probe.rayHit.Reset()
    query.CastRay(
      probe.ray,
      probe.raySettings,
      probe.rayHit,
      broadFilter,
      layerFilter,
      probe.ignored,
      shapeFilter,
    )
    return probe.rayHit.HadHit() ? probe.rayHit.mHit.mFraction : null
  }

  const castShape = (dx: number, dy: number, dz: number, radius: number): number | null => {
    probe.at.SetTranslation(scratch.place)
    probe.scale.Set(radius, radius, radius)
    probe.along.Set(dx, dy, dz)
    // RShapeCast caches world bounds, so it must be rebuilt for every origin and radius.
    const sweep = new jolt.RShapeCast(probe.ball, probe.scale, probe.at, probe.along)
    probe.shapeHit.Reset()
    query.CastShape(
      sweep,
      probe.shapeSettings,
      probe.zero,
      probe.shapeHit,
      broadFilter,
      layerFilter,
      probe.ignored,
      shapeFilter,
    )
    const fraction = probe.shapeHit.HadHit() ? probe.shapeHit.mHit.mFraction : null
    jolt.destroy(sweep)
    return fraction
  }

  const activePoses = (): void => {
    system.GetActiveBodies(jolt.EBodyType_RigidBody, active)
    for (let index = 0; index < active.size(); index++) {
      const id = active.at(index)
      const name = namesById.get(id.GetIndexAndSequenceNumber())
      if (name === undefined) continue
      const descriptor = held.get(name)?.descriptor
      if (!descriptor || descriptor.kind !== 'dynamic' || driven(descriptor)) continue
      bodies.GetPositionAndRotation(id, scratch.place, scratch.turn)
      const pose = pooled(pool, poses.length, freshPose)
      writePose(pose, name, scratch.place, scratch.turn)
      poses.push(pose)
    }
  }

  const characterPoses = (): void => {
    for (const entry of walking) {
      if (!entry.walker) continue
      const pose = pooled(pool, poses.length, freshPose)
      const walker = entry.walker.character
      writePose(pose, entry.descriptor.body, walker.GetPosition(), walker.GetRotation())
      poses.push(pose)
    }
  }

  const wheelPoses = (): void => {
    for (const entry of riding) {
      if (!entry.ride) continue
      for (let index = 0; index < entry.ride.wheels.length; index++) {
        const wheel = entry.ride.wheels[index]
        if (!wheel) continue
        const placed = entry.ride.constraint.GetWheelWorldTransform(
          index,
          scratch.axle,
          scratch.rim,
        )
        const pose = pooled(pool, poses.length, freshPose)
        writePose(pose, wheel.body, placed.GetTranslation(), placed.GetRotation().GetQuaternion())
        poses.push(pose)
      }
    }
  }

  return {
    setGravity: y => {
      scratch.vector.Set(0, y, 0)
      system.SetGravity(scratch.vector)
    },

    add: descriptors => {
      const laying = held.size === 0 && descriptors.length > 0
      refused.length = 0
      for (const descriptor of descriptors) {
        forget(descriptor.body)
        // Refused rather than added empty: a body with no shape falls through the world in
        // silence, and its name is the only thing that says which object it was.
        if (!build(descriptor)) refused.push(descriptor.body)
      }
      // 🛑 The LAY-DOWN alone: Jolt builds its tree incrementally, so a scene added in one call
      // leaves it unbalanced for the whole game. Run on every batch, a game spawning one
      // projectile a step would rebuild the whole tree sixty times a second.
      if (laying) system.OptimizeBroadPhase()
      // Copied out: the port reserves the right to reuse `poses` and `contacts`, never this.
      return [...refused]
    },

    remove: names => {
      for (const name of names) forget(name)
    },

    // 🛑 Held rather than applied: `MoveKinematic` wants the step, which this call is not given,
    // and the last one would be a guess. Held ALSO covers the frame that says nothing — a Jolt
    // kinematic keeps the velocity it was last handed, and would slide away for ever.
    place: next => {
      preparedStep = null
      for (const pose of next) {
        const body = held.get(pose.body)
        if (!body || !driven(body.descriptor) || body.walker) continue
        const target = targets.get(pose.body) ?? {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        }
        target.position.x = pose.position.x
        target.position.y = pose.position.y
        target.position.z = pose.position.z
        target.rotation.x = pose.rotation.x
        target.rotation.y = pose.rotation.y
        target.rotation.z = pose.rotation.z
        target.rotation.w = pose.rotation.w
        targets.set(pose.body, target)
      }
    },

    moveCharacters: wanted => {
      prepareKinematics(CHARACTER_STEP)
      moved.length = 0
      for (const one of wanted) {
        const walker = held.get(one.body)?.walker
        if (!walker) continue

        const before = walker.character.GetPosition()
        const fromX = before.GetX()
        const fromY = before.GetY()
        const fromZ = before.GetZ()
        carryWalker(walker, jolt, one.wanted, CHARACTER_STEP, scratch)
        // Set rather than simulated: a walker's body has its rotation locked, so the heading a
        // system worked out is the only thing that will ever turn it. Sent only when it CHANGED —
        // a walker holding a straight line would else cross into the WebAssembly twice a step.
        if (one.facing !== null && one.facing !== walker.facing) {
          walker.facing = one.facing
          FACED.y = one.facing
          quaternionFromEuler(FACED, SPUN)
          scratch.turn.Set(SPUN.x, SPUN.y, SPUN.z, SPUN.w)
          walker.character.SetRotation(scratch.turn)
        }
        walker.character.ExtendedUpdate(
          CHARACTER_STEP,
          scratch.zero,
          walker.update,
          broadFilter,
          layerFilter,
          bodyFilter,
          shapeFilter,
          allocator,
        )

        const after = walker.character.GetPosition()
        moved.push({
          body: one.body,
          moved: { x: after.GetX() - fromX, y: after.GetY() - fromY, z: after.GetZ() - fromZ },
          grounded: walker.character.GetGroundState() === jolt.EGroundState_OnGround,
        })
      }
      return moved
    },

    drive: wanted => {
      for (const one of wanted) {
        const body = held.get(one.body)
        if (!body?.ride) continue
        body.ride.controller.SetDriverInput(one.forward, one.steer, one.brake, one.handBrake)
        // A car left alone goes to sleep, and a sleeping one hears no pedal.
        if (one.forward !== 0 || one.steer !== 0 || one.brake !== 0 || one.handBrake !== 0) {
          bodies.ActivateBody(body.id)
        }
      }
    },

    push: forces => {
      for (const one of forces) {
        const body = held.get(one.body)
        if (!body || body.descriptor.kind !== 'dynamic' || body.walker) continue
        scratch.vector.Set(one.force.x, one.force.y, one.force.z)
        bodies.AddForce(body.id, scratch.vector, jolt.EActivation_Activate)
        scratch.vector.Set(one.torque.x, one.torque.y, one.torque.z)
        bodies.AddTorque(body.id, scratch.vector, jolt.EActivation_Activate)
      }
    },

    motion: names => {
      motions.length = 0
      for (const name of names) {
        const body = held.get(name)
        if (!body) continue
        const one = pooled(motionPool, motions.length, freshMotion)
        one.body = name
        writeVector(one.linear, bodies.GetLinearVelocity(body.id))
        writeVector(one.angular, bodies.GetAngularVelocity(body.id))
        motions.push(one)
      }
      return motions
    },

    cast: (from, to, radius, ignore) => {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const dz = to.z - from.z
      if (dx === 0 && dy === 0 && dz === 0) return null

      probe.ignored.Clear()
      for (let at = 0; at < ignore.length; at++) {
        const body = held.get(ignore[at]!)
        if (body) probe.ignored.IgnoreBody(body.id)
      }
      for (let at = 0; at < sensing.length; at++) probe.ignored.IgnoreBody(sensing[at]!.id)

      scratch.place.Set(from.x, from.y, from.z)
      scratch.vector.Set(dx, dy, dz)
      return radius <= 0 ? castRay() : castShape(dx, dy, dz, radius)
    },

    step: dt => {
      contacts.length = 0
      prepareKinematics(dt)
      world.Step(dt, COLLISION_STEPS)
      preparedStep = null
    },

    // 🛑 The ACTIVE island, never the whole map: a settled scene of five thousand crates would
    // otherwise cross into the WebAssembly five thousand times a frame to be told they all sleep.
    poses: () => {
      poses.length = 0
      activePoses()
      characterPoses()
      wheelPoses()
      return poses
    },

    contacts: () => contacts,

    dispose: () => {
      for (const name of [...held.keys()]) forget(name)
      namesById.clear()
      targets.clear()
      for (const one of [
        probe.ignored,
        probe.ray,
        probe.raySettings,
        probe.rayHit,
        probe.shapeSettings,
        probe.shapeHit,
        probe.ball,
        probe.at,
        probe.scale,
        probe.along,
        probe.zero,
        listener,
        broadFilter,
        layerFilter,
        bodyFilter,
        shapeFilter,
        active,
        scratch.rim,
        scratch.axle,
        scratch.weight,
        scratch.up,
        scratch.identity,
        scratch.zero,
        scratch.vector,
        scratch.turn,
        scratch.place,
        world,
      ]) {
        jolt.destroy(one)
      }
    },
  }
}

function canBuild(
  jolt: JoltModule,
  system: InstanceType<JoltModule['PhysicsSystem']>,
  descriptor: BodyDescriptor,
): boolean {
  // Measured at 16,601 bodies: CreateBody returned pointer zero and aliased the first body.
  if (system.GetNumBodies() >= system.GetMaxBodies()) return false
  if (
    (descriptor.shape.kind === 'trimesh' || descriptor.shape.kind === 'heightfield') &&
    motionOf(jolt, descriptor) !== jolt.EMotionType_Static
  ) {
    return false
  }
  if (descriptor.vehicle && (descriptor.kind !== 'dynamic' || descriptor.character)) return false
  const drivenWheels = descriptor.vehicle?.wheels.some(wheel => wheel.driven) ?? false
  if (drivenWheels && !pairedByAxle(descriptor.vehicle!.wheels).some(axle => axle.driven))
    return false
  return true
}

function registerHeld(
  entry: Held,
  held: Map<string, Held>,
  namesById: Map<number, string>,
  walking: Held[],
  riding: Held[],
  sensing: Held[],
): void {
  held.set(entry.descriptor.body, entry)
  namesById.set(entry.id.GetIndexAndSequenceNumber(), entry.descriptor.body)
  if (entry.walker) walking.push(entry)
  if (entry.ride) riding.push(entry)
  if (entry.descriptor.sensor) sensing.push(entry)
}

/** Rewritten in place: a rotation is converted at BUILD, and once a step for a walker that turns. */
