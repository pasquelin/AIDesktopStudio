// SPDX-License-Identifier: MIT

import type { ComponentType } from '@shared/domain/component'
import type { Transform, Vector3 } from '@shared/domain/transform'
import { eulerFromQuaternion, quaternionFromEuler } from '../../physics/quaternion'
import type { ColliderShape } from '../../physics/shape'
import type {
  BodyDescriptor,
  BodyKind,
  BodyPose,
  VehicleSettings,
  VehicleWheel,
} from '../../ports/physicsPort'
import type { Characters } from '../characters'
import type { Possessions } from '../possessions'
import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { flagOf, numberOf, textOf } from '../componentFields'
import { componentOf, type Entity } from '../entity'
import { entityNamed } from '../steering'
import type { System, World } from '../world'

/**
 * Every component that puts an entity into the simulation. Held against the registry's
 * `category: 'physics'` by `physics.test.ts` — a fifth one would otherwise never be simulated.
 */
export const PHYSICAL: readonly ComponentType[] = [
  'Collider',
  'RigidBody',
  'Trigger',
  'CharacterController',
  'Vehicle',
  'Aircraft',
]

const BODY_KINDS: readonly BodyKind[] = ['fixed', 'dynamic', 'kinematic']

const COLLIDER = COMPONENT_DEFAULTS.Collider
const BODY = COMPONENT_DEFAULTS.RigidBody
const VEHICLE = COMPONENT_DEFAULTS.Vehicle

export type PhysicsSystemOptions = {
  /**
   * What an entity is FELT as, derived from what it DRAWS. The geometry belongs to the studio,
   * so the shape arrives as a parameter — the same carve-out that keeps this tree portable.
   */
  shapeOf: (entity: Entity) => ColliderShape | null
  /** Shared with the camera system, which watches whoever this one walks. */
  characters: Characters
  /**
   * The bodies a player is riding something else with. 🛑 The port goes on REPORTING a walker it
   * was asked to move by nothing, and writing that pose back undid the carry on every step.
   */
  possessions: Possessions
  /** Bodies belonging to no entity: the scene's own floor, which is not a node. */
  statics?: readonly BodyDescriptor[]
  /**
   * Where an entity stands in the WORLD, when its transform is not already that.
   *
   * 🛑 The physics knows no hierarchy: a body is placed in world space, and an entity hanging
   * from a group carries a LOCAL transform. Absent, the two are the same thing.
   */
  worldOf?: (entity: Entity) => Transform
  /**
   * A world pose written back into the entity's own frame — the other half of `worldOf`.
   *
   * `null` when the two are the same thing, which spares an object per body per step.
   */
  localOf?: (entity: Entity, position: Vector3, rotation: Vector3) => Transform | null
}

/**
 * 🛑 A body is built ONCE, from the components its entity carried when it joined: editing a
 * `Collider` mid-game changes nothing until the next PLAY.
 *
 * 🛑 It writes TRANSFORMS, which `SystemShape.writes` cannot name — that list holds component
 * types. `movement` writes them too, so `writeConflicts` is blind to the pair.
 */
