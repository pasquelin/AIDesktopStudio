import { randomUUID } from 'node:crypto'
import {
  assistantAction,
  commitmentOfCall,
  needsConfirmation,
  type ActionOutcome,
  type AssistantCall,
} from '@shared/domain/assistant'
import type { AssistantActionRequest, AssistantActionResult } from '@shared/ipc'

/**
 * Asking the window in front to run an action, and waiting for what it made of it.
 *
 * The studio has no round trip in this direction: `invoke` goes renderer to main, `broadcast`
 * goes back with no reply. So one is composed here out of the two, with a `callId` tying the
 * halves together — and every way it can fail answers something rather than hanging, because on
 * the other end of the wait there is an MCP client that would otherwise sit there.
 */

/**
 * How long a question may stand on screen.
 *
 * Two minutes, which is a person reading "this will spend 12 units" and deciding — not a
 * network timeout. Shorter would cancel a considered no; longer would leave a client believing
 * something is still happening long after the user walked away.
 */
const ANSWER_TIMEOUT_MS = 120_000

/**
 * And how long one that asks NOBODY waits.
 *
 * Derived rather than passed in: whether a call raises a question is already a fact of what it
 * engages. `studio.state` sits in front of every sentence typed at the assistant, and inherited
 * the two minutes a person is given to read — but so did every `documents.list` an MCP client
 * makes against a window that happens to be reloading.
 */
const READ_TIMEOUT_MS = 2_000

/**
 * 🛑 Whether an answer may be a long time coming, which `commitment` alone does not say: a lot
 * engages nothing of its own and runs up to fifty calls that each may engage, price and ask.
 */
const mayOutlastARead = (call: AssistantCall): boolean => {
  const action = assistantAction(call.action)

  return (
    needsConfirmation(commitmentOfCall(call.action, call.input)) ||
    action?.asksItself === true ||
    action?.runsOthers === true
  )
}

export type RemoteActionDeps = {
  /** Sends to the window in front, answering `false` when there is none — see `sendToFront`. */
  send: (request: AssistantActionRequest) => boolean
  newCallId?: () => string
  timeoutMs?: number
  findActions?: (query: string) => Promise<ActionOutcome>
}

export type RemoteActions = {
  run: (call: AssistantCall, signal?: AbortSignal) => Promise<ActionOutcome>
  /** The window's answer, quoting the id it was asked under. Unknown ids are dropped. */
  settle: (result: AssistantActionResult) => void
}

export function createRemoteActions({
  send,
  newCallId = randomUUID,
  timeoutMs = ANSWER_TIMEOUT_MS,
  findActions,
}: RemoteActionDeps): RemoteActions {
  const waiting = new Map<string, (outcome: ActionOutcome) => void>()

  return {
    run: async (call, signal) => {
      if (call.action === 'actions.find' && findActions) {
        const query = call.input['query']
        return typeof query === 'string'
          ? await findActions(query)
          : { ok: false, refusal: 'badInput' }
      }
      return await new Promise<ActionOutcome>(resolve => {
        const callId = newCallId()
        if (signal?.aborted) {
          resolve({ ok: false, refusal: 'timedOut' })
          return
        }

        // Refused rather than queued: an application with no window in front has nowhere to
        // show the question that a costly action would need, and a call held until one appears
        // would spend on a screen the person is no longer looking at.
        if (!send({ callId, call })) {
          resolve({ ok: false, refusal: 'noWindow' })
          return
        }

        const timer = setTimeout(
          () => {
            // Dropped from the map first, so an answer that arrives late finds nothing to resolve
            // rather than resolving a promise its caller already gave up on.
            waiting.delete(callId)
            signal?.removeEventListener('abort', abort)
            resolve({ ok: false, refusal: 'timedOut' })
            // Capped rather than replaced, so a decor that shortens the wait shortens both.
          },
          mayOutlastARead(call) ? timeoutMs : Math.min(timeoutMs, READ_TIMEOUT_MS),
        )

        // The wait must not be a reason the application stays alive at quit.
        timer.unref()

        const abort = (): void => {
          clearTimeout(timer)
          waiting.delete(callId)
          resolve({ ok: false, refusal: 'timedOut' })
        }
        signal?.addEventListener('abort', abort, { once: true })

        waiting.set(callId, outcome => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          resolve(outcome)
        })
      })
    },

    settle: ({ callId, outcome }) => {
      const answer = waiting.get(callId)
      // Silently, and on purpose: an id nobody is waiting on is a call that already timed out,
      // or a window answering twice. Neither is worth a failure on this side.
      if (!answer) return

      waiting.delete(callId)
      answer(outcome)
    },
  }
}
