// SPDX-License-Identifier: MIT

import type { Component } from '@shared/domain/component'
import type { Transform, Vector3 } from '@shared/domain/transform'
import { clamp, DEGREES, lerpAngle } from '../../numeric'
import { restingAxes } from '../../physics/quaternion'
import { PITCH_LIMIT, type Characters } from '../characters'
import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { flagOf, numberOf, textOf } from '../componentFields'
import { copyAxes, componentOf, restingTransform, type Entity } from '../entity'
import { poseAt } from '../placements'
import { aheadOf, lookOf, type Look } from '../playView'
import type { Rigs } from '../rigs'
import { createTargets, turnTowards } from '../steering'
import { armPivot, armSeat } from './springArmRig'
import type { System, World } from '../world'

const ARM = COMPONENT_DEFAULTS.SpringArm

export type SpringArmOptions = {
  /** The one look the pointer drives, which an arm set to `pointer` hangs behind. */
  characters: Characters
  rigs: Rigs
  /** Where a node hanging from another actually stands. */
  worldOf: (entity: Entity, own: Transform) => Transform
  /** A world pose written back into a node's own frame — nothing when it hangs from nothing. */
  localOf: (entity: Entity, position: Vector3, rotation: Vector3) => Transform | null
  /**
   * The lens of a node that can be SEEN THROUGH, in degrees, and nothing for one that cannot. An
   * arm places whatever it is pointed at, but only a camera takes the shot — filming through a
   * mesh takes the picture from inside the model.
   */
  lensOf: (entity: Entity) => number | null
}

/**
 * What one arm remembers between frames. `aim` is the share the probe leaves it once the
 * hysteresis has had its say, `free` the share actually played, which crawls back up to `aim`.
 */
type Held = { look: Look; at: Vector3; aim: number; free: number }

/**
 * A camera on an arm, the way Unreal hangs one: it writes the camera NODE, so the outliner shows
 * where the picture is taken from. 🛑 The lag is written against the FRAME's seconds — against the
 * step it would run twice as fast on a screen drawing twice as often.
 */
export function createSpringArmSystem(options: SpringArmOptions): System {
  const { characters, rigs, worldOf, localOf, lensOf } = options
  // Two caches, because `createTargets` keeps ONE name per follower and an arm names two.
  const subjects = createTargets()
  const cameras = createTargets()
  const held = new WeakMap<Entity, Held>()
  const axes = restingAxes()

  /** Where the arm points this frame — the player's look, the subject's nose, or its own node. */
  const aimedAt = (orientation: string, anchor: Transform, arm: Entity): Look => {
    if (orientation === 'subject') return lookOf(anchor.rotation, axes, AIMED)
    if (orientation === 'fixed') {
      return lookOf(worldOf(arm, arm.transform).rotation, axes, AIMED)
    }
    return characters.look()
  }

  /** The camera node written where the arm put it, in the frame the node hangs in. */
  const place = (camera: Entity, at: Vector3, rotation: Vector3): void => {
    const local = localOf(camera, at, rotation)
    copyAxes(camera.transform.position, local?.position ?? at)
    copyAxes(camera.transform.rotation, local?.rotation ?? rotation)
  }

  const finish = (settings: Component, anchor: Transform, camera: Entity): void => {
    const aimed = textOf(settings, 'lookAt', ARM.lookAt) === 'subject' ? anchor.position : PIVOT
    BACK.x = aimed.x - PLACED.x
    BACK.y = aimed.y - PLACED.y
    BACK.z = aimed.z - PLACED.z
    const towards = BACK.x === 0 && BACK.y === 0 && BACK.z === 0 ? AHEAD : BACK
    turnTowards(TURNED, towards, 0)
    place(camera, PLACED, TURNED)
    const lens = lensOf(camera)
    if (lens !== null) rigs.take(camera, lens)
  }

  const updateArm = (world: World, entity: Entity, alpha: number, dt: number): void => {
    const settings = componentOf(entity, 'SpringArm')
    if (!settings) return
    const subject = subjects.of(world, entity, textOf(settings, 'subject', ARM.subject))
    const camera = cameras.of(world, entity, textOf(settings, 'camera', ARM.camera))
    if (!subject || !camera || camera === subject) return
    const anchor = worldOf(subject, poseAt(subject, alpha, DRAWN))
    const orientation = textOf(settings, 'orientation', ARM.orientation)
    const wanted = aimedAt(orientation, anchor, entity)
    let kept = held.get(entity)
    const over = kept ? dt : 0
    if (!kept) {
      kept = { look: { yaw: 0, pitch: 0 }, at: { x: 0, y: 0, z: 0 }, aim: 1, free: 1 }
      held.set(entity, kept)
    }
    aimAndPlace(settings, kept, wanted, orientation, anchor, over)
    collide(world, settings, kept, subject.id, camera.id, over)
    finish(settings, anchor, camera)
  }

  return {
    name: 'springArm',
    reads: ['SpringArm'],
    writes: [],

    lateUpdate: (world: World, alpha: number, dt: number) => {
      // `aim` walks from where it last saw the pointer, so `camera` taking it again after this
      // one moves it by zero — kept honest by `characters.test.ts`.
      characters.aim(world.ports.input.pointer())

      for (const entity of world.entities.withComponent('SpringArm')) {
        updateArm(world, entity, alpha, dt)
      }
    },
  }
}

