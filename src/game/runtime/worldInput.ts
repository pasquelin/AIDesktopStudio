// SPDX-License-Identifier: MIT

import type { InputState } from '../ports/inputPort'
import { createInputActions, type InputActions, type InputActionsReport } from './inputActions'
import type { InputContexts } from './inputContexts'
import type { InputControls } from './inputControls'

export type WorldInput = {
  state: () => InputState
  take: (state: InputState) => void
  actions: InputActions
}

/**
 * 🛑 Resolved where the input is SET rather than inside `step`: a decor that hands the world a
 * reading straight — `characters.test.ts` does, `intents` being callable on its own — would
 * otherwise read the actions of an empty map.
 */
export function createWorldInput(
  controls: InputControls,
  contexts: InputContexts,
  initial: InputState,
  report?: InputActionsReport,
): WorldInput {
  const actions = createInputActions(report)
  let held = initial

  const take = (state: InputState): void => {
    held = state
    actions.sample(controls.maps(), contexts.active(), state)
  }

  // Sampled from the first reading too, or `actions` answers an empty map until the first step
  // while `state()` already names keys.
  take(initial)

  return { state: () => held, take, actions }
}
