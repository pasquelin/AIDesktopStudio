import { describe, expect, it } from 'vitest'
import {
  addMissionStep,
  attachChildMission,
  completedRoundsBefore,
  createMission,
  createMissionStep,
  missionCanComplete,
  resumeMission,
  resolveMissionWait,
  recoverInterruptedMission,
  transitionMission,
  transitionMissionStep,
  waitMission,
  type Mission,
  type MissionClock,
  type MissionState,
  type MissionStep,
  type MissionStepDraft,
  type MissionStepState,
  type MissionWaiting,
} from './mission'

function clock(): MissionClock {
  let id = 0
  let tick = 0
  return {
    newId: () => `${(id += 1)}`,
    now: () => `2026-09-04T00:00:0${(tick += 1)}.000Z`,
  }
}

function runningMission() {
  const time = clock()
  let mission = createMission('Create a project', time)
  const step = createMissionStep(
    mission.id,
    'Create the project',
    { kind: 'action', call: { action: 'project.create', input: {} } },
    time,
  )
  mission = addMissionStep(mission, step, time.now())
  mission = transitionMission(mission, 'planning', time.now())
  mission = transitionMission(mission, 'ready', time.now())
  return { mission: transitionMission(mission, 'running', time.now()), step, time }
}

function stepOf(mission: Mission, stepId: string): MissionStep {
  const step = mission.plan.steps.find(candidate => candidate.id === stepId)
  if (!step) throw new Error(`missing test step ${stepId}`)
  return step
}

type MissionWaitingDraft =
  | Omit<Extract<MissionWaiting, { kind: 'user' }>, 'stepId'>
  | Omit<Extract<MissionWaiting, { kind: 'job' }>, 'stepId'>
  | Omit<Extract<MissionWaiting, { kind: 'dependency' }>, 'stepId'>

function waitingMission(draft: MissionStepDraft, waiting: MissionWaitingDraft) {
  const time = clock()
  let mission = createMission('Wait safely', time)
  if (draft.kind === 'sub_mission') {
    const child = { ...createMission('Child', time, mission.id), id: draft.childMissionId }
    mission = attachChildMission(mission, child, time.now())
  }
  const step = createMissionStep(mission.id, 'Wait', draft, time)
  mission = addMissionStep(mission, step, time.now())
  mission = transitionMission(mission, 'planning', time.now())
  mission = transitionMission(mission, 'ready', time.now())
  mission = transitionMission(mission, 'running', time.now())
  mission = transitionMissionStep(mission, step.id, 'ready', time.now())
  mission = transitionMissionStep(mission, step.id, 'running', time.now())
  const linked = { ...waiting, stepId: step.id }
  return { mission: waitMission(mission, linked, time.now()), step, time }
}

