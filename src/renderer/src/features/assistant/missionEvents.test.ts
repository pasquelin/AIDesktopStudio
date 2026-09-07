import { describe, expect, it } from 'vitest'
import type { Mission, MissionStep } from '@shared/domain/mission'
import { studioEventsForMission } from '@shared/domain/studioEvent'

const step = (kind: MissionStep['kind'], id: string): MissionStep => {
  const state: MissionStep['state'] = 'running'
  const common = {
    id,
    missionId: 'mission_1',
    title: id,
    state,
    dependsOn: [],
    createdAt: '2026-09-04T10:00:00.000Z',
  }
  if (kind === 'action') return { ...common, kind, call: { action: 'project.create', input: {} } }
  if (kind === 'job') return { ...common, kind, jobId: 'job_1' }
  if (kind === 'sub_mission') return { ...common, kind, childMissionId: 'mission_2' }
  return { ...common, kind }
}

const mission: Mission = {
  id: 'mission_1',
  revision: 4,
  childIds: ['mission_2'],
  goal: 'Build a boat',
  state: 'waiting_job',
  createdAt: '2026-09-04T10:00:00.000Z',
  updatedAt: '2026-09-04T10:01:00.000Z',
  resourceRefs: [],
  plan: {
    steps: [
      step('reason', 'reason'),
      step('action', 'action'),
      step('job', 'job'),
      step('user_input', 'user'),
      step('verify', 'verify'),
      step('sub_mission', 'child'),
    ],
  },
  waits: [{ kind: 'job', stepId: 'job', jobId: 'job_1' }],
  revisionSnapshots: [],
}

describe('mission event projection', () => {
  it('projects mission, planning, actions, jobs, waits, verification and child work', () => {
    const events = studioEventsForMission(mission, null, {
      now: () => mission.updatedAt,
      newId: () => '1',
    })

    expect(events[0]).toMatchObject({ type: 'mission.waiting_job', state: 'waiting' })
    expect(events.map(event => event.type)).toEqual([
      'mission.waiting_job',
      'mission.step.reason',
      'mission.step.action',
      'mission.step.job',
      'mission.step.user_input',
      'mission.step.verify',
      'mission.step.sub_mission',
    ])
    expect(events.map(event => event.category)).toContain('generation')
    expect(events.map(event => event.category)).toContain('action')
  })

  it('keeps simultaneous missions separated by identity', () => {
    const events = [mission, { ...mission, id: 'mission_other', plan: { steps: [] } }].flatMap(
      item =>
        studioEventsForMission(item, null, {
          now: () => item.updatedAt,
          newId: () => item.id,
        }),
    )
    expect(new Set(events.map(event => event.missionId))).toEqual(
      new Set(['mission_1', 'mission_other']),
    )
  })
})
