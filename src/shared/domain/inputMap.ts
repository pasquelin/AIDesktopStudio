import { isRecord } from '../guards'
import {
  inputBindingFits,
  inputBindingOrNull,
  isInputActionKind,
  INPUT_MAP_VERSION,
  type InputAction,
  type InputMap,
} from '@game/runtime/inputMap'

/**
 * The studio's half of the control-map domain: what a document is called, and a reader that
 * REFUSES rather than answering `null`.
 *
 * 🛑 The shape, the version, the parser and `inputBindingFits` are the game runtime's — that tree
 * is MIT and this one is PolyForm, so MIT comes here and never the other way. Written the other
 * way round, the runtime kept a copy of all of it and three guards watched for a drift.
 */
export {
  INPUT_MAP_VERSION,
  inputBindingFits,
  type GamepadBinding,
  type GamepadControl,
  type InputAction,
  type InputActionKind,
  type InputBinding,
  type InputMap,
  type KeyboardBinding,
} from '@game/runtime/inputMap'

/**
 * 🛑 A map written under version 1 is READ, never refused: those files predate the day the
 * built-in contexts became active by default, so their `defaultActive` says nothing about what
 * their author wanted. `completedInputMap` — and `withDefaultInputMaps` on the game side — take
 * the built-in's answer for a built-in context, and leave a context of the project's own alone.
 */
const INPUT_MAP_VERSIONS: readonly number[] = [1, INPUT_MAP_VERSION]
export const INPUT_MAP_EXTENSION = '.input.json'

export type InputMapModule = { path: string; map: InputMap }

export function inputMapOf(value: unknown): InputMap {
  if (!isRecord(value)) throw new Error('input map must be an object')
  const { version, id, priority, defaultActive, actions } = value
  if (typeof version !== 'number' || !INPUT_MAP_VERSIONS.includes(version))
    throw new Error('unsupported input map version')
  if (typeof id !== 'string' || id.length === 0) throw new Error('input map id is required')
  if (typeof priority !== 'number' || !Number.isFinite(priority))
    throw new Error('invalid input priority')
  if (typeof defaultActive !== 'boolean') throw new Error('input defaultActive is required')
  if (!Array.isArray(actions)) throw new Error('input actions must be an array')

  const parsed = actions.map(inputActionOf)
  if (new Set(parsed.map(action => action.id)).size !== parsed.length)
    throw new Error('input action ids must be unique')

  return { version, id, priority, defaultActive, actions: parsed }
}

function inputActionOf(value: unknown): InputAction {
  if (!isRecord(value)) throw new Error('input action must be an object')
  const { id, kind, bindings } = value
  if (typeof id !== 'string' || id.length === 0) throw new Error('input action id is required')
  if (!isInputActionKind(kind)) throw new Error('invalid input action kind')
  if (!Array.isArray(bindings)) throw new Error('input bindings must be an array')

  const parsed = bindings.map(inputBindingOf)
  if (parsed.some(binding => !inputBindingFits(kind, binding)))
    throw new Error('input binding does not match its action kind')

  return { id, kind, bindings: parsed }
}

/**
 * The runtime's reader, turned into a refusal.
 *
 * A file the studio opens is one a person can be told about; the game reads the same bytes at
 * launch and has nobody to tell, so it drops the binding and plays on. One rule, two answers.
 */
function inputBindingOf(value: unknown) {
  const binding = inputBindingOrNull(value)
  if (!binding) throw new Error('invalid input binding')
  return binding
}
