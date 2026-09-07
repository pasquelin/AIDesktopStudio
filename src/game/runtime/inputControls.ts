// SPDX-License-Identifier: MIT

import { isRecord } from '../guards'
import {
  inputBindingFits,
  inputBindingOrNull,
  type InputAction,
  type InputBinding,
  type InputMap,
} from './inputMap'
import { withDefaultInputMaps } from './inputDefaults'

export type InputBindings = Readonly<
  Record<string, Readonly<Record<string, readonly InputBinding[]>>>
>

export type InputControlsStorage = {
  read: () => unknown
  write: (maps: readonly InputMap[]) => void
}

export type InputControls = {
  maps: () => readonly InputMap[]
  bindings: () => InputBindings
  revision: () => number
  rebind: (context: string, action: string, index: number, binding: unknown) => boolean
  reset: (context?: string, action?: string) => void
}

/**
 * 🛑 What is given is COMPLETED by the built-in contexts, never replaced: a project that declares
 * no `.input.json` still walks, drives and flies — see `inputDefaults`.
 */
export function createInputControls(
  given: readonly InputMap[],
  storage?: InputControlsStorage,
): InputControls {
  const defaults = structuredClone(withDefaultInputMaps(given))
  let maps = restored(defaults, storage)
  let bindings = bindingsOf(maps)
  let revision = 0

  const persist = (): void => {
    try {
      storage?.write(maps)
    } catch {
      // Storage is optional; input must keep working when a browser refuses it.
    }
  }

  return {
    maps: () => maps,
    bindings: () => bindings,
    revision: () => revision,
    rebind: (context, action, index, binding) => {
      const changed = rebound(maps, context, action, index, binding)
      if (!changed) return false
      maps = changed
      bindings = bindingsOf(maps)
      revision += 1
      persist()
      return true
    },
    reset: (context, action) => {
      maps = resetMaps(maps, defaults, context, action)
      bindings = bindingsOf(maps)
      revision += 1
      persist()
    },
  }
}

function bindingsOf(maps: readonly InputMap[]): InputBindings {
  return Object.fromEntries(
    maps.map(map => [
      map.id,
      Object.fromEntries(map.actions.map(action => [action.id, action.bindings])),
    ]),
  )
}

function rebound(
  maps: readonly InputMap[],
  context: string,
  actionId: string,
  index: number,
  binding: unknown,
): readonly InputMap[] | null {
  if (!Number.isInteger(index) || index < 0) return null
  const mapIndex = maps.findIndex(map => map.id === context)
  const map = maps[mapIndex]
  if (!map) return null
  const actionIndex = map.actions.findIndex(action => action.id === actionId)
  const action = map.actions[actionIndex]
  if (!action || index > action.bindings.length) return null

  const parsed = inputBindingOrNull(binding)
  if (!parsed || !inputBindingFits(action.kind, parsed)) return null
  const bindings = [...action.bindings]
  bindings[index] = parsed
  const changed: InputMap = {
    ...map,
    actions: map.actions.map((one, at) => (at === actionIndex ? { ...one, bindings } : one)),
  }
  return maps.map((one, at) => (at === mapIndex ? changed : one))
}

function resetMaps(
  current: readonly InputMap[],
  defaults: readonly InputMap[],
  context?: string,
  action?: string,
): readonly InputMap[] {
  if (!context) return structuredClone(defaults)
  const original = defaults.find(map => map.id === context)
  if (!original) return [...current]
  return current.map(map => {
    if (map.id !== context) return map
    if (!action) return structuredClone(original)
    const originalAction = original.actions.find(one => one.id === action)
    if (!originalAction) return map
    return {
      ...map,
      actions: map.actions.map(one => (one.id === action ? structuredClone(originalAction) : one)),
    }
  })
}

function restored(
  defaults: readonly InputMap[],
  storage?: InputControlsStorage,
): readonly InputMap[] {
  if (!storage) return structuredClone(defaults)
  try {
    return restoredMaps(defaults, storage.read()) ?? structuredClone(defaults)
  } catch {
    return structuredClone(defaults)
  }
}

/**
 * 🛑 Matched by ID, action by action, never by POSITION. It used to answer null — dropping EVERY
 * rebinding of EVERY context — as soon as the project held one map or one action more than the
 * stored copy: a player's remapped hand brake was lost because the author added a `menu` map.
 * What no longer exists is ignored; what was never stored keeps its default.
 */
function restoredMaps(defaults: readonly InputMap[], value: unknown): readonly InputMap[] | null {
  if (!Array.isArray(value)) return null
  const stored = byId(value)
  return defaults.map(map => restoredMapOf(map, stored.get(map.id)))
}

function restoredMapOf(defaultMap: InputMap, value: unknown): InputMap {
  if (!isRecord(value) || !Array.isArray(value.actions)) return defaultMap
  const stored = byId(value.actions)
  return {
    ...defaultMap,
    actions: defaultMap.actions.map(action => restoredActionOf(action, stored.get(action.id))),
  }
}

function restoredActionOf(action: InputAction, value: unknown): InputAction {
  if (!isRecord(value) || !Array.isArray(value.bindings)) return action
  const kept = value.bindings
    .map(inputBindingOrNull)
    .filter(binding => binding !== null)
    .filter(binding => inputBindingFits(action.kind, binding))
  // Everything stored was rubbish: the defaults, rather than an action nothing reaches any more.
  // An EMPTY stored list is a choice, though — someone unbound it on purpose.
  return value.bindings.length > 0 && kept.length === 0 ? action : { ...action, bindings: kept }
}

function byId(values: readonly unknown[]): Map<string, unknown> {
  const found = new Map<string, unknown>()
  for (const value of values)
    if (isRecord(value) && typeof value.id === 'string') found.set(value.id, value)
  return found
}
