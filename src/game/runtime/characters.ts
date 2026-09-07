// SPDX-License-Identifier: MIT

import type { Pointer } from '../ports/inputPort'
import type { CharacterMove, CharacterMoved, CharacterSettings } from '../ports/physicsPort'
import type { Component } from '@shared/domain/component'
import type { ScenePlay } from '@shared/domain/scene'
import { clamp, DEGREES, FULL_TURN, shortWay } from '../numeric'
import { numberOf } from './componentFields'
import type { InputActions } from './inputActions'
import type { Intents } from './intents'
import { COMPONENT_DEFAULTS } from './componentDefaults'
import { componentOf, type Entity } from './entity'
import { pooled } from '../pooled'
import type { Transform } from '@shared/domain/transform'
import type { Look } from './playView'
import type { Possessions } from './possessions'
import type { World } from './world'

const WALKER = COMPONENT_DEFAULTS.CharacterController

const freshMove = (): CharacterMove => ({
  body: '',
  wanted: { x: 0, y: 0, z: 0 },
  facing: null,
})

/** Metres a second a fall stops getting faster at: past it a step tunnels through a thin floor. */
const TERMINAL_FALL = 50

/** Radians of turn per pixel dragged. */
const LOOK_PER_PIXEL = 0.005

/** Radians a second at full stick. A stick holds a POSITION, so its turn is paid per second. */
const LOOK_PER_SECOND = 2.6

/** 🛑 At the STEP, not the frame: a drag is idempotent between two aiming systems, a stick is not. */
function turnBy(look: Look, stick: { x: number; y: number }, dt: number): void {
  // 🛑 CLAMPED before it is scaled: a script may pass any finite number, and 1e308 × 2,6 is
  // Infinity — whose remainder is NaN, which this object then keeps for the whole session.
  const turn = clamp(stick.x, -1, 1) * LOOK_PER_SECOND * dt
  const tilt = clamp(stick.y, -1, 1) * LOOK_PER_SECOND * dt
  look.yaw = (look.yaw - turn) % FULL_TURN
  look.pitch = clamp(look.pitch - tilt, -PITCH_LIMIT, PITCH_LIMIT)
}

/** A hair under straight up, where yaw and pitch would turn about the same axis. */
export const PITCH_LIMIT = Math.PI / 2 - 0.01

/**
 * Kept pressing into the floor while standing. Zero would let `snapToGround` lose a character
 * walking down a slope, which then falls the whole step rather than following the ground.
 */
const GROUNDED_PULL = -1

/** Where a node hanging from another actually stands, which is the frame a heading is sent in. */
export type Placed = (entity: Entity) => Transform

/**
 * What one character remembers between steps. Its pose belongs to the entity, not here.
 * `airborne` and `asked` are SECONDS since the ground was left and since a jump was asked for.
 */
type Walker = {
  velocityY: number
  wantedY: number
  grounded: boolean
  paceX: number
  paceZ: number
  facing: number
  airborne: number
  asked: number
}

const FRESH_WALKER: Omit<Walker, 'facing'> = {
  velocityY: 0,
  wantedY: 0,
  grounded: false,
  paceX: 0,
  paceZ: 0,
  airborne: Infinity,
  asked: Infinity,
}

export type Characters = {
  /**
   * Where the head is pointed, off a live read of the pointer.
   *
   * 🛑 Once a FRAME, never once a step: sampled at the fixed step, a frame the accumulator ran
   * none of ignored the mouse and the next took two moves at once.
   */
  aim: (pointer: Pointer) => void
  /** What each one asks to move this step, read off the input and the scene's own pace. */
  intents: (world: World, dt: number) => readonly CharacterMove[]
  /** What actually happened, back from the controller. */
  settle: (moved: readonly CharacterMoved[]) => void
  settingsOf: (entity: Entity) => CharacterSettings
  /**
   * The capsule an entity is FELT as, and what the eye height is measured down from. Read in one
   * place: a body 0,2 tall around a radius of 5 is ten metres of capsule, and a camera trusting
   * the field alone would put the eye five metres under the floor.
   */
  capsuleOf: (entity: Entity) => { halfHeight: number; radius: number }
  /** Who the camera watches: the first entity that declared a controller. */
  leader: () => Entity | null
  look: () => Look
  /**
   * What that body is DOING, for whoever has to show it rather than move it — the animator.
   *
   * 🛑 A reading and never a handle: the walker is written every step, and an animator holding
   * one would read a pose half a step old on the frames between two steps.
   */
  reading: (entity: Entity) => WalkerReading | null
}

