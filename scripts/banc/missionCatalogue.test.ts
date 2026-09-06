import { describe, expect, it } from 'vitest'
import { ACTION_FAMILIES } from '@shared/domain/assistant'
import { SCENARIOS } from './scenarios'
import {
  BASELINE_MISSION_SCENARIOS,
  expectedMissionActions,
  missionFamilyCoverage,
  missionScenarios,
  scenarioFamilies,
} from './missionCatalogue'

describe('mission runtime bench catalogue', () => {
  it('audits the complete historical catalogue', () => {
    expect(SCENARIOS).toHaveLength(470)
  })

  it('keeps the Phase 10.3 baseline unchanged', () => {
    expect(missionScenarios(SCENARIOS, 'baseline').map(scenario => scenario.name)).toEqual(
      SCENARIOS.filter(scenario => BASELINE_MISSION_SCENARIOS.has(scenario.name)).map(
        scenario => scenario.name,
      ),
    )
  })

  it('selects targeted ranks without maintaining another scenario list', () => {
    expect(missionScenarios(SCENARIOS, 'all', '1.3, 61.1').map(scenario => scenario.name)).toEqual([
      '1.3 counts the assets of each kind',
      '61.1 starts the game',
    ])
  })

  it('builds progressive sets from every represented action family', () => {
    const represented = ACTION_FAMILIES.filter(family =>
      SCENARIOS.some(scenario => scenarioFamilies(scenario).includes(family.name)),
    ).map(family => family.name)
    const representative = missionScenarios(SCENARIOS, 'representative')
    const expanded = missionScenarios(SCENARIOS, 'expanded')

    expect(representative.flatMap(scenarioFamilies)).toEqual(expect.arrayContaining(represented))
    expect(expanded.length).toBeGreaterThan(representative.length)
    expect(missionScenarios(SCENARIOS, 'all')).toHaveLength(SCENARIOS.length)
  })

  it('derives the coverage matrix from the registry and historical coverage', () => {
    const matrix = missionFamilyCoverage(SCENARIOS)

    expect(matrix.map(entry => entry.family)).toEqual(ACTION_FAMILIES.map(family => family.name))
    expect(matrix.every(entry => entry.ready === entry.scenarios && entry.missing === 0)).toBe(true)
  })
})

describe('what a mission expects of the model', () => {
  it('leaves out the job wait the runtime performs itself', () => {
    const generates = SCENARIOS.find(scenario => scenario.name.startsWith('20.1 '))
    if (!generates) throw new Error('20.1 is missing')

    expect(expectedMissionActions(generates)).toContain('generator.submit')
    expect(expectedMissionActions(generates)).not.toContain('job.waitForCloudGeneration')
  })
})