describe('mission domain', () => {
  it('creates an independent mission with stable identity and an empty plan', () => {
    const time = clock()
    const mission = createMission('Create a project', time)

    expect(mission).toMatchObject({
      id: 'mission_1',
      goal: 'Create a project',
      state: 'created',
      childIds: [],
      plan: { steps: [] },
      waits: [],
      resourceRefs: [],
      revisionSnapshots: [],
    })
    expect(mission.createdAt).toBe(mission.updatedAt)
  })

  it('links a child only to the parent it names', () => {
    const time = clock()
    const parent = createMission('Build a game', time)
    const child = createMission('Build the world', time, parent.id)
    const linked = attachChildMission(parent, child, time.now())

    expect(linked.childIds).toEqual([child.id])
    expect(attachChildMission(linked, child, time.now())).toBe(linked)
    expect(() => attachChildMission(createMission('Other', time), child, time.now())).toThrow(
      'child mission does not name its parent',
    )
    expect(() =>
      attachChildMission(transitionMission(parent, 'cancelled', time.now()), child, time.now()),
    ).toThrow('finished mission cannot accept a child')
  })

  it('records start and finish while rejecting illegal mission transitions', () => {
    const { mission, time } = runningMission()
    const failed = transitionMission(mission, 'failed', time.now())

    expect(mission.startedAt).toBeDefined()
    expect(failed.finishedAt).toBeDefined()
    expect(() => transitionMission(failed, 'running', time.now())).toThrow(
      'mission cannot transition from failed to running',
    )
  })

  it('releases the wait when a mission resumes', () => {
    const { mission: waiting, time } = waitingMission({ kind: 'user_input' }, { kind: 'user' })

    const resumedFromWait = resumeMission(waiting, waiting.plan.steps[0]?.id ?? '', time.now())
    expect(resumedFromWait.waits).toEqual([])
    expect(resumedFromWait.plan.steps[0]?.state).toBe('ready')
    expect(() =>
      transitionMissionStep(waiting, waiting.plan.steps[0]?.id ?? '', 'ready', time.now()),
    ).toThrow('must resume with its wait')
    expect(() =>
      waitMission(waiting, { kind: 'job', stepId: 'missing', jobId: 'job_1' }, time.now()),
    ).toThrow('mission cannot wait on unknown step missing')
    const stepId = resumedFromWait.plan.steps[0]?.id ?? ''
    expect(() => waitMission(resumedFromWait, { kind: 'user', stepId }, time.now())).toThrow(
      `mission cannot wait on inactive step ${stepId}`,
    )

    const paused = transitionMission(waiting, 'paused', time.now())
    expect(() => transitionMission(paused, 'running', time.now())).toThrow(
      'mission cannot resume before one of its waits',
    )
  })

  it('rejects waits that do not match their job or owned child', () => {
    const job = waitingMission({ kind: 'job', jobId: 'job_1' }, { kind: 'job', jobId: 'job_1' })
    expect(() =>
      waitMission(
        job.mission,
        { kind: 'job', stepId: job.step.id, jobId: 'job_2' },
        job.time.now(),
      ),
    ).toThrow('mission wait does not match job job_1')

    const child = waitingMission(
      { kind: 'sub_mission', childMissionId: 'mission_2' },
      { kind: 'dependency', missionId: 'mission_2' },
    )
    expect(() =>
      waitMission(
        child.mission,
        { kind: 'dependency', stepId: child.step.id, missionId: 'mission_3' },
        child.time.now(),
      ),
    ).toThrow('mission wait does not match child mission_2')
    expect(() =>
      waitMission(
        { ...child.mission, childIds: [] },
        { kind: 'dependency', stepId: child.step.id, missionId: 'mission_2' },
        child.time.now(),
      ),
    ).toThrow('mission does not own child mission_2')
  })

  it('settles a failed wait and its step atomically', () => {
    const waiting = waitingMission({ kind: 'job', jobId: 'job_4' }, { kind: 'job', jobId: 'job_4' })

    expect(
      resolveMissionWait(waiting.mission, waiting.step.id, 'failed', waiting.time.now()),
    ).toMatchObject({
      waits: [],
      plan: { steps: [{ state: 'failed' }] },
    })
  })

  it('pauses an interrupted action for verification without replaying it', () => {
    const { mission, step, time } = runningMission()
    const ready = transitionMissionStep(mission, step.id, 'ready', time.now())
    const interrupted = transitionMissionStep(ready, step.id, 'running', time.now())

    expect(recoverInterruptedMission(interrupted, time.now())).toMatchObject({
      state: 'paused',
      waits: [{ kind: 'recovery', stepId: step.id, reason: 'action_outcome_unknown' }],
      plan: { steps: [{ id: step.id, state: 'waiting' }] },
    })
  })

  it('reconstructs disposable reasoning and durable waits after interruption', () => {
    const { mission, time } = runningMission()
    const reason = createMissionStep(mission.id, 'Think', { kind: 'reason' }, time)
    const job = createMissionStep(mission.id, 'Wait', { kind: 'job', jobId: 'job_8' }, time)
    const interrupted: Mission = {
      ...mission,
      plan: {
        steps: [
          { ...reason, state: 'running', startedAt: time.now() },
          { ...job, state: 'running', startedAt: time.now() },
        ],
      },
    }

    expect(recoverInterruptedMission(interrupted, time.now())).toMatchObject({
      state: 'running',
      waits: [{ kind: 'job', stepId: job.id, jobId: 'job_8' }],
      plan: { steps: [{ state: 'ready' }, { state: 'waiting' }] },
    })
  })

  it('completes only after every required step settles and no wait remains', () => {
    const { mission, step, time } = runningMission()
    expect(() => transitionMission(mission, 'completed', time.now())).toThrow(
      'mission cannot complete with unfinished steps or waits',
    )

    let completedMission = transitionMissionStep(mission, step.id, 'ready', time.now())
    completedMission = transitionMissionStep(completedMission, step.id, 'running', time.now())
    completedMission = transitionMissionStep(completedMission, step.id, 'completed', time.now())

    expect(missionCanComplete(completedMission)).toBe(true)
    expect(transitionMission(completedMission, 'completed', time.now()).state).toBe('completed')
    expect(
      missionCanComplete({
        ...completedMission,
        waits: [{ kind: 'user', stepId: step.id }],
      }),
    ).toBe(false)
    expect(missionCanComplete(createMission('No work', time))).toBe(false)
  })

  it('supports cancellation and failure from every active mission lifecycle stage', () => {
    const active: readonly MissionState[] = ['created', 'planning', 'ready', 'running', 'paused']
    const time = clock()

    for (const state of active) {
      const mission = { ...createMission('Work', time), state }
      expect(transitionMission(mission, 'cancelled', time.now()).state).toBe('cancelled')
      expect(transitionMission(mission, 'failed', time.now()).state).toBe('failed')
    }

    const waiting = [
      waitingMission({ kind: 'user_input' }, { kind: 'user' }).mission,
      waitingMission({ kind: 'job', jobId: 'job_1' }, { kind: 'job', jobId: 'job_1' }).mission,
      waitingMission(
        { kind: 'sub_mission', childMissionId: 'mission_2' },
        { kind: 'dependency', missionId: 'mission_2' },
      ).mission,
    ]
    for (const suspended of waiting) {
      const cancelled = transitionMission(suspended, 'cancelled', time.now())
      const failed = transitionMission(suspended, 'failed', time.now())
      expect(cancelled).toMatchObject({ state: 'cancelled', waits: [] })
      expect(cancelled.plan.steps.every(step => step.state === 'cancelled')).toBe(true)
      expect(failed).toMatchObject({ state: 'failed', waits: [] })
      expect(failed.plan.steps.every(step => step.state === 'failed')).toBe(true)
    }
  })

  it('keeps concurrent waits correlated and resumes only their own step', () => {
    const time = clock()
    let mission = createMission('Run jobs', time)
    const first = createMissionStep(mission.id, 'First job', { kind: 'job', jobId: 'job_1' }, time)
    const second = createMissionStep(
      mission.id,
      'Second job',
      { kind: 'job', jobId: 'job_2' },
      time,
    )
    mission = addMissionStep(addMissionStep(mission, first, time.now()), second, time.now())
    mission = transitionMission(mission, 'planning', time.now())
    mission = transitionMission(mission, 'ready', time.now())
    mission = transitionMission(mission, 'running', time.now())

    for (const { step, jobId } of [
      { step: first, jobId: 'job_1' },
      { step: second, jobId: 'job_2' },
    ]) {
      mission = transitionMissionStep(mission, step.id, 'ready', time.now())
      mission = transitionMissionStep(mission, step.id, 'running', time.now())
      mission = waitMission(mission, { kind: 'job', stepId: step.id, jobId }, time.now())
    }

    expect(mission.waits.map(wait => wait.stepId)).toEqual([first.id, second.id])
    expect(resumeMission(mission, first.id, time.now()).waits).toEqual([
      { kind: 'job', stepId: second.id, jobId: 'job_2' },
    ])

    let active = createMission('Resume beside active work', time)
    const waiting = createMissionStep(active.id, 'Waiting', { kind: 'job', jobId: 'job_3' }, time)
    const running = createMissionStep(active.id, 'Running', { kind: 'reason' }, time)
    active = addMissionStep(addMissionStep(active, waiting, time.now()), running, time.now())
    active = transitionMission(active, 'planning', time.now())
    active = transitionMission(active, 'ready', time.now())
    active = transitionMission(active, 'running', time.now())
    active = transitionMissionStep(active, waiting.id, 'ready', time.now())
    active = transitionMissionStep(active, waiting.id, 'running', time.now())
    active = waitMission(active, { kind: 'job', stepId: waiting.id, jobId: 'job_3' }, time.now())
    active = transitionMissionStep(active, running.id, 'ready', time.now())
    active = transitionMissionStep(active, running.id, 'running', time.now())

    expect(active.state).toBe('running')
    expect(resumeMission(active, waiting.id, time.now())).toMatchObject({
      state: 'running',
      waits: [],
    })
  })

  it('owns steps, dependencies and their waiting lifecycle', () => {
    const time = clock()
    const mission = createMission('Work', time)
    const first = createMissionStep(mission.id, 'Observe', { kind: 'reason' }, time)
    const second = createMissionStep(
      mission.id,
      'Act',
      { kind: 'action', call: { action: 'studio.state', input: {} } },
      time,
      [first.id],
    )
    const added = addMissionStep(addMissionStep(mission, first, time.now()), second, time.now())
    const planned = transitionMission(
      transitionMission(added, 'planning', time.now()),
      'ready',
      time.now(),
    )

    expect(added.plan.steps.map(step => step.dependsOn)).toEqual([[], [first.id]])
    expect(() => transitionMissionStep(planned, second.id, 'ready', time.now())).toThrow(
      `mission step ${second.id} has unfinished dependencies`,
    )
    expect(() =>
      transitionMissionStep(
        transitionMissionStep(planned, first.id, 'ready', time.now()),
        first.id,
        'running',
        time.now(),
      ),
    ).toThrow(`mission step ${first.id} cannot start before its mission`)
    let progressed = transitionMission(planned, 'running', time.now())
    progressed = transitionMissionStep(progressed, first.id, 'ready', time.now())
    progressed = transitionMissionStep(progressed, first.id, 'running', time.now())
    progressed = transitionMissionStep(progressed, first.id, 'completed', time.now())
    progressed = transitionMissionStep(progressed, second.id, 'ready', time.now())
    progressed = transitionMissionStep(progressed, second.id, 'running', time.now())
    expect(() => transitionMissionStep(progressed, second.id, 'waiting', time.now())).toThrow(
      `mission step ${second.id} must wait with a reason`,
    )
  })

  it('rejects invalid step membership and isolates dependency inputs', () => {
    const time = clock()
    const mission = createMission('Work', time)
    const first = createMissionStep(mission.id, 'Observe', { kind: 'reason' }, time)
    const added = addMissionStep(mission, first, time.now())

    expect(() => addMissionStep(added, first, time.now())).toThrow(
      `mission step ${first.id} already exists`,
    )
    const unknown = createMissionStep(mission.id, 'Unknown', { kind: 'verify' }, time, ['missing'])
    expect(() => addMissionStep(added, unknown, time.now())).toThrow(
      `mission step ${unknown.id} depends on an unknown step`,
    )
    const repeated = createMissionStep(mission.id, 'Repeated', { kind: 'verify' }, time, [
      first.id,
      first.id,
    ])
    expect(() => addMissionStep(added, repeated, time.now())).toThrow(
      `mission step ${repeated.id} repeats a dependency`,
    )
    const dependencies = [first.id]
    const isolated = createMissionStep(
      mission.id,
      'Isolated',
      { kind: 'verify' },
      time,
      dependencies,
    )
    dependencies.push('missing')
    expect(isolated.dependsOn).toEqual([first.id])
    expect(() =>
      addMissionStep(transitionMission(added, 'cancelled', time.now()), unknown, time.now()),
    ).toThrow('finished mission cannot accept a step')
  })

  it('finishes steps by completion, failure, cancellation or skip without reopening them', () => {
    const terminal: readonly MissionStepState[] = ['completed', 'failed', 'cancelled', 'skipped']
    const time = clock()
    const mission = createMission('Work', time)
    const step = createMissionStep(
      mission.id,
      'Act',
      { kind: 'action', call: { action: 'studio.state', input: {} } },
      time,
    )

    for (const state of terminal) {
      let source = addMissionStep(mission, step, time.now())
      source = transitionMission(source, 'planning', time.now())
      source = transitionMission(source, 'ready', time.now())
      if (state !== 'skipped') {
        source = transitionMission(source, 'running', time.now())
        source = transitionMissionStep(source, step.id, 'ready', time.now())
        source = transitionMissionStep(source, step.id, 'running', time.now())
      }
      const finished = transitionMissionStep(source, step.id, state, time.now())
      expect(stepOf(finished, step.id).finishedAt).toBeDefined()
      expect(() => transitionMissionStep(finished, step.id, 'ready', time.now())).toThrow()
    }

    const cancelled = transitionMission(
      addMissionStep(mission, step, time.now()),
      'cancelled',
      time.now(),
    )
    expect(() => transitionMissionStep(cancelled, step.id, 'ready', time.now())).toThrow(
      'mission steps cannot transition while mission is cancelled',
    )
  })
})

