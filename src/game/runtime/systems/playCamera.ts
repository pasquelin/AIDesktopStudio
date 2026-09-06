// SPDX-License-Identifier: MIT

import { restingAxes } from '../../physics/quaternion'
import type { Transform } from '@shared/domain/transform'
import type { Characters } from '../characters'
import { restingTransform, type Entity } from '../entity'
import { PILOT_RANK, type Pilots } from '../pilots'
import { poseAt } from '../placements'
import { armView, lookOf, OVER_SHOULDER, playView, type Look } from '../playView'
import type { Rigs } from '../rigs'
import type { System, World } from '../world'

export type PlayCameraOptions = {
  characters: Characters
  /**
   * A leader hanging from a group carries a LOCAL transform, which frames a point it is not at.
   * The pose is passed rather than read: a frame frames where the leader is DRAWN, not where the
   * last step left it.
   */
  worldOf?: (entity: Entity, own: Transform) => Transform
  /** The one seat, which this system fills for a walker and reads for everyone. */
  pilots: Pilots
  /** The camera node a spring arm placed, empty when the scene holds no arm. */
  rigs: Rigs
  /**
   * The body the scene's player module designates, resolved by the WINDOW like `lensOf` and the
   * shapes: the runtime holds no tree, so who hangs under what is answered where it is known.
   */
  playerBodyId?: string | null
}

/**
 * 🛑 A character is watched through the one look the pointer drives; a MACHINE is watched from
 * behind its own nose. A car turning under a camera that only the mouse aims reads as a car
 * sliding sideways.
 */
export function createPlayCameraSystem(options: PlayCameraOptions): System {
  const { characters, worldOf, pilots, rigs, playerBodyId } = options
  const chase: Look = { yaw: 0, pitch: 0 }
  const axes = restingAxes()

  return {
    name: 'camera',
    reads: ['CharacterController', 'Vehicle', 'Aircraft'],
    writes: [],

    /**
     * 🛑 The walker claims here — it has no system of its own — and the seat is RELEASED once the
     * view is composed: a car destroyed mid-game stops claiming, and a seat nobody emptied would
     * frame a dead entity for the rest of the session.
     */
    lateUpdate: (world: World, alpha: number) => {
      // A LIVE read, the one place in the runtime that takes one: everything else answers for
      // the step, and where the head points is a question about the frame being drawn.
      characters.aim(world.ports.input.pointer())

      // The module first, the sweep behind it: a module naming a body the scene no longer holds
      // frames whoever walks rather than nothing at all.
      const named = playerBodyId ? world.entities.get(playerBodyId) : null
      const walker = named ?? characters.leader()
      if (walker) {
        const capsule = characters.capsuleOf(walker)
        pilots.take(walker, capsule.halfHeight + capsule.radius, OVER_SHOULDER, PILOT_RANK.walker)
      }

      // 🛑 BOTH are emptied before anything is composed, arm or no arm: `take` refuses a claim of
      // equal rank once a seat is full, so a seat left held while an arm films pins the first
      // machine that ever claimed it — and goes on framing it once it is destroyed.
      const armed = rigs.leader()
      const seat = pilots.leader()
      rigs.release()
      pilots.release()

      // 🛑 An arm wins over the modes, and that is what makes it OPTIONAL: a scene with no arm
      // is framed exactly as it was, and one with an arm is framed through the node it placed.
      if (armed) {
        const shot = worldOf ? worldOf(armed, armed.transform) : armed.transform
        world.ports.render.view(
          armView(world.play, shot.position, shot.rotation, axes, rigs.lens()),
        )
        return
      }

      // A later scene with nobody to film must still give the lens back.
      if (!seat) {
        world.ports.render.view(null)
        return
      }

      // 🛑 The world transform for BOTH: framed at a composed point from a rotation read in a
      // parent's frame, a chase camera sits in the wrong direction behind a parented machine. And
      // the DRAWN pose, or the one thing the picture is hung on judders while all of it is smooth.
      const shown = poseAt(seat.entity, alpha, DRAWN)
      const placed = worldOf ? worldOf(seat.entity, shown) : shown
      FEET.x = placed.position.x
      FEET.y = placed.position.y - seat.below
      FEET.z = placed.position.z
      const look = seat.entity === walker ? characters.look() : lookOf(placed.rotation, axes, chase)
      world.ports.render.view(playView(world.play, FEET, look, seat.back))
    },
  }
}

/** Rewritten in place: a camera is read once a frame and never kept. */
const FEET = { x: 0, y: 0, z: 0 }
const DRAWN = restingTransform()
