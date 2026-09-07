import { describe, expect, it } from 'vitest'
import {
  createMission,
  createMissionStep,
  addMissionStep,
  type MissionClock,
  transitionMission,
  transitionMissionStep,
  waitMission,
} from '@shared/domain/mission'
import { parseMission } from './validation'

const time: MissionClock = { now: () => '2026-09-04T10:00:00.000Z', newId: () => '1' }

describe('persisted mission validation', () => {
  it('rejects a mission whose action is not in the registry', () => {
    const mission = createMission('Unsafe', time)
    const step = createMissionStep(
      mission.id,
      'Unknown',
      { kind: 'action', call: { action: 'project.create', input: {} } },
      time,
    )
    const stored = addMissionStep(mission, step, time.now())
    const unknown = {
      ...stored,
      plan: { steps: [{ ...step, call: { action: 'unknown.run', input: {} } }] },
    }

    expect(parseMission(unknown)).toBeNull()
  })

  it('rejects a mission whose wait is detached from its step', () => {
    const mission = createMission('Detached', time)

    expect(
      parseMission({
        ...mission,
        state: 'waiting_user',
        waits: [{ kind: 'user', stepId: 'missing' }],
      }),
    ).toBeNull()
  })

  it('rejects a waiting step without its matching wait', () => {
    const mission = createMission('Missing wait', time)
    const step = createMissionStep(mission.id, 'Ask', { kind: 'user_input' }, time)
    const withStep = addMissionStep(mission, { ...step, state: 'waiting' }, time.now())

    expect(parseMission({ ...withStep, state: 'paused' })).toBeNull()
  })

  it('rejects a terminal mission that still contains active work', () => {
    const mission = createMission('Contradictory', time)
    const step = createMissionStep(mission.id, 'Still running', { kind: 'reason' }, time)
    const stored = addMissionStep(mission, step, time.now())

    expect(
      parseMission({
        ...stored,
        state: 'completed',
        finishedAt: time.now(),
        plan: { steps: [{ ...step, state: 'running', startedAt: time.now() }] },
      }),
    ).toBeNull()
  })

  it('rejects a mission state that contradicts its waits', () => {
    const mission = createMission('Contradictory wait', time)
    expect(parseMission({ ...mission, state: 'waiting_user' })).toBeNull()
    const step = createMissionStep(mission.id, 'Ask', { kind: 'user_input' }, time)
    let waiting = addMissionStep(mission, step, time.now())
    waiting = transitionMission(
      transitionMission(waiting, 'planning', time.now()),
      'ready',
      time.now(),
    )
    waiting = transitionMission(waiting, 'running', time.now())
    waiting = transitionMissionStep(waiting, step.id, 'ready', time.now())
    waiting = transitionMissionStep(waiting, step.id, 'running', time.now())
    waiting = waitMission(waiting, { kind: 'user', stepId: step.id }, time.now())

    expect(parseMission({ ...waiting, state: 'running' })).toBeNull()
  })
})
