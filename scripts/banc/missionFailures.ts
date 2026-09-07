import type { ActionName } from '@shared/domain/assistant'
import type { MissionState } from '@shared/domain/mission'
import { callKey } from '@main/mission/runtimeGuards'
import type { Called } from './run'

/**
 * Why one failed run failed, read off what the runtime recorded — never off the model's words.
 * One class per run, the first that applies, from the cheapest to tell apart to the vaguest.
 */
export type MissionFailureClass =
  | 'runtime-failed'
  | 'question-asked'
  | 'no-call'
  | 'expected-outside-candidates'
  | 'expected-not-called'
  | 'refused'
  | 'duplicate-call'
  | 'oracle'

export type MissionFailureEvidence = {
  /** What `expectedMissionActions` says the scenario exercises of the MODEL. */
  expected: readonly ActionName[]
  /** Every candidate any reflection of the run showed the model. */
  candidates: ReadonlySet<ActionName>
  called: readonly Called[]
  missionStates: readonly MissionState[]
}

export function missionFailureClassOf(evidence: MissionFailureEvidence): MissionFailureClass {
  if (evidence.missionStates.includes('failed')) return 'runtime-failed'
  if (evidence.missionStates.includes('waiting_user')) return 'question-asked'
  if (evidence.called.length === 0) return 'no-call'
  const called = new Set(evidence.called.map(call => call.action))
  const uncalled = evidence.expected.filter(action => !called.has(action))
  if (uncalled.some(action => !evidence.candidates.has(action))) {
    return 'expected-outside-candidates'
  }
  if (uncalled.length > 0) return 'expected-not-called'
  if (evidence.called.some(call => call.answer?.startsWith('refused'))) return 'refused'
  const keys = evidence.called.map(callKey)
  if (new Set(keys).size < keys.length) return 'duplicate-call'
  return 'oracle'
}
