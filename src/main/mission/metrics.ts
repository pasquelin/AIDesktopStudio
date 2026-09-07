import type { AssistantContext } from './context'

export type MissionRuntimeMetrics = {
  contextChars: number
  contextSources: number
  actionCandidates: number
  actionsSentToLlm: number
  memoryCandidates: number
  memoriesSentToLlm: number
  visualContextBytes: number
  missionSteps: number
  llmCalls: number
  planningCalls: number
  replans: number
  revisionConflicts: number
  userWaits: number
  jobWaits: number
  maximumConcurrentMissions: number
  actionIndexSearches: number
}

export type MissionMetrics = {
  context: (context: AssistantContext, serializedCharacters: number) => void
  llmCall: (planning: boolean) => void
  plannedSteps: (count: number) => void
  replan: () => void
  revisionConflict: () => void
  wait: (kind: 'user' | 'job') => void
  concurrency: (missions: number) => void
  read: () => MissionRuntimeMetrics
}

const emptyMetrics = (): MissionRuntimeMetrics => ({
  contextChars: 0,
  contextSources: 0,
  actionCandidates: 0,
  actionsSentToLlm: 0,
  memoryCandidates: 0,
  memoriesSentToLlm: 0,
  visualContextBytes: 0,
  missionSteps: 0,
  llmCalls: 0,
  planningCalls: 0,
  replans: 0,
  revisionConflicts: 0,
  userWaits: 0,
  jobWaits: 0,
  maximumConcurrentMissions: 0,
  actionIndexSearches: 0,
})

export function createMissionMetrics(): MissionMetrics {
  const metrics = emptyMetrics()
  return {
    context: (context, serializedCharacters) => {
      metrics.contextChars += serializedCharacters
      metrics.actionIndexSearches += 1
      metrics.contextSources += Object.values(context.budget).filter(
        source => source.selected > 0,
      ).length
      metrics.actionCandidates += context.budget.actions.considered
      metrics.actionsSentToLlm += context.actions.length
      metrics.memoryCandidates += context.budget.memories.considered
      metrics.memoriesSentToLlm += context.memories.length
      metrics.visualContextBytes +=
        context.visual?.reduce((total, visual) => total + visual.bytes.byteLength, 0) ?? 0
    },
    llmCall: planning => {
      metrics.llmCalls += 1
      if (planning) metrics.planningCalls += 1
    },
    plannedSteps: count => {
      metrics.missionSteps += count
    },
    replan: () => {
      metrics.replans += 1
    },
    revisionConflict: () => {
      metrics.revisionConflicts += 1
    },
    wait: kind => {
      if (kind === 'user') metrics.userWaits += 1
      else metrics.jobWaits += 1
    },
    concurrency: missions => {
      metrics.maximumConcurrentMissions = Math.max(metrics.maximumConcurrentMissions, missions)
    },
    read: () => ({ ...metrics }),
  }
}
