// SPDX-License-Identifier: MIT

import type { InputMap } from './inputMap'

export type InputContexts = {
  active: () => readonly string[]
  push: (id: string) => void
  pop: (id: string) => void
}

/**
 * 🛑 `report` is what an author's only feedback used to be: nothing. `push` of a context no file
 * declares is a no-op, and a script asking for `menu` on a project with no `menu.input.json` saw
 * no return value, no fault and no log line.
 */
export function createInputContexts(
  maps: readonly InputMap[],
  report?: (message: string) => void,
): InputContexts {
  const known = new Set(maps.map(map => map.id))
  const said = new Set<string>()
  // Replaced rather than edited, so `active()` hands the same array back until a push or a pop —
  // it is read once a STEP, and copying it there allocated sixty times a second for nothing.
  let active: readonly string[] = maps.filter(map => map.defaultActive).map(map => map.id)

  return {
    active: () => active,
    push: id => {
      if (!known.has(id)) {
        if (report && !said.has(id)) {
          said.add(id)
          report(
            `input context ${id} is not declared by any control map, so pushing it does nothing`,
          )
        }
        return
      }
      if (!active.includes(id)) active = [...active, id]
    },
    pop: id => {
      if (active.includes(id)) active = active.filter(one => one !== id)
    },
  }
}
