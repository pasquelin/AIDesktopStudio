import { describe, expect, it, vi } from 'vitest'
import {
  addMissionStep,
  createMission,
  createMissionStep,
  type Mission,
  type MissionClock,
  type MissionStep,
} from '@shared/domain/mission'
import { createStudioEventBus } from './eventBus'
import { createMissionManager, type MissionManager } from './manager'
import { createMissionScheduler, readyMissionSteps, type MissionStepOutcome } from './scheduler'
import { createMissionStore } from './store'
import type { MissionJournal } from './journal'

function clock(): MissionClock {
  let id = 0
  return { now: () => '2026-09-04T10:00:00.000Z', newId: () => String(++id) }
}

function manager(time: MissionClock, initial: readonly Mission[] = []): MissionManager {
  const journal: MissionJournal = { read: async () => initial, append: vi.fn(), flush: vi.fn() }
  return createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
}

function withAction(
  mission: Mission,
  time: MissionClock,
  label: string,
  dependsOn: readonly string[] = [],
) {
  return addMissionStep(
    mission,
    createMissionStep(
      mission.id,
      label,
      { kind: 'action', call: { action: 'project.create', input: {} } },
      time,
      dependsOn,
    ),
    time.now(),
  )
}

describe('mission scheduler', () => {
  it('makes only dependency-free pending steps ready', () => {
    const time = clock()
    let mission = withAction(createMission('Ordered', time), time, 'First')
    mission = withAction(mission, time, 'Second', [mission.plan.steps[0]?.id ?? 'missing'])

    expect(readyMissionSteps(mission).map(step => step.title)).toEqual(['First'])
  })

  it('runs a mission in dependency order until completion', async () => {
    const time = clock()
    let mission = withAction(createMission('Ordered', time), time, 'First')
    mission = withAction(mission, time, 'Second', [mission.plan.steps[0]?.id ?? 'missing'])
    const missions = manager(time, [mission])
    const labels: string[] = []
    const scheduler = createMissionScheduler(
      missions,
      async step => {
        labels.push(step.title)
        return { kind: 'completed' }
      },
      time,
    )

    await scheduler.wake(mission.id)

    expect(labels).toEqual(['First', 'Second'])
    expect(await missions.read(mission.id)).toMatchObject({ state: 'completed' })
  })

  it('retains no run queues after many missions have finished', async () => {
    const time = clock()
    const batch = Array.from({ length: 128 }, (_, index) =>
      withAction(createMission(`Mission ${index}`, time), time, 'Act'),
    )
    const missions = manager(time, batch)
    const scheduler = createMissionScheduler(missions, async () => ({ kind: 'completed' }), time)

    await Promise.all(batch.map(async mission => await scheduler.wake(mission.id)))

    expect(scheduler.retainedRuns()).toBe(0)
  })

  it('waits for user input and resumes the same step', async () => {
    const time = clock()
    const missions = manager(time)
    const created = await missions.create('Question', {})
    const step = createMissionStep(created.id, 'Ask', { kind: 'user_input' }, time)
    await missions.update(created.id, created.revision, current =>
      addMissionStep(current, step, time.now()),
    )
    let answer: MissionStepOutcome = { kind: 'waiting', wait: { kind: 'user', stepId: step.id } }
    const scheduler = createMissionScheduler(missions, async () => answer, time)

    await scheduler.wake(created.id)
    expect(await missions.read(created.id)).toMatchObject({ state: 'waiting_user' })
    expect(scheduler.retainedRuns()).toBe(0)
    answer = { kind: 'completed' }
    await scheduler.resume(created.id, step.id)

    expect(await missions.read(created.id)).toMatchObject({ state: 'completed', waits: [] })
    expect(scheduler.retainedRuns()).toBe(0)
  })

  it('reports a document changed while a step waited and refreshes its precondition', async () => {
    const time = clock()
    const missions = manager(time)
    const created = await missions.create('Wait for a render', {})
    const step = createMissionStep(created.id, 'Render', { kind: 'job', jobId: 'job-1' }, time)
    await missions.update(created.id, created.revision, current => ({
      ...addMissionStep(current, step, time.now()),
      resourceRefs: [{ kind: 'document', id: 'scene-a' }],
    }))
    let revision = 4
    const checks: number[] = []
    const scheduler = createMissionScheduler(
      missions,
      async (current, _signal, check) => {
        checks.push(check.changed[0]?.revision ?? 0)
        return checks.length === 1
          ? { kind: 'waiting', wait: { kind: 'job', stepId: current.id, jobId: 'job-1' } }
          : { kind: 'completed' }
      },
      time,
      2,
      {
        read: async mission => ({
          current: mission.resourceRefs.map(resource => ({
            resource,
            incarnation: 'window-a',
            revision,
          })),
          unavailable: [],
        }),
      },
    )

    await scheduler.wake(created.id)
    revision = 7
    await scheduler.resumeJob(created.id, 'job-1')

    expect(checks).toEqual([0, 7])
    expect(await missions.read(created.id)).toMatchObject({
      state: 'completed',
      revisionSnapshots: [{ revision: 7 }],
    })
  })

  it('does not classify a preceding mission step own mutation as concurrent', async () => {
    const time = clock()
    let mission = withAction(createMission('Two edits', time), time, 'First')
    mission = withAction(mission, time, 'Second', [mission.plan.steps[0]?.id ?? 'missing'])
    mission = { ...mission, resourceRefs: [{ kind: 'document', id: 'scene-a' }] }
    const missions = manager(time, [mission])
    let revision = 1
    const decisions: string[] = []
    const scheduler = createMissionScheduler(
      missions,
      async (_step, _signal, check) => {
        decisions.push(check.decision)
        revision += 1
        return { kind: 'completed' }
      },
      time,
      2,
      {
        read: async current => ({
          current: current.resourceRefs.map(resource => ({
            resource,
            incarnation: 'window-a',
            revision,
          })),
          unavailable: [],
        }),
      },
    )

    await scheduler.wake(mission.id)

    expect(decisions).toEqual(['continue', 'continue'])
  })

  it('continues with an unknown revision check when the reader is unavailable', async () => {
    const time = clock()
    const mission = withAction(createMission('Read failure', time), time, 'Act')
    const missions = manager(time, [mission])
    const decisions: string[] = []
    const scheduler = createMissionScheduler(
      missions,
      async (_step, _signal, check) => {
        decisions.push(check.decision)
        return { kind: 'completed' }
      },
      time,
      2,
      {
        read: async () => {
          throw new Error('window gone')
        },
      },
    )

    await scheduler.wake(mission.id)

    expect(decisions).toEqual(['unknown'])
    expect(await missions.read(mission.id)).toMatchObject({ state: 'completed' })
  })

  it('reconsiders a resumed step when its previously observed document disappeared', async () => {
    const time = clock()
    const missions = manager(time)
    const created = await missions.create('Wait on a document', {})
    const step = createMissionStep(created.id, 'Wait', { kind: 'job', jobId: 'job-1' }, time)
    await missions.update(created.id, created.revision, current => ({
      ...addMissionStep(current, step, time.now()),
      resourceRefs: [{ kind: 'document', id: 'scene-a' }],
    }))
    let present = true
    const decisions: string[] = []
    const scheduler = createMissionScheduler(
      missions,
      async (current, _signal, check) => {
        decisions.push(check.decision)
        return decisions.length === 1
          ? { kind: 'waiting', wait: { kind: 'job', stepId: current.id, jobId: 'job-1' } }
          : { kind: 'completed' }
      },
      time,
      2,
      {
        read: async mission => {
          const previous = mission.revisionSnapshots
          return present
            ? {
                current: mission.resourceRefs.map(resource => ({
                  resource,
                  incarnation: 'window-a',
                  revision: 1,
                })),
                unavailable: [],
              }
            : { current: [], unavailable: previous }
        },
      },
    )

    await scheduler.wake(created.id)
    present = false
    await scheduler.resumeJob(created.id, 'job-1')

    expect(decisions).toEqual(['continue', 'reconsider'])
  })

  it('persists a step result and turns a runner error into mission failure', async () => {
    const time = clock()
    const successful = withAction(createMission('Result', time), time, 'Return')
    const broken = withAction(createMission('Failure', time), time, 'Throw')
    const missions = manager(time, [successful, broken])
    const scheduler = createMissionScheduler(
      missions,
      async step => {
        if (step.missionId === broken.id) throw new Error('runner broke')
        return { kind: 'completed', result: { assetId: 'asset_1' } }
      },
      time,
    )

    await scheduler.wake(successful.id)
    await scheduler.wake(broken.id)

    expect((await missions.read(successful.id))?.plan.steps[0]?.result).toEqual({
      assetId: 'asset_1',
    })
    expect(await missions.read(broken.id)).toMatchObject({
      state: 'failed',
      plan: { steps: [{ state: 'failed', error: 'Error: runner broke' }] },
    })
  })

  it('reattaches a persisted job wait and resumes from its job identifier', async () => {
    const time = clock()
    const created = createMission('Job', time)
    const step = createMissionStep(created.id, 'Render', { kind: 'job', jobId: 'job_1' }, time)
    const mission = addMissionStep(created, step, time.now())
    const missions = manager(time, [mission])
    let outcome: MissionStepOutcome = {
      kind: 'waiting',
      wait: { kind: 'job', stepId: step.id, jobId: 'job_1' },
    }
    const scheduler = createMissionScheduler(missions, async () => outcome, time)

    await scheduler.wake(mission.id)
    expect(await missions.read(mission.id)).toMatchObject({ state: 'waiting_job' })
    await expect(scheduler.resume(mission.id, step.id)).rejects.toThrow('does not wait on the user')
    outcome = { kind: 'completed' }
    await expect(scheduler.resumeJob(mission.id, 'job_other')).rejects.toThrow(
      'does not wait on job job_other',
    )
    await Promise.all([
      scheduler.resumeJob(mission.id, 'job_1'),
      scheduler.resumeJob(mission.id, 'job_1'),
    ])

    expect(await missions.read(mission.id)).toMatchObject({ state: 'completed' })
    expect(scheduler.retainedRuns()).toBe(0)
    const revision = (await missions.read(mission.id))?.revision
    await scheduler.resumeJob(mission.id, 'job_1')
    expect((await missions.read(mission.id))?.revision).toBe(revision)
  })

  it('coalesces simultaneous wakes of the same mission', async () => {
    const time = clock()
    const mission = withAction(createMission('Once', time), time, 'Only')
    const missions = manager(time, [mission])
    const runner = vi.fn(async (): Promise<MissionStepOutcome> => ({ kind: 'completed' }))
    const scheduler = createMissionScheduler(missions, runner, time)

    await Promise.all([scheduler.wake(mission.id), scheduler.wake(mission.id)])

    expect(runner).toHaveBeenCalledOnce()
  })

  it('fails rather than attaching a wait returned for another step', async () => {
    const time = clock()
    const mission = withAction(createMission('Wrong wait', time), time, 'Only')
    const missions = manager(time, [mission])
    const scheduler = createMissionScheduler(
      missions,
      async () => ({ kind: 'waiting', wait: { kind: 'user', stepId: 'step_other' } }),
      time,
    )

    await scheduler.wake(mission.id)

    expect(await missions.read(mission.id)).toMatchObject({ state: 'failed' })
  })

  it('persists failure for a wait whose kind does not match its step', async () => {
    const time = clock()
    const created = createMission('Wrong job', time)
    const step = createMissionStep(created.id, 'Render', { kind: 'job', jobId: 'job_1' }, time)
    const mission = addMissionStep(created, step, time.now())
    const missions = manager(time, [mission])
    const scheduler = createMissionScheduler(
      missions,
      async () => ({
        kind: 'waiting',
        wait: { kind: 'job', stepId: step.id, jobId: 'job_other' },
      }),
      time,
    )

    await scheduler.wake(mission.id)

    expect(await missions.read(mission.id)).toMatchObject({ state: 'failed' })
  })

  it('ignores a sibling result after another parallel step fails', async () => {
    const time = clock()
    let mission = withAction(createMission('Parallel failure', time), time, 'Failure')
    mission = withAction(mission, time, 'Sibling')
    const missions = manager(time, [mission])
    let release = (): void => {}
    let siblingSignal: AbortSignal | undefined
    const scheduler = createMissionScheduler(
      missions,
      async (step, signal) => {
        if (step.title === 'Failure') return { kind: 'failed', error: 'failed' }
        siblingSignal = signal
        await new Promise<void>(resolve => {
          release = resolve
        })
        return { kind: 'completed' }
      },
      time,
    )
    const running = scheduler.wake(mission.id)
    await vi.waitFor(async () => expect((await missions.read(mission.id))?.state).toBe('failed'))
    release()

    await expect(running).resolves.toBeUndefined()
    expect(siblingSignal?.aborted).toBe(true)
  })

  it('limits concurrent steps across simultaneous missions', async () => {
    const time = clock()
    const missions = manager(time)
    const first = await missions.create('First', {})
    const second = await missions.create('Second', {})
    const add = async (mission: Mission): Promise<void> => {
      const one = createMissionStep(mission.id, 'One', { kind: 'reason' }, time)
      const two = createMissionStep(mission.id, 'Two', { kind: 'reason' }, time)
      await missions.update(mission.id, mission.revision, current =>
        addMissionStep(addMissionStep(current, one, time.now()), two, time.now()),
      )
    }
    await add(first)
    await add(second)
    let active = 0
    let peak = 0
    const releases: Array<() => void> = []
    const runner = async (_step: MissionStep): Promise<MissionStepOutcome> => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise<void>(resolve => releases.push(resolve))
      active -= 1
      return { kind: 'completed' }
    }
    const scheduler = createMissionScheduler(missions, runner, time, 2)
    const running = Promise.all([scheduler.wake(first.id), scheduler.wake(second.id)])
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    releases.splice(0).forEach(release => release())
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    releases.splice(0).forEach(release => release())
    await running

    expect(peak).toBe(2)
  })

  it('aborts active work and leaves the mission cancelled', async () => {
    const time = clock()
    const missions = manager(time)
    const created = await missions.create('Cancel', {})
    const step = createMissionStep(created.id, 'Long', { kind: 'reason' }, time)
    await missions.update(created.id, created.revision, current =>
      addMissionStep(current, step, time.now()),
    )
    let release = (): void => {}
    let observedAborted = false
    const scheduler = createMissionScheduler(
      missions,
      async (_step, signal) => {
        await new Promise<void>(resolve => {
          release = resolve
        })
        observedAborted = signal.aborted
        return { kind: 'completed' }
      },
      time,
    )
    const running = scheduler.wake(created.id)
    await vi.waitFor(async () =>
      expect((await missions.read(created.id))?.plan.steps[0]?.state).toBe('running'),
    )
    await scheduler.cancel(created.id)
    expect(scheduler.retainedRuns()).toBe(1)
    release()
    await running

    expect(observedAborted).toBe(true)
    expect(await missions.read(created.id)).toMatchObject({ state: 'cancelled' })
    expect(scheduler.retainedRuns()).toBe(0)
  })
})