function aimAndPlace(
  settings: Component,
  kept: Held,
  wanted: Look,
  orientation: string,
  anchor: Transform,
  over: number,
): void {
  const turn = approach(numberOf(settings, 'rotationLag', ARM.rotationLag), over)
  kept.look.yaw = lerpAngle(kept.look.yaw, wanted.yaw, turn)
  const asked = orientation === 'pointer' ? tipped(settings, wanted.pitch) : wanted.pitch
  kept.look.pitch += (asked - kept.look.pitch) * turn
  aheadOf(kept.look, AHEAD)
  armPivot(
    anchor.position,
    numberOf(settings, 'height', ARM.height),
    numberOf(settings, 'shoulder', ARM.shoulder),
    kept.look.yaw,
    PIVOT,
  )
  armSeat(PIVOT, AHEAD, numberOf(settings, 'length', ARM.length), WANTED)
  const glide = approach(numberOf(settings, 'positionLag', ARM.positionLag), over)
  kept.at.x += (WANTED.x - kept.at.x) * glide
  kept.at.y += (WANTED.y - kept.at.y) * glide
  kept.at.z += (WANTED.z - kept.at.z) * glide
}

function collide(
  world: World,
  settings: Component,
  kept: Held,
  subject: string,
  camera: string,
  over: number,
): void {
  copyAxes(PLACED, kept.at)
  if (!flagOf(settings, 'collision', ARM.collision)) return
  IGNORED[0] = subject
  IGNORED[1] = camera
  const dx = PLACED.x - PIVOT.x
  const dy = PLACED.y - PIVOT.y
  const dz = PLACED.z - PIVOT.z
  const reach = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const met = world.ports.physics.cast(
    PIVOT,
    PLACED,
    numberOf(settings, 'probeRadius', ARM.probeRadius),
    IGNORED,
  )
  updateCollision(
    settings,
    kept,
    shortened(met, numberOf(settings, 'safetyMargin', ARM.safetyMargin), reach),
    reach,
    over,
  )
  PLACED.x = PIVOT.x + dx * kept.free
  PLACED.y = PIVOT.y + dy * kept.free
  PLACED.z = PIVOT.z + dz * kept.free
}

function updateCollision(
  settings: Component,
  kept: Held,
  share: number,
  reach: number,
  over: number,
): void {
  const hysteresis = numberOf(settings, 'hysteresis', ARM.hysteresis)
  if (share < kept.aim || share >= 1 || (share - kept.aim) * reach > hysteresis) kept.aim = share
  if (kept.free === kept.aim) return
  const lag =
    kept.aim < kept.free
      ? numberOf(settings, 'collisionInLag', ARM.collisionInLag)
      : numberOf(settings, 'collisionOutLag', ARM.collisionOutLag)
  kept.free += (kept.aim - kept.free) * approach(lag, over)
}

/**
 * The share of the way to the mark one frame covers. `1 − e^(−dt/lag)` and never a constant per
 * frame: a constant makes the whole feel depend on how often the screen draws.
 */
function approach(lag: number, dt: number): number {
  if (lag <= 0 || dt <= 0) return 1
  return 1 - Math.exp(-dt / lag)
}

/** The margin is METRES and the probe answers a fraction: it means nothing without the reach. */
function shortened(met: number | null, margin: number, reach: number): number {
  if (met === null || reach <= 0) return 1
  return clamp(met - margin / reach, 0, 1)
}

/**
 * The pitch an arm is allowed, in the degrees an author reads. Held inside `PITCH_LIMIT` as well:
 * `numberOf` does not enforce the field's bounds, and a hand-written 120 would tip past vertical.
 */
function tipped(settings: Component, pitch: number): number {
  const low = clamp(
    numberOf(settings, 'pitchMin', ARM.pitchMin) * DEGREES,
    -PITCH_LIMIT,
    PITCH_LIMIT,
  )
  const high = clamp(
    numberOf(settings, 'pitchMax', ARM.pitchMax) * DEGREES,
    -PITCH_LIMIT,
    PITCH_LIMIT,
  )
  return clamp(pitch, Math.min(low, high), Math.max(low, high))
}

// Rewritten in place: an arm is worked out once a frame and allocates nothing doing it.
const DRAWN = restingTransform()
const AIMED: Look = { yaw: 0, pitch: 0 }
const PIVOT: Vector3 = { x: 0, y: 0, z: 0 }
const WANTED: Vector3 = { x: 0, y: 0, z: 0 }
const PLACED: Vector3 = { x: 0, y: 0, z: 0 }
const AHEAD: Vector3 = { x: 0, y: 0, z: 0 }
const BACK: Vector3 = { x: 0, y: 0, z: 0 }
const TURNED: Vector3 = { x: 0, y: 0, z: 0 }
const IGNORED: string[] = ['', '']
