import { completedRoundsBefore, type Mission, type MissionStep } from '@shared/domain/mission'
import type { ContextBudgetReport } from './context'
import { CONTEXT_BUDGETS, markContentTruncated, textWithin } from './contextBudget'
import { compactContextValue, serializedContextLength } from './contextCompaction'

type ResultsRequest = { mission: Mission; step: MissionStep }

const RESULT_ROOM = 600

/**
 * 🛑 WITH the call, newest first, and the round that just ran gets the room: without the query
 * 2.5 searched the same words fifteen rounds in a row, and cut to 600 characters a `scene.state`
 * lost the transform it was read for, so the model read again and the repeat guard killed it.
 */
export function previousResults(input: ResultsRequest, report: ContextBudgetReport) {
  const latest = new Set(
    completedRoundsBefore(input.mission, input.step.id)[0]?.map(step => step.id),
  )
  // Shared between the entries of that round: one at 5 400 pushed the second past the budget,
  // where `withinBudget` drops an entry whole rather than cutting it.
  let latestLeft = latest.size
  let remaining = CONTEXT_BUDGETS.results.maxCharacters
  return input.mission.plan.steps
    .filter(
      step =>
        step.state === 'completed' &&
        step.id !== input.step.id &&
        step.kind !== 'reason' &&
        step.kind !== 'verify' &&
        (step.kind === 'action' || step.result !== undefined),
    )
    .reverse()
    .map(step => {
      const room = latest.has(step.id)
        ? Math.max(RESULT_ROOM, Math.floor(remaining / latestLeft--) - 2 * RESULT_ROOM)
        : RESULT_ROOM
      const result = compactContextValue(step.result, room)
      if (result.truncated || step.title.length > 160) markContentTruncated(report, 'results')
      const entry = {
        stepId: step.id,
        title: textWithin(step.title, 160),
        ...(step.kind === 'action' ? { call: step.call } : {}),
        result: result.value,
      }
      remaining -= serializedContextLength(entry)
      return entry
    })
    .sort(
      (left, right) =>
        Number(input.step.dependsOn.includes(right.stepId)) -
        Number(input.step.dependsOn.includes(left.stepId)),
    )
}