export function createPhysicsSystem(options: PhysicsSystemOptions): System {
  const characters = options.characters
  const known = new Set<string>()
  const seen = new Set<string>()
  const fresh: BodyDescriptor[] = []
  const gone: string[] = []
  const driven: Entity[] = []
  // Two arrays: `pool` HOLDS the poses and never shrinks, `poses` is what is handed over.
  const pool: BodyPose[] = []
  const poses: BodyPose[] = []
  const triggered = new Set<string>()
  let started = false

  const refuse = (world: World, refused: readonly string[]): void => {
    for (const name of refused) {
      world.ports.log.write('warn', `${name} encloses nothing and stayed out of the physics`)
    }
  }

  const discover = (world: World): void => {
    for (const type of PHYSICAL) {
      for (const entity of world.entities.withComponent(type)) {
        if (seen.has(entity.id)) continue
        seen.add(entity.id)
        if (kinematic(entity)) driven.push(entity)
        if (known.has(entity.id)) continue
        known.add(entity.id)
        const descriptor = bodyOf(entity, options, characters, world)
        if (descriptor) fresh.push(descriptor)
      }
    }
  }

  const forgetGone = (): void => {
    for (const name of known) if (!seen.has(name)) gone.push(name)
    for (const name of gone) known.delete(name)
    for (const name of gone) {
      for (const pair of triggered) {
        if (pair.startsWith(`${name}|`) || pair.endsWith(`|${name}`)) triggered.delete(pair)
      }
    }
  }

  /** Bodies for the entities that gained one, names for those that went away. */
  const sync = (world: World): void => {
    seen.clear()
    fresh.length = 0
    gone.length = 0
    driven.length = 0

    discover(world)
    forgetGone()
    if (gone.length > 0) world.ports.physics.remove(gone)
    if (fresh.length > 0) refuse(world, world.ports.physics.add(fresh))
  }

  /** Where the game has put its kinematic bodies — a `Movement` platform is the ordinary case. */
  const drive = (world: World): void => {
    poses.length = 0
    for (const entity of driven) {
      let pose = pool[poses.length]
      if (!pose) {
        pose = {
          body: '',
          position: entity.transform.position,
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        }
        pool.push(pose)
      }
      // 🛑 Through `worldOf` like `bodyOf`, and this is the THIRD traversal: placed raw, a
      // platform under a group was built at its composed place and sent to its LOCAL one on the
      // first step — and `poses` skips a kinematic, so nothing ever brought it back.
      const at = options.worldOf ? options.worldOf(entity) : entity.transform
      pose.body = entity.id
      pose.position = at.position
      quaternionFromEuler(at.rotation, pose.rotation)
      poses.push(pose)
    }
    world.ports.physics.place(poses)
  }

  return {
    name: 'physics',
    reads: PHYSICAL,
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      const port = world.ports.physics
      if (!started) {
        started = true
        // A document writes the pull DOWNWARD as a positive number; an engine reads an acceleration.
        port.setGravity(-world.play.gravity)
        refuse(world, port.add(options.statics ?? []))
      }

      sync(world)
      drive(world)
      characters.settle(port.moveCharacters(characters.intents(world, dt)))
      port.step(dt)
      settle(world, options.localOf, options.possessions)
      announce(world, triggered)
    },

    /** 🛑 Every body this put in, the floor included: the engine outlives a scene swap. */
    dispose: (world: World) => {
      // Nothing was added before the first step, and nothing is added twice: `world.dispose` is
      // promised idempotent, and a second pass would remove a floor the NEXT world had just laid.
      if (!started) return

      started = false
      world.ports.physics.remove([...known, ...(options.statics ?? []).map(one => one.body)])
      known.clear()
      triggered.clear()
    },
  }
}

const kinematic = (entity: Entity): boolean =>
  textOf(componentOf(entity, 'RigidBody'), 'kind', '') === 'kinematic'

function bodyOf(
  entity: Entity,
  options: PhysicsSystemOptions,
  characters: Characters,
  world: World,
): BodyDescriptor | null {
  const walker = componentOf(entity, 'CharacterController')
  const collider = componentOf(entity, 'Collider')
  const rigid = componentOf(entity, 'RigidBody')
  const shape: ColliderShape | null = walker
    ? { kind: 'capsule', ...characters.capsuleOf(entity) }
    : options.shapeOf(entity)
  if (!shape) return null

  // 🛑 `fixed` with no `RigidBody` beside it: a `Collider` alone is how an author says SOLID —
  // a wall, a floor, a trigger volume. Defaulting to `dynamic` dropped every one of them.
  const said = rigid ? textOf(rigid, 'kind', BODY.kind) : 'fixed'
  return {
    body: entity.id,
    kind: walker ? 'kinematic' : (BODY_KINDS.find(one => one === said) ?? 'fixed'),
    shape,
    transform: options.worldOf ? options.worldOf(entity) : entity.transform,
    friction: numberOf(collider, 'friction', COLLIDER.friction),
    restitution: numberOf(collider, 'restitution', COLLIDER.restitution),
    mass: numberOf(rigid, 'mass', BODY.mass),
    gravityScale: numberOf(rigid, 'gravityScale', BODY.gravityScale),
    lockRotation: walker !== null || flagOf(rigid, 'lockRotation', BODY.lockRotation),
    sensor: componentOf(entity, 'Trigger') !== null,
    character: walker ? characters.settingsOf(entity) : null,
    vehicle: vehicleOf(entity, world),
  }
}