describe('completedRoundsBefore', () => {
  it('groups the finished steps by the reason or verify step that closed them, newest first', () => {
    const time = clock()
    let mission = createMission('Add a cube', time)
    const drafts: readonly [string, MissionStepDraft, MissionStepState][] = [
      ['plan', { kind: 'reason' }, 'completed'],
      ['add', { kind: 'action', call: { action: 'node.add', input: {} } }, 'completed'],
      ['render', { kind: 'job', jobId: 'job-1' }, 'completed'],
      ['check', { kind: 'verify' }, 'completed'],
      ['read', { kind: 'action', call: { action: 'scene.state', input: {} } }, 'completed'],
      ['skipped', { kind: 'action', call: { action: 'node.remove', input: {} } }, 'skipped'],
      ['now', { kind: 'reason' }, 'pending'],
    ]
    for (const [title, draft, state] of drafts) {
      const step = createMissionStep(mission.id, title, draft, time)
      mission = addMissionStep(mission, { ...step, state }, time.now())
    }
    const now = mission.plan.steps.find(step => step.title === 'now')

    const rounds = completedRoundsBefore(mission, now?.id ?? '')

    expect(rounds.map(round => round.map(step => step.title))).toEqual([
      ['read'],
      ['add', 'render'],
      [],
    ])
  })
})
