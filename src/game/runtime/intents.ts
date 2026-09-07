// SPDX-License-Identifier: MIT

import type { Stick } from '../physics/aerodynamics'

type Steering = { throttle: number; steer: number; handBrake: boolean }

/**
 * What a SCRIPT asks of a body this step, which the built-in controller then carries out — the
 * `AddMovementInput` of this runtime. Shared the way `possessions` is: `script` writes, the three
 * controllers read, and everything is dropped at the top of the next step.
 *
 * 🛑 It REPLACES what the input map said, for that step and that body alone. A script silent on
 * one step hands the sticks back on it; a script that writes every step owns the body. That is
 * what lets one say « stand still » — an intent that only added could never ask for nothing.
 *
 * 🛑 Two exceptions, both in `characters.ts`: a jump ADDS to the button, an impulse having no way
 * to be un-pressed; and there is one look for the world, read for the body the camera watches
 * alone. `walk` and `drive` and `fly` replace, per body.
 *
 * 🛑 What used to be a blind spot is now SAID: an ask landing on a body no controller reads — a
 * script on a child mesh, a `drive` from a walker's module — is still dropped, but `report` names
 * it once. So is a second script writing the same body on the same step, where the last one wins.
 */
export type Intents = {
  walk: (bodyId: string, x: number, z: number) => void
  jump: (bodyId: string) => void
  look: (bodyId: string, yaw: number, pitch: number) => void
  drive: (bodyId: string, throttle: number, steer: number, handBrake: boolean) => void
  fly: (bodyId: string, pitch: number, roll: number, yaw: number, throttle: number) => void

  /** In the shape a STICK speaks: ahead is negative on y, as a stick pushed forward reads. */
  walkOf: (bodyId: string) => { x: number; y: number } | null
  jumped: (bodyId: string) => boolean
  lookOf: (bodyId: string) => { x: number; y: number } | null
  driveOf: (bodyId: string) => Steering | null
  flyOf: (bodyId: string) => Stick | null

  /** Called at the top of each step's scripts: what nobody asked for again is nobody's now. */
  release: () => void
}

export function createIntents(report?: (message: string) => void): Intents {
  const walking = new Map<string, { x: number; y: number }>()
  const jumping = new Set<string>()
  const looking = new Map<string, { x: number; y: number }>()
  const driving = new Map<string, Steering>()
  const flying = new Map<string, Stick>()

  // 🛑 One set of body ids PER KIND, and not one set keyed `kind:body`: the studio always hands
  // a `report`, so that key was a string built per read per step — sixty allocations a second a
  // body, for bookkeeping. `said` never clears, or a body nobody reads writes a line every step.
  const read = {
    walk: new Set<string>(),
    jump: new Set<string>(),
    look: new Set<string>(),
    drive: new Set<string>(),
    fly: new Set<string>(),
  }
  // Listed once: `Object.values` would build a five-entry array at the top of EVERY step, which
  // is the allocation the sets above exist to remove.
  const reads = [read.walk, read.jump, read.look, read.drive, read.fly]
  const said = new Set<string>()

  const say = (message: string, key: string): void => {
    if (!report || said.has(key)) return
    said.add(key)
    report(message)
  }

  const twice = (kind: string, bodyId: string): void =>
    say(
      `two scripts ask ${kind} of body ${bodyId} on one step: the last one wins`,
      `2:${kind}:${bodyId}`,
    )

  const dropped = (kind: keyof typeof read, bodyId: string): void => {
    if (read[kind].has(bodyId)) return
    say(
      `${kind} was asked of body ${bodyId}, which no controller reads: the ask is dropped`,
      `0:${kind}:${bodyId}`,
    )
  }

  const taken = <T>(kind: keyof typeof read, bodyId: string, held: T | undefined): T | null => {
    read[kind].add(bodyId)
    return held ?? null
  }

  return {
    // A script says its z, a stick says its y, and both go the same way — normalised HERE so
    // nothing downstream has to ask which of the two it is reading.
    walk: (bodyId, x, z) => {
      if (report && walking.has(bodyId)) twice('walk', bodyId)
      walking.set(bodyId, { x, y: z })
    },
    jump: bodyId => void jumping.add(bodyId),
    look: (bodyId, yaw, pitch) => {
      if (report && looking.has(bodyId)) twice('look', bodyId)
      looking.set(bodyId, { x: yaw, y: pitch })
    },
    drive: (bodyId, throttle, steer, handBrake) => {
      if (report && driving.has(bodyId)) twice('drive', bodyId)
      driving.set(bodyId, { throttle, steer, handBrake })
    },
    fly: (bodyId, pitch, roll, yaw, throttle) => {
      if (report && flying.has(bodyId)) twice('fly', bodyId)
      flying.set(bodyId, { pitch, roll, yaw, throttle })
    },

    walkOf: bodyId => taken('walk', bodyId, walking.get(bodyId)),
    jumped: bodyId => {
      read.jump.add(bodyId)
      return jumping.has(bodyId)
    },
    lookOf: bodyId => taken('look', bodyId, looking.get(bodyId)),
    driveOf: bodyId => taken('drive', bodyId, driving.get(bodyId)),
    flyOf: bodyId => taken('fly', bodyId, flying.get(bodyId)),

    release: () => {
      if (report) {
        for (const bodyId of walking.keys()) dropped('walk', bodyId)
        for (const bodyId of jumping) dropped('jump', bodyId)
        for (const bodyId of looking.keys()) dropped('look', bodyId)
        for (const bodyId of driving.keys()) dropped('drive', bodyId)
        for (const bodyId of flying.keys()) dropped('fly', bodyId)
      }
      for (const one of reads) one.clear()
      walking.clear()
      jumping.clear()
      looking.clear()
      driving.clear()
      flying.clear()
    },
  }
}