/**
 * The walker as something other than the controller sees it. Metres a second, and radians.
 *
 * 🛑 In the BODY's own frame, composed here: the pace is written in the world — see `paceInto` —
 * and turning it back is the same convention read backwards. Written twice, a sign flipped on one
 * side would make a walk read as a step aside, and nothing would say so.
 *
 * 🛑 `airborne` is NOT here: the controller writes `Infinity` into it to mark a jump as spent, so
 * it is a flag half the time rather than a duration. Whoever needs how long a body has been off
 * the ground counts it from `grounded`.
 */
export type WalkerReading = {
  /** Over the ground, whichever way the body faces. */
  speed: number
  /** Along the body's own heading, negative walking backwards. */
  forward: number
  /** Across it, positive to the body's right. */
  strafe: number
  grounded: boolean
  velocityY: number
  /** Where the body points, in radians. */
  facing: number
}

/**
 * What turns keys and a drag into a movement the physics is allowed to correct. The pace, the
 * pull and the eye height are the SCENE's (`world.play`); the component holds the body itself.
 *
 * 🛑 One look for the whole world: there is one pointer, so a second controller walks the same
 * heading.
 */
export function createCharacters(
  possessions: Possessions,
  worldOf: Placed,
  intents: Intents,
): Characters {
  const walkers = new WeakMap<Entity, Walker>()
  const byBody = new Map<string, Walker>()
  // `pool` HOLDS the moves and never shrinks; `moves` is the list handed to the port.
  const pool: CharacterMove[] = []
  const moves: CharacterMove[] = []
  const look: Look = { yaw: 0, pitch: 0 }
  const pace = { x: 0, z: 0 }
  let first: Entity | null = null
  // Rewritten rather than replaced: this runs on every frame of a drag.
  const dragged = { x: 0, y: 0 }
  let dragging = false

  /**
   * 🛑 Seeded from the WORLD yaw the author put the body at: a heading is sent to the port in
   * world, and a walker starting at zero snapped a turned body straight on frame one.
   */
  const walkerFor = (entity: Entity): Walker => {
    const kept = walkers.get(entity)
    if (kept) return kept

    const made: Walker = { ...FRESH_WALKER, facing: worldOf(entity).rotation.y }
    walkers.set(entity, made)
    return made
  }

  return {
    aim: pointer => {
      if (!pointer.down) {
        dragging = false
        return
      }
      if (dragging) {
        // Wrapped, like `normalizeAzimuth` does for the viewport: a session spent turning one way
        // walks the yaw off into large floats, where a radian stops resolving a degree.
        look.yaw = (look.yaw - (pointer.x - dragged.x) * LOOK_PER_PIXEL) % FULL_TURN
        look.pitch -= (pointer.y - dragged.y) * LOOK_PER_PIXEL
        look.pitch = clamp(look.pitch, -PITCH_LIMIT, PITCH_LIMIT)
      }
      dragged.x = pointer.x
      dragged.y = pointer.y
      dragging = true
    },

    intents: (world, dt) => {
      moves.length = 0
      byBody.clear()
      first = null
      // One reading, one answer: asked per walker, this repeated the same question a step.
      const asked = world.actions.pressed('jump')

      for (const entity of world.entities.withComponent('CharacterController')) {
        const settings = componentOf(entity, 'CharacterController')
        if (!settings) continue
        // Before the freeze, deliberately: a player in a car is still the one the camera watches,
        // and its body is standing on the car — see `possession.ts`.
        first ??= entity
        // 🛑 A held body asks for NOTHING — no pace, and no gravity either: a frozen walker left
        // falling sinks through whatever carries it.
        if (possessions.holds(entity.id)) continue

        const walker = walkerFor(entity)
        fallInto(walker, settings, asked || intents.jumped(entity.id), world.play.gravity, dt)

        // 🛑 The run is the PLAYER's, so it goes with the sticks: a scripted walk that kept it
        // doubled its pace because somebody was leaning on Shift.
        const own = intents.walkOf(entity.id)
        paceInto(
          pace,
          own ?? world.actions.axis2('move'),
          paceOf(settings, world.play, own ? null : world.actions),
          look.yaw,
        )
        const steered = pace.x !== 0 || pace.z !== 0
        leanInto(walker, pace, rateOf(settings, walker, steered) * dt)

        const move = pooled(pool, moves.length, freshMove)
        move.body = entity.id
        move.wanted.x = walker.paceX * dt
        move.wanted.y = walker.wantedY
        move.wanted.z = walker.paceZ * dt
        move.facing = facedTowards(walker, settings, pace, dt, look, world.play.camera)
        moves.push(move)
        byBody.set(entity.id, walker)
      }

      // After the walkers: who may turn the shared look is `turnedBy`'s own question.
      if (moves.length > 0) turnBy(look, turnedBy(world, intents, first, possessions), dt)

      return moves
    },

    settle: moved => {
      for (const one of moved) {
        const walker = byBody.get(one.body)
        if (!walker) continue
        walker.grounded = one.grounded
        // Standing: held at a constant press rather than at zero, so `snapToGround` keeps a grip
        // on the ground of a slope walked down instead of losing it for a step.
        if (one.grounded && walker.velocityY <= 0) walker.velocityY = GROUNDED_PULL
        // Head against a ceiling: the rise was refused, and a velocity nobody cleared would make
        // the character hang there until the whole jump had been spent.
        else if (walker.wantedY > 0 && one.moved.y < walker.wantedY / 2) walker.velocityY = 0
      }
    },

    settingsOf: entity => {
      const settings = componentOf(entity, 'CharacterController')
      return {
        stepHeight: numberOf(settings, 'stepHeight', WALKER.stepHeight),
        slopeLimit: numberOf(settings, 'slopeLimit', WALKER.slopeLimit),
        snapDistance: numberOf(settings, 'snapDistance', WALKER.snapDistance),
      }
    },

    capsuleOf: entity => {
      const settings = componentOf(entity, 'CharacterController')
      const radius = numberOf(settings, 'radius', WALKER.radius)
      const height = numberOf(settings, 'height', WALKER.height)
      return { halfHeight: Math.max(0, height / 2 - radius), radius }
    },

    leader: () => first,
    look: () => look,

    reading: entity => {
      const walker = walkers.get(entity)
      if (!walker) return null

      const cos = Math.cos(walker.facing)
      const sin = Math.sin(walker.facing)

      return {
        speed: Math.hypot(walker.paceX, walker.paceZ),
        forward: -(walker.paceZ * cos + walker.paceX * sin),
        strafe: walker.paceX * cos - walker.paceZ * sin,
        grounded: walker.grounded,
        velocityY: walker.velocityY,
        facing: walker.facing,
      }
    },
  }
}

