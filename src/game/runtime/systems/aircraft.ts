// SPDX-License-Identifier: MIT

import { clamp } from '../../numeric'
import { pooled } from '../../pooled'
import { aeroForces, type Aero, type Airframe, type Stick } from '../../physics/aerodynamics'
import { axesOfEuler, restingAxes } from '../../physics/quaternion'
import type { BodyForce, BodyMotion } from '../../ports/physicsPort'
import type { Component } from '@shared/domain/component'
import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { numberOf } from '../componentFields'
import type { Transform } from '@shared/domain/transform'
import { componentOf, type Entity } from '../entity'
import type { Intents } from '../intents'
import { PILOT_RANK, type Pilots } from '../pilots'
import type { System, World } from '../world'

const AIRCRAFT = COMPONENT_DEFAULTS.Aircraft

/** How much of the throttle a second of holding the lever moves — four seconds lever to lever. */
const THROTTLE_RATE = 0.25

/** Where the throttle stands when a plane is put in the air rather than on a runway. */
const CRUISE_THROTTLE = 0.6

/** Where a chase camera sits behind a plane: clear of a nine-metre airframe and its tail. */
const CHASE_BACK = 30

/**
 * 🛑 The throttle is a LEVER held between steps, not a pedal: an engine that idles the moment a
 * finger lifts is not something anyone can fly. It lives here rather than in the component — a
 * component is what an author wrote, never what a game is doing.
 */
export function createAircraftSystem(
  pilots: Pilots,
  intents: Intents,
  worldOf?: (entity: Entity) => Transform,
): System {
  const throttles = new WeakMap<Entity, number>()
  const forces: BodyForce[] = []
  const pool: BodyForce[] = []
  const names: string[] = []
  const flying: Entity[] = []
  const settings: Component[] = []
  const axes = restingAxes()
  // The scratch `pushForce` reads, and what the input map said this step — two, so a plane a
  // script flies cannot leave its values behind for the next one of the sweep.
  const stick: Stick = { throttle: 0, pitch: 0, roll: 0, yaw: 0 }
  const sticks: Stick = { throttle: 0, pitch: 0, roll: 0, yaw: 0 }
  const own = (body: string): Stick | null => intents.flyOf(body)
  const frame: Airframe = { maxThrust: 0, wingArea: 0, stallAngle: 0, agility: 0, drag: 0 }
  const aero: Aero = { force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 } }

  const collect = (world: World): void => {
    flying.length = 0
    names.length = 0
    settings.length = 0
    for (const entity of world.entities.withComponent('Aircraft')) {
      const held = componentOf(entity, 'Aircraft')
      if (!held) continue
      flying.push(entity)
      settings.push(held)
      names.push(entity.id)
    }
  }

  const pushForce = (
    entity: Entity,
    held: Component,
    motion: BodyMotion,
    lever: number,
    dt: number,
  ): void => {
    stick.throttle = clamp(
      (throttles.get(entity) ?? CRUISE_THROTTLE) + lever * THROTTLE_RATE * dt,
      0,
      1,
    )
    throttles.set(entity, stick.throttle)
    readFrame(held, frame)
    const transform = worldOf ? worldOf(entity) : entity.transform
    aeroForces(
      frame,
      stick,
      axesOfEuler(transform.rotation, axes),
      motion.linear,
      motion.angular,
      aero,
    )
    const push = pooled(pool, forces.length, freshForce)
    copyForce(push, entity.id, aero)
    forces.push(push)
  }

  /**
   * 🛑 The stick is read per PLANE, like a car's pedals: it flies every aeroplane of the scene
   * alike, and a script flies the one it sits on.
   */
  const pushEach = (world: World, dt: number): void => {
    forces.length = 0
    const motions = world.ports.physics.motion(names)
    let read = 0
    for (let index = 0; index < flying.length; index++) {
      const entity = flying[index]
      const held = settings[index]
      if (!entity || !held) continue
      // `motion` answers in the order it was asked, leaving out what the port does not hold.
      const motion = motions[read]?.body === entity.id ? motions[read++] : undefined
      if (!motion) continue

      // Read from the one that speaks for THIS plane, written into the shared scratch `pushForce`
      // reads: no save-and-restore, so no plane can leave its stick behind for the next.
      const from = own(entity.id) ?? sticks
      stick.pitch = from.pitch
      stick.roll = from.roll
      stick.yaw = from.yaw
      pushForce(entity, held, motion, from.throttle, dt)
    }
  }

  return {
    name: 'aircraft',
    reads: ['Aircraft'],
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      collect(world)
      if (flying.length === 0) return

      // Read ONCE: there is one stick, and every plane in the scene answers it.
      const actions = world.actions
      sticks.pitch = actions.axis('pitch')
      sticks.roll = actions.axis('roll')
      sticks.yaw = actions.axis('yaw')
      sticks.throttle = actions.axis('throttle')

      pushEach(world, dt)
      if (forces.length > 0) world.ports.physics.push(forces)
    },

    /**
     * 🛑 At the IMAGE like a car's, and for the same reason — plus one of its own: claimed inside
     * the loop above, a plane whose motion the port had no answer for was skipped by `continue`
     * and never got a camera at all.
     */
    lateUpdate: (world: World) => {
      for (const entity of world.entities.withComponent('Aircraft')) {
        if (componentOf(entity, 'Aircraft')) pilots.take(entity, 0, CHASE_BACK, PILOT_RANK.machine)
      }
    },
  }
}

function copyForce(into: BodyForce, body: string, aero: Aero): void {
  into.body = body
  into.force.x = aero.force.x
  into.force.y = aero.force.y
  into.force.z = aero.force.z
  into.torque.x = aero.torque.x
  into.torque.y = aero.torque.y
  into.torque.z = aero.torque.z
}

function readFrame(settings: Component, into: Airframe): Airframe {
  into.maxThrust = numberOf(settings, 'maxThrust', AIRCRAFT.maxThrust)
  into.wingArea = numberOf(settings, 'wingArea', AIRCRAFT.wingArea)
  into.stallAngle = numberOf(settings, 'stallAngle', AIRCRAFT.stallAngle)
  into.agility = numberOf(settings, 'agility', AIRCRAFT.agility)
  into.drag = numberOf(settings, 'drag', AIRCRAFT.drag)
  return into
}

const freshForce = (): BodyForce => ({
  body: '',
  force: { x: 0, y: 0, z: 0 },
  torque: { x: 0, y: 0, z: 0 },
})
