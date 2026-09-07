import {
  actionReads,
  assistantAction,
  type AssistantAnswer,
  type AssistantCall,
} from '@shared/domain/assistant'
import { completedRoundsBefore, type Mission, type MissionStep } from '@shared/domain/mission'
import { isRecord } from '@shared/guards'
import type { MissionStepOutcome } from './scheduler'

// Failed rather than planned as zero steps, which closed the mission « completed » with nothing done.
export const unreadableOutcome: MissionStepOutcome = {
  kind: 'failed',
  error: 'the model answered nothing readable',
}

export const repeatingOutcome: MissionStepOutcome = {
  kind: 'failed',
  error: 'the model repeats the reads or refused calls of its previous round',
}

export const callKey = (call: AssistantCall): string =>
  `${call.action}:${JSON.stringify(call.input)}`

const isRefusedResult = (result: unknown): boolean => isRecord(result) && result.ok === false

const readsBy = (name: string): boolean => {
  const action = assistantAction(name)
  return action !== null && actionReads(action)
}

const idle = (step: MissionStep): boolean =>
  step.kind !== 'action' || readsBy(step.call.action) || isRefusedResult(step.result)

/** Empty for a round that mutated: a read after it checks, and is never a repeat. */
const idleKeys = (round: readonly MissionStep[]): ReadonlySet<string> =>
  round.every(idle)
    ? new Set(round.flatMap(one => (one.kind === 'action' ? [callKey(one.call)] : [])))
    : new Set()

/**
 * 🛑 The same reads, or the same refused calls, as the TWO rounds before and nothing else: 2.5
 * ran `files.search` fifteen rounds in a row, 6.10 sent one refused fold eighteen times
 * (2026-09-06). One repeat is let through — DeepSeek reads twice before it acts, and 9.4 died
 * on that — two are a loop. A mutation that went through is not counted: a read after it checks.
 */
export function repeatsLastRound(
  mission: Mission,
  step: MissionStep,
  answer: AssistantAnswer,
): boolean {
  if (answer.calls.length === 0) return false
  const [last, before] = completedRoundsBefore(mission, step.id)
  if (!last || !before) return false
  const keys = answer.calls.map(callKey)
  const repeats = (round: readonly MissionStep[]): boolean => {
    const idleCalls = idleKeys(round)
    return idleCalls.size > 0 && keys.every(key => idleCalls.has(key))
  }
  return repeats(last) && repeats(before)
}