/**
 * The look a script asked for, or the stick — and NOTHING while the leader is held: driving, that
 * same stick steers the car, and a head turned meanwhile snaps the camera on getting out.
 */
function turnedBy(
  world: World,
  intents: Intents,
  walker: Entity | null,
  possessions: Possessions,
): { x: number; y: number } {
  if (!walker || possessions.holds(walker.id)) return AT_REST
  return intents.lookOf(walker.id) ?? world.actions.axis2('look')
}

const AT_REST = { x: 0, y: 0 }

/**
 * Level, and never faster on the diagonal: two keys held would otherwise walk at 1,41 times.
 * 🛑 A stick is NOT normalised back up — a third of the way is a third of the pace, which is the
 * whole of what an analogue stick buys over a key.
 */
function paceInto(
  into: { x: number; z: number },
  wanted: { x: number; y: number },
  speed: number,
  yaw: number,
): void {
  // Ahead is negative on y, the axis a stick pushed forward reads on — see the `character` preset.
  const ahead = -wanted.y
  const side = wanted.x
  const length = Math.hypot(ahead, side)
  const walk = speed / Math.max(1, length)

  into.x = (-Math.sin(yaw) * ahead + Math.cos(yaw) * side) * walk
  into.z = (-Math.cos(yaw) * ahead - Math.sin(yaw) * side) * walk
}

