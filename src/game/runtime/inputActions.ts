// SPDX-License-Identifier: MIT

import type { InputMap } from './inputMap'
import {
  orderedInputMaps,
  resolveInputMaps,
  resolveOrderedInputMaps,
  type InputActionValue,
  type RawInput,
  type ResolvedInput,
} from './inputMaps'

/** Where a silent collision goes. Absent, nothing is watched and nothing is said. */
export type InputActionsReport = (message: string) => void

/**
 * The step's actions, and the EDGE a resolved map cannot carry: `button` answers what is held,
 * so a jump bound to a gamepad button would fire on every step the button stayed down.
 */
export type InputActions = ResolvedInput & {
  pressed: (id: string) => boolean
  released: (id: string) => boolean
}

export type InputActionsReader = InputActions & {
  /** Reads the step's input. Called ONCE a step: it is what the edge is measured against. */
  sample: (maps: readonly InputMap[], active: readonly string[], input: RawInput) => void
}

const NOTHING: RawInput = { held: [] }

export function createInputActions(report?: InputActionsReport): InputActionsReader {
  let current = resolveInputMaps([], [], NOTHING)
  let previous = current
  let touched = current
  const selection = createInputSelection(report)

  return {
    sample: (maps, active, input) => {
      const ordered = selection(maps, active)
      previous = current
      current = resolveOrderedInputMaps(ordered, input)
      // 🛑 A key tapped BETWEEN two steps is gone from `held` at both of them: the port clears it
      // live. Resolved a second time over what the port SAW, so a 20 ms tap still jumps — and
      // only when there is something to see, a tap being rare.
      touched = input.pressed?.length
        ? resolveOrderedInputMaps(ordered, { ...input, held: [...input.held, ...input.pressed] })
        : current
    },
    button: id => current.button(id),
    pressed: id => (current.button(id) || touched.button(id)) && !previous.button(id),
    released: id => !current.button(id) && (previous.button(id) || touched.button(id)),
    axis: id => current.axis(id),
    axis2: id => current.axis2(id),
    get values(): Readonly<Record<string, InputActionValue>> {
      return current.values
    },
  }
}

/**
 * 🛑 The selection held between steps: redoing it cost 0,139 µs of the 1,311 µs a step spent,
 * measured best-of-5 over 300 000 calls. Rests on `InputControls.maps()` and `InputContexts
 * .active()` being IMMUTABLE — both REPLACE their array, so a caller that edited one in place
 * would be served the previous order and nothing would say so.
 */
function createInputSelection(report?: InputActionsReport) {
  let lastMaps: readonly InputMap[] | null = null
  let lastActive: readonly string[] = []
  let ordered: readonly InputMap[] = []
  const said = new Set<string>()

  return (maps: readonly InputMap[], active: readonly string[]): readonly InputMap[] => {
    if (maps === lastMaps && sameIds(active, lastActive)) return ordered
    lastMaps = maps
    lastActive = [...active]
    ordered = orderedInputMaps(maps, active)
    if (report) reportOverwrites(ordered, said, report)
    return ordered
  }
}

const sameIds = (one: readonly string[], other: readonly string[]): boolean =>
  one.length === other.length && one.every((id, at) => id === other[at])

/**
 * 🛑 Said ONCE per action, and only when the selection changes: a context of higher priority
 * rewrites what a lower one declared, and nothing anywhere used to mention it — a project naming
 * `throttle` in its own `character` map read zero for ever, in silence.
 */
function reportOverwrites(
  ordered: readonly InputMap[],
  said: Set<string>,
  report: InputActionsReport,
): void {
  const owner = new Map<string, string>()
  for (const map of ordered) {
    for (const action of map.actions) {
      const before = owner.get(action.id)
      if (before !== undefined && !said.has(action.id)) {
        said.add(action.id)
        report(`action ${action.id} of context ${before} is overwritten by context ${map.id}`)
      }
      owner.set(action.id, map.id)
    }
  }
}
