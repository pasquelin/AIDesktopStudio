// SPDX-License-Identifier: MIT

import { IDENTITY_TRANSFORM, type Transform, type Vector3 } from '@shared/domain/transform'
import type {
  BodyDescriptor,
  BodyForce,
  BodyMotion,
  BodyPose,
  CharacterMove,
  CharacterMoved,
  PhysicsContact,
  PhysicsPort,
  VehicleDrive,
} from '../ports/physicsPort'

/**
 * A body at rest where it is put. 🛑 Its axes are its OWN: spread from `IDENTITY_TRANSFORM`, a
 * case writing `transform.rotation.y` would turn the identity every later case reads.
 */
export const restingAt = (x: number, y: number, z: number): Transform => ({
  position: { x, y, z },
  rotation: { ...IDENTITY_TRANSFORM.rotation },
  scale: { ...IDENTITY_TRANSFORM.scale },
})

/** A body at the defaults every suite writes out: only its name, its shape and its kind differ. */
export const describedBody = (
  over: Partial<BodyDescriptor> & Pick<BodyDescriptor, 'body' | 'shape'>,
): BodyDescriptor => ({
  kind: 'dynamic',
  transform: restingAt(0, 0, 0),
  friction: 0.6,
  restitution: 0,
  mass: 0,
  gravityScale: 1,
  lockRotation: false,
  sensor: false,
  character: null,
  vehicle: null,
  ...over,
})

export type NotedPhysics = PhysicsPort & {
  added: BodyDescriptor[]
  removed: string[]
  placed: BodyPose[]
  asked: CharacterMove[]
  driven: VehicleDrive[]
  pushed: BodyForce[]
  probes: { from: Vector3; to: Vector3; radius: number; ignore: readonly string[] }[]
  steps: number[]
  gravity: number
  /** What the next `poses` and `contacts` answer, so a case says what the engine decided. */
  answers: {
    poses: BodyPose[]
    contacts: PhysicsContact[]
    moved: CharacterMoved[]
    motion: BodyMotion[]
    /** The fraction the next `cast` answers. A clear way is what a physics with no bodies has. */
    cast: number | null
  }
}

/** A physics that decides nothing and remembers everything — what a system is measured against. */
export function notedPhysics(): NotedPhysics {
  const noted: NotedPhysics = {
    added: [],
    removed: [],
    placed: [],
    asked: [],
    driven: [],
    pushed: [],
    probes: [],
    steps: [],
    gravity: 0,
    answers: { poses: [], contacts: [], moved: [], motion: [], cast: null },

    setGravity: y => {
      noted.gravity = y
    },
    add: bodies => {
      noted.added.push(...bodies)
      return []
    },
    remove: bodies => {
      noted.removed.push(...bodies)
    },
    place: poses => {
      noted.placed.push(...poses.map(pose => ({ ...pose, position: { ...pose.position } })))
    },
    moveCharacters: wanted => {
      noted.asked.push(...wanted.map(one => ({ ...one, wanted: { ...one.wanted } })))
      return noted.answers.moved
    },
    drive: wanted => {
      noted.driven.push(...wanted.map(one => ({ ...one })))
    },
    push: forces => {
      noted.pushed.push(
        ...forces.map(one => ({ ...one, force: { ...one.force }, torque: { ...one.torque } })),
      )
    },
    // In the ORDER ASKED, as the real port answers: both callers walk a cursor over the result,
    // and a double answering in its own order would exercise the « port does not hold it » path.
    motion: bodies => bodies.flatMap(body => noted.answers.motion.filter(one => one.body === body)),
    cast: (from, to, radius, ignore) => {
      noted.probes.push({ from: { ...from }, to: { ...to }, radius, ignore: [...ignore] })
      return noted.answers.cast
    },
    step: dt => {
      noted.steps.push(dt)
    },
    poses: () => noted.answers.poses,
    contacts: () => noted.answers.contacts,
    dispose: () => {},
  }

  return noted
}
