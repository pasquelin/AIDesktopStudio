// SPDX-License-Identifier: MIT

import type { Component, ComponentType, JsonValue } from '@shared/domain/component'
import type { Vector3 } from '@shared/domain/transform'
import type { InputState } from '../ports/inputPort'
import type { InputActionValue } from '../runtime/inputMaps'
import type { InputBinding } from '../runtime/inputMap'
import type { InputBindings } from '../runtime/inputControls'

/**
 * One scripted entity as the sandbox sees it — a COPY, never a handle onto the world.
 *
 * 🛑 Everything a script may read in a step is here, and it crosses the bridge ONCE for the whole
 * frame. Measured 2026-08-26: a bridge call costs 1,34 µs against 0,15 µs for a thousand of the
 * same operations inside the machine, so an API answering one property at a time pays it per
 * property per entity. A script's own settings are NOT here: they belong to the instance, which
 * the sandbox already holds — see `ScriptInstance`.
 */
export type ScriptEntity = {
  entity: string
  name: string
  position: Vector3
  rotation: Vector3
  components: readonly Component[]
  /**
   * What its animator ended the LAST step on, or nothing for a body no graph animates.
   *
   * One step behind, as `position` is: `script` runs before `animator` in the declared order, so
   * what a script reads is what the frame being drawn actually shows.
   */
  anim?: { state: string; time: number }
}

/** What one hook is given: the clock, the input, and every entity that runs a script. */
export type ScriptFrame = {
  tick: number
  dt: number
  input: InputState
  actions: Readonly<Record<string, InputActionValue>>
  bindings?: InputBindings
  entities: readonly ScriptEntity[]
  /** What survived the last scene load. In the FRAME rather than behind a call: see the kernel. */
  kept: Readonly<Record<string, JsonValue>>
}

/**
 * What a script ASKED for, applied by the system afterwards through the world's own gestures.
 *
 * Deferred on purpose, twice over: it is what lets the whole frame cross the bridge in one call,
 * and it is what keeps a script from writing into a world being walked. `emit` carries a name the
 * script CHOSE, which no union of the studio holds — see how the system spells it out.
 */
export type ScriptIntent =
  | { act: 'move'; entity: string; by: Vector3 }
  | { act: 'place'; entity: string; at: Vector3 }
  | { act: 'turn'; entity: string; to: Vector3 }
  | { act: 'walk'; entity: string; x: number; z: number }
  | { act: 'jump'; entity: string }
  | { act: 'look'; entity: string; yaw: number; pitch: number }
  | { act: 'drive'; entity: string; throttle: number; steer: number; handBrake: boolean }
  | { act: 'fly'; entity: string; pitch: number; roll: number; yaw: number; throttle: number }
  | { act: 'field'; entity: string; type: ComponentType; key: string; value: JsonValue }
  | { act: 'spawn'; name: string; at: Vector3 | null }
  | { act: 'destroy'; entity: string }
  | { act: 'emit'; name: string; entity: string | null; payload: Record<string, JsonValue> }
  | { act: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { act: 'scene'; scene: string; fade: number }
  | { act: 'keep'; key: string; value: JsonValue }
  | { act: 'inputContext'; action: 'push' | 'pop'; id: string }
  | {
      act: 'inputRebind'
      context: string
      action: string
      index: number
      binding: InputBinding
    }
  | { act: 'inputReset'; context?: string; action?: string }
  | { act: 'animParam'; entity: string; param: string; value: number | boolean }
  | { act: 'animPlay'; entity: string; state: string }
  | { act: 'animStop'; entity: string }

/** What a script did wrong, where an editor could open it. */
export type ScriptFault = {
  /** The script's reference, as `refToString` spells one. */
  script: string
  /** The entity it was running for, when it was running for one. */
  entity: string | null
  message: string
  /** One-based, as an editor counts. Zero when the engine could not say. */
  line: number
  column: number
}

export type ScriptOutcome = {
  intents: readonly ScriptIntent[]
  faults: readonly ScriptFault[]
}

/** The hooks a fixed step drives. `onDestroy` is not one: `detach` runs it. */
export type ScriptHook = 'onCreate' | 'onStart' | 'onUpdate' | 'onLateUpdate'

export const NO_OUTCOME: ScriptOutcome = { intents: [], faults: [] }
