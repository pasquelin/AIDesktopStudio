import {
  assistantAction,
  refused,
  type ActionName,
  type ActionOutcome,
} from '@shared/domain/assistant'
import { isRecord } from '@shared/guards'
import type { BatchCall } from '@shared/domain/gameActions'

/** What a lot holds, read ONCE — or the refusal that says why it holds nothing runnable. */
export type BatchRead = { refusal: ActionOutcome } | { calls: readonly BatchedCall[] }

/** One call of a lot, its name already held against the registry. */
export type BatchedCall = { action: ActionName; input: Record<string, unknown> }

/**
 * 🛑 Every entry checked, and a malformed one REFUSES rather than being dropped.
 *
 * Filtering them out answered `ok` on a lot of five where four had vanished — a model told
 * everything went well, having asked for five things and got one.
 */
export function readBatch(input: Record<string, unknown>): BatchRead {
  const said = input.calls
  if (typeof said !== 'string') return { refusal: refused('badInput', 'calls must be JSON text') }

  const parsed = parsedCalls(said)
  if ('refusal' in parsed) return parsed
  if (parsed.calls.length === 0) {
    return { refusal: refused('badInput', 'calls must be a non-empty array of {action,input}') }
  }
  if (parsed.calls.length > MOST_CALLS) {
    return { refusal: refused('badInput', `a lot holds at most ${MOST_CALLS} calls`) }
  }

  return checkedCalls(parsed.calls)
}

function parsedCalls(said: string): { calls: unknown[] } | { refusal: ActionOutcome } {
  try {
    const parsed: unknown = JSON.parse(said)
    return Array.isArray(parsed)
      ? { calls: parsed }
      : { refusal: refused('badInput', 'calls must be a non-empty array of {action,input}') }
  } catch {
    return { refusal: refused('badInput', 'calls is not JSON') }
  }
}

function checkedCalls(parsed: unknown[]): BatchRead {
  const calls: BatchedCall[] = []
  for (const [at, one] of parsed.entries()) {
    if (!isBatchCall(one)) {
      return { refusal: refused('badInput', `call ${at + 1} is not {action,input}`) }
    }
    if (!assistantAction(one.action)) {
      return { refusal: refused('badInput', `call ${at + 1}: no action "${one.action}"`) }
    }
    if (one.action === 'studio.batch') {
      return { refusal: refused('badInput', `call ${at + 1}: a lot may not hold a lot`) }
    }
    calls.push({ action: one.action as ActionName, input: one.input })
  }
  return { calls }
}

/**
 * 🛑 What one call may hold. The thread runs them one after another with nothing to report its
 * progress and nothing to cancel it — invariant 6 — so a thousand would freeze the window.
 */
export const MOST_CALLS = 50

const isBatchCall = (value: unknown): value is BatchCall =>
  isRecord(value) && typeof value.action === 'string' && isRecord(value.input)
