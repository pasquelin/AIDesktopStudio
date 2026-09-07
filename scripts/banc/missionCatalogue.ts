import { ACTION_FAMILIES, type ActionName } from '@shared/domain/assistant'
import { COVERAGE } from './coverage'
import type { Scenario } from './run'

export type MissionBenchSet = 'baseline' | 'representative' | 'expanded' | 'all'

export const BASELINE_MISSION_SCENARIOS = new Set([
  '1.1 names the open project and the open documents',
  '6.1 adds a cube at the centre',
  '6.2 renames the cube Cube Test',
  '12.2 turns its first material red',
  '20.1 generates a photoreal red car in a Paris street',
  '22.1 generates a 3D model of a wooden chest',
  '41.6 makes a project called Démo Assistant',
  '57.4 remembers the project aims at photoreal marine work',
  '58.7 puts the project under version control',
])

const rankOf = (scenario: Scenario): string => scenario.name.split(' ')[0] ?? ''

const actionsByRank = (): ReadonlyMap<string, readonly ActionName[]> => {
  const actions = new Map<string, ActionName[]>()
  for (const family of ACTION_FAMILIES) {
    for (const action of family.actions) {
      for (const rank of COVERAGE[action.name])
        actions.set(rank, [...(actions.get(rank) ?? []), action.name])
    }
  }
  return actions
}

/**
 * 🛑 What `coverage.ts` expects of the LEGACY chain and the runtime does by itself: a `jobId`
 * answered by an action becomes a `job` step, so the wait is never a call the model makes.
 */
const RUNTIME_HANDLED: ReadonlySet<ActionName> = new Set(['job.waitForCloudGeneration'])

export function expectedMissionActions(scenario: Scenario): readonly ActionName[] {
  return (actionsByRank().get(rankOf(scenario)) ?? []).filter(
    action => !RUNTIME_HANDLED.has(action),
  )
}

export function scenarioFamilies(scenario: Scenario): readonly string[] {
  const familyByAction = new Map(
    ACTION_FAMILIES.flatMap(family => family.actions.map(action => [action.name, family.name])),
  )
  return [
    ...new Set(
      expectedMissionActions(scenario).flatMap(action => familyByAction.get(action) ?? []),
    ),
  ]
}

function balancedScenarios(scenarios: readonly Scenario[], perFamily: number): readonly Scenario[] {
  const selected = new Set<Scenario>()
  for (const family of ACTION_FAMILIES) {
    const candidates = scenarios.filter(scenario =>
      scenarioFamilies(scenario).includes(family.name),
    )
    for (const scenario of candidates.slice(0, perFamily)) selected.add(scenario)
  }
  return scenarios.filter(scenario => selected.has(scenario))
}

export function missionScenarios(
  scenarios: readonly Scenario[],
  set: MissionBenchSet,
  ranks = '',
): readonly Scenario[] {
  const requestedRanks = new Set(
    ranks
      .split(',')
      .map(rank => rank.trim())
      .filter(Boolean),
  )
  if (requestedRanks.size > 0)
    return scenarios.filter(scenario => requestedRanks.has(rankOf(scenario)))
  if (set === 'all') return scenarios
  if (set === 'baseline')
    return scenarios.filter(scenario => BASELINE_MISSION_SCENARIOS.has(scenario.name))
  return balancedScenarios(scenarios, set === 'representative' ? 1 : 4)
}

export type MissionFamilyCoverage = {
  family: string
  scenarios: number
  actions: number
  ready: number
  missing: number
}

export function missionFamilyCoverage(
  scenarios: readonly Scenario[],
): readonly MissionFamilyCoverage[] {
  return ACTION_FAMILIES.map(family => {
    const covered = scenarios.filter(scenario => scenarioFamilies(scenario).includes(family.name))
    return {
      family: family.name,
      scenarios: covered.length,
      actions: family.actions.filter(action => COVERAGE[action.name].length > 0).length,
      ready: covered.length,
      missing: 0,
    }
  })
}
