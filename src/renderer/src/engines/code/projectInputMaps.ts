// SPDX-License-Identifier: MIT
import type { InputMapModule } from '@shared/domain/inputMap'
import { getBridge } from '@/services/bridge'
import { projectModulesOf } from './projectModules'

export async function projectInputMaps(): Promise<InputMapModule[]> {
  const read = await projectModulesOf(getBridge()?.inputMaps)

  return read.map(held => ({ path: held.path, map: held.value }))
}

/**
 * The maps a game is handed, with any id already taken left out — the FIRST file wins. A duplicate
 * used to reach `createInputContexts`, which pushed the id twice and let the last one silently
 * decide every action; `inputMapIdConflict` names the file that was dropped.
 */
export function withoutDuplicateInputMapIds(
  maps: readonly InputMapModule[],
): readonly InputMapModule[] {
  const ids = new Set<string>()
  return maps.filter(one => {
    if (ids.has(one.map.id)) return false
    ids.add(one.map.id)
    return true
  })
}

const listeners = new Set<() => void>()

/**
 * Told when a control map is WRITTEN. The bridge has list, read and write and no event, so a
 * surface holding a resolved map — the studio's own focus navigation — would read the version
 * from before the rebind until the project was closed and opened again.
 */
export function onInputMapsChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function inputMapsChanged(): void {
  for (const listener of listeners) listener()
}

/**
 * 🛑 The main says it, so EVERY window hears: the bell above is a module of one renderer, and a
 * map written from the assistant, from « new control map », or from another window left the
 * others reading the version from before it. Rung for `.anim.json` too, which costs a reread
 * nobody notices and keeps this to one subscription.
 */
export function watchWrittenInputMaps(): () => void {
  return getBridge()?.inputMaps.onWritten(() => inputMapsChanged()) ?? (() => {})
}

/** Whether `id` is carried by more than one file — asked of ONE id, where the next finds any. */
export function isDuplicateInputMapId(maps: readonly InputMapModule[], id: string): boolean {
  return maps.filter(one => one.map.id === id).length > 1
}

export function inputMapIdConflict(maps: readonly InputMapModule[]): InputMapModule | null {
  const ids = new Set<string>()
  for (const map of maps) {
    if (ids.has(map.map.id)) return map
    ids.add(map.map.id)
  }
  return null
}