/**
 * The wheels a `Vehicle` hangs, read off the child nodes it NAMES. Their own transforms are where
 * they hang, so an author moves a wheel mesh and the axle follows it.
 *
 * 🛑 Nothing for a vehicle whose wheels name nobody: a car built with no wheels would be a crate
 * that answers the pedals, which is worse than one the port refuses by name.
 */
function vehicleOf(entity: Entity, world: World): VehicleSettings | null {
  const settings = componentOf(entity, 'Vehicle')
  if (!settings) return null

  const drive = textOf(settings, 'drive', VEHICLE.drive)
  const wheels: VehicleWheel[] = []
  for (const said of textOf(settings, 'wheels', VEHICLE.wheels).split(',')) {
    const name = said.trim()
    const wheel = name === '' ? null : entityNamed(world, name)
    if (!wheel) continue

    // Ahead is −Z, which is where a node's own forward points: the front axle is what steers.
    const ahead = wheel.transform.position.z < 0
    wheels.push({
      body: wheel.id,
      at: { ...wheel.transform.position },
      steers: ahead,
      driven: drive === 'all' || (drive === 'front') === ahead,
      handBraked: !ahead,
    })
  }
  if (wheels.length === 0) return null

  return {
    wheelRadius: numberOf(settings, 'wheelRadius', VEHICLE.wheelRadius),
    wheelWidth: numberOf(settings, 'wheelWidth', VEHICLE.wheelWidth),
    suspensionLength: numberOf(settings, 'suspensionLength', VEHICLE.suspensionLength),
    maxSteerAngle: numberOf(settings, 'maxSteerAngle', VEHICLE.maxSteerAngle),
    maxTorque: numberOf(settings, 'maxTorque', VEHICLE.maxTorque),
    wheels,
  }
}

/** What the step moved, written back into the entity it belongs to — in ITS own frame. */
function settle(
  world: World,
  localOf: PhysicsSystemOptions['localOf'],
  possessions: Possessions,
): void {
  for (const pose of world.ports.physics.poses()) {
    const entity = world.entities.get(pose.body)
    // A carried body is placed by `possession`, not by the engine that still holds its capsule.
    if (!entity || possessions.holds(pose.body)) continue

    const turned = eulerFromQuaternion(pose.rotation, TURNED)
    const local = localOf ? localOf(entity, pose.position, turned) : null
    const position = local?.position ?? pose.position
    const rotation = local?.rotation ?? turned
    entity.transform.position.x = position.x
    entity.transform.position.y = position.y
    entity.transform.position.z = position.z
    entity.transform.rotation.x = rotation.x
    entity.transform.rotation.y = rotation.y
    entity.transform.rotation.z = rotation.z
  }
}

/**
 * Reused: a world with no hierarchy allocates nothing at all in `settle`. One WITH a hierarchy
 * does — `localOf` builds a matrix and decomposes it, some thirteen objects a body a step.
 * Churn, not time: see the measure on `Hierarchy`.
 */
const TURNED: Vector3 = { x: 0, y: 0, z: 0 }

/** What touched what, said on the bus. A body that is no entity has nothing to say it OF. */
function announce(world: World, triggered: Set<string>): void {
  for (const contact of world.ports.physics.contacts()) {
    if (!world.entities.get(contact.body)) continue

    if (!contact.sensed) {
      if (contact.started) {
        world.events.emit({
          name: 'Collided',
          entity: contact.body,
          payload: { other: contact.other },
        })
      }
      continue
    }

    // A pair rather than a count: a solid felt as several convex pieces meets a trigger more than
    // once, and a door counting contacts would stay open behind whoever walked through.
    const pair = `${contact.body}|${contact.other}`
    if (contact.started && !triggered.has(pair)) {
      triggered.add(pair)
      world.events.emit({
        name: 'TriggerEntered',
        entity: contact.body,
        payload: { other: contact.other },
      })
    }
    if (!contact.started && triggered.delete(pair)) {
      world.events.emit({
        name: 'TriggerExited',
        entity: contact.body,
        payload: { other: contact.other },
      })
    }
  }
}