/** Metres a second. 🛑 Zero is « what the SCENE says » for the walk and « no running » for the run. */
function paceOf(settings: Component | null, play: ScenePlay, actions: InputActions | null): number {
  const run = numberOf(settings, 'runSpeed', WALKER.runSpeed)
  if (run > 0 && actions?.button('run')) return run
  return numberOf(settings, 'moveSpeed', WALKER.moveSpeed) || play.moveSpeed
}

/** The whole VECTOR, never each axis apart: a walker turning a corner would take it as two legs. */
function leanInto(walker: Walker, wanted: { x: number; z: number }, step: number): void {
  const gapX = wanted.x - walker.paceX
  const gapZ = wanted.z - walker.paceZ
  const gap = Math.sqrt(gapX * gapX + gapZ * gapZ)
  if (step <= 0 || gap <= step) {
    walker.paceX = wanted.x
    walker.paceZ = wanted.z
    return
  }
  walker.paceX += (gapX / gap) * step
  walker.paceZ += (gapZ / gap) * step
}

/** How fast the pace is worked towards what the keys ask, which the air holds a walker back from. */
function rateOf(settings: Component | null, walker: Walker, steered: boolean): number {
  const rate = steered
    ? numberOf(settings, 'acceleration', WALKER.acceleration)
    : numberOf(settings, 'deceleration', WALKER.deceleration)
  if (walker.grounded) return rate
  return rate * numberOf(settings, 'airControl', WALKER.airControl)
}

/**
 * Gravity, and the jump the two tolerances allow. Coyote and buffer are one tolerance read from
 * both sides: a jump counts while the ground has only just gone, and an early press is kept.
 */
function fallInto(
  walker: Walker,
  settings: Component,
  jumped: boolean,
  gravity: number,
  dt: number,
): void {
  walker.airborne = walker.grounded ? 0 : walker.airborne + dt
  walker.asked = jumped ? 0 : walker.asked + dt
  if (
    walker.airborne <= numberOf(settings, 'coyoteTime', WALKER.coyoteTime) &&
    walker.asked <= numberOf(settings, 'jumpBuffer', WALKER.jumpBuffer)
  ) {
    walker.velocityY = numberOf(settings, 'jumpSpeed', WALKER.jumpSpeed)
    walker.airborne = Infinity
    walker.asked = Infinity
  }
  walker.velocityY = Math.max(walker.velocityY - gravity * dt, -TERMINAL_FALL)
  walker.wantedY = walker.velocityY * dt
}

/**
 * Turns toward the requested heading, unless the author disabled body rotation.
 */
function facedTowards(
  walker: Walker,
  settings: Component,
  pace: { x: number; z: number },
  dt: number,
  look: Look,
  view: ScenePlay['camera'],
): number | null {
  const turn = numberOf(settings, 'bodyTurnSpeed', WALKER.bodyTurnSpeed)
  if (turn <= 0) return null
  const heading =
    view === 'firstPerson'
      ? look.yaw
      : pace.x !== 0 || pace.z !== 0
        ? Math.atan2(-pace.x, -pace.z)
        : walker.facing
  const step = turn * DEGREES * dt
  walker.facing += clamp(shortWay(walker.facing, heading), -step, step)
  return walker.facing
}
