import { describe, expect, it, vi } from 'vitest'
import type {
  ActionOutcome,
  AssistantAnswer,
  AssistantCall,
  AssistantThought,
} from '@shared/domain/assistant'
import type { Job } from '@shared/domain/job'
import {
  addMissionStep,
  createMission,
  createMissionStep,
  transitionMission,
  transitionMissionStep,
  type Mission,
} from '@shared/domain/mission'
import type { AssistantBrain } from '@main/assistant/brainPort'
import type { MissionJournal } from './journal'
import { createStudioEventBus } from './eventBus'
import { createMissionManager } from './manager'
import { createMissionRuntime } from './runtime'
import { createMissionStore } from './store'
import type { AssistantContext } from './context'
import {
  missionTestBrain as brainWith,
  missionTestClock as clock,
  missionTestContext as contextFor,
} from './runtimeTestSupport'

describe('mission runtime', () => {
  it('plans, executes and verifies a mission with bounded action candidates', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const planned: AssistantAnswer = {
      say: 'Creating.',
      calls: [{ action: 'project.create', input: {} }],
      cost: 1,
    }
    const verified: AssistantAnswer = { say: 'Done.', calls: [], cost: 1 }
    const { brain, requests } = brainWith([planned, verified], true)
    const build = vi.fn(async ({ mission }: { mission: Mission; visual?: boolean }) =>
      contextFor(mission),
    )
    const run = vi.fn(
      async (_call: AssistantCall, _signal?: AbortSignal): Promise<ActionOutcome> => ({
        ok: true,
        data: { path: '/projects/new' },
      }),
    )
    const runtime = createMissionRuntime({
      manager,
      context: { build },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const mission = await runtime.create('Create a project', {})

    expect(mission.state).toBe('completed')
    expect(run.mock.calls[0]?.[0]).toEqual({ action: 'project.create', input: {} })
    expect(requests.every(request => request.candidates?.length === 1)).toBe(true)
    expect(build.mock.calls.every(call => call[0].visual === false)).toBe(true)
  })

  it('requests and sends ephemeral visuals only for a multimodal brain', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const requests: AssistantThought[] = []
    const brain: AssistantBrain = {
      capabilities: async () => ({
        streaming: false,
        structuredJson: true,
        multimodalImages: true,
      }),
      think: async request => {
        requests.push(request)
        return { say: 'Done.', calls: [], cost: 0 }
      },
      window: async () => null,
    }
    const build = vi.fn(
      async ({
        mission,
        visual,
      }: {
        mission: Mission
        visual?: boolean
      }): Promise<AssistantContext> => ({
        ...contextFor(mission),
        ...(visual
          ? {
              visual: [
                {
                  kind: 'document',
                  mimeType: 'image/png',
                  width: 1,
                  height: 1,
                  bytes: new Uint8Array([1, 2, 3]),
                  capturedAt: time.now(),
                },
              ],
            }
          : {}),
      }),
    )
    const runtime = createMissionRuntime({
      manager,
      context: { build },
      brain,
      actions: { run: async () => ({ ok: true }), settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    await runtime.create('Inspect the image', {})

    expect(build).toHaveBeenCalledWith(expect.objectContaining({ visual: true }))
    expect(requests[0]?.images).toEqual([
      { mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
    ])
  })

  it('inserts a durable job wait without replaying its submission', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const { brain, requests } = brainWith([
      { say: '', calls: [{ action: 'project.create', input: {} }], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    let terminal = false
    const run = vi.fn(async (): Promise<ActionOutcome> => ({
      ok: true,
      data: { jobId: 'job_1' },
    }))
    const jobs = (): Job[] => [
      {
        id: 'job_1',
        targetId: 'model',
        label: 'Generation',
        status: terminal ? 'succeeded' : 'running',
        progress: terminal ? 1 : 0.5,
        createdAt: time.now(),
        assetIds: [],
      },
    ]
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: jobs },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const waiting = await runtime.create('Generate', {})
    expect(waiting.state).toBe('waiting_job')
    expect(requests).toHaveLength(1)
    terminal = true
    await runtime.scheduler.resumeJob(waiting.id, 'job_1')

    expect((await manager.read(waiting.id))?.state).toBe('completed')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('reasons again before using a resource produced earlier in the same answer', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const search: AssistantCall = {
      action: 'models.search',
      input: { query: '3d', family: '3d' },
    }
    const premature: AssistantCall = {
      action: 'models.readGenerationModelFields',
      input: { modelId: 'invented' },
    }
    const grounded: AssistantCall = {
      action: 'models.select',
      input: { family: '3d', modelId: 'model-3d' },
    }
    const { brain, requests } = brainWith([
      { say: '', calls: [search, premature], cost: 0 },
      { say: '', calls: [grounded], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    const run = vi.fn(async (_call: AssistantCall): Promise<ActionOutcome> => ({
      ok: true,
      data: [{ id: 'model-3d' }],
    }))
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const mission = await runtime.create('Generate a model', {})

    expect(mission.state).toBe('completed')
    expect(run.mock.calls.map(call => call[0])).toEqual([search, grounded])
    expect(requests).toHaveLength(3)
  })

  it('rejects an invented reference after an authoritative action returned valid values', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const search: AssistantCall = {
      action: 'models.search',
      input: { query: '3d', family: '3d' },
    }
    const invented: AssistantCall = {
      action: 'models.select',
      input: { family: '3d', modelId: 'nested-provider' },
    }
    const grounded: AssistantCall = {
      action: 'models.select',
      input: { family: '3d', modelId: 'model-3d' },
    }
    const { brain } = brainWith([
      { say: '', calls: [search], cost: 0 },
      { say: '', calls: [invented], cost: 0 },
      { say: '', calls: [grounded], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    const run = vi.fn(async (call: AssistantCall): Promise<ActionOutcome> => ({
      ok: true,
      data:
        call.action === 'models.search'
          ? [{ id: 'model-3d', provider: { id: 'nested-provider' } }]
          : undefined,
    }))
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })
    const mission = await runtime.create('Generate a model', {})
    expect(run.mock.calls.map(call => call[0])).toEqual([search, grounded])
    expect(
      mission.plan.steps.some(
        step => step.result && JSON.stringify(step.result).includes('untrustedReference'),
      ),
    ).toBe(true)
  })

  it('does not execute an action before its structured input resource exists', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const { brain } = brainWith([
      {
        say: '',
        calls: [
          {
            action: 'generator.prepare',
            input: { family: '3d', modelId: 'invented', parameters: { prompt: 'chest' } },
          },
        ],
        cost: 0,
      },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    const run = vi.fn(async (): Promise<ActionOutcome> => ({ ok: true }))
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const mission = await runtime.create('Generate a model', {})

    expect(run).not.toHaveBeenCalled()
    expect(
      mission.plan.steps.some(
        step => step.result && JSON.stringify(step.result).includes('missingResources'),
      ),
    ).toBe(true)
  })

  it('replans after a reparable action input refusal', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const first: AssistantCall = { action: 'project.create', input: { wrong: true } }
    const corrected: AssistantCall = { action: 'project.create', input: { name: 'Boat' } }
    const { brain, requests } = brainWith([
      { say: '', calls: [first], cost: 0 },
      { say: '', calls: [corrected], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    let attempts = 0
    const run = vi.fn(async (_call: AssistantCall): Promise<ActionOutcome> =>
      attempts++ === 0
        ? { ok: false, refusal: 'badInput', detail: 'no field "wrong" — use "name"' }
        : { ok: true },
    )
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const mission = await runtime.create('Create a project', {})

    expect(mission.state).toBe('completed')
    expect(run.mock.calls.map(call => call[0])).toEqual([first, corrected])
    expect(requests).toHaveLength(3)
    expect(mission.plan.steps.filter(step => step.kind === 'verify')).toHaveLength(1)
  })

  it('continues planning when an action result enables another action', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const { brain, requests } = brainWith([
      {
        say: '',
        calls: [{ action: 'models.search', input: { family: 'image' } }],
        cost: 0,
      },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: {
        run: async () => ({ ok: true, data: [{ id: 'model-image' }] }),
        settle: vi.fn(),
      },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const mission = await runtime.create('Generate an image', {})

    expect(requests).toHaveLength(2)
    expect(
      mission.plan.steps.some(step => step.kind === 'reason' && step.title === 'Continue mission'),
    ).toBe(true)
    expect(mission.plan.steps.some(step => step.kind === 'verify')).toBe(false)
  })

  it('persists a user answer before resuming planning', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const { brain } = brainWith([
      {
        say: '',
        ask: { questions: [{ question: 'Project name?', choices: [] }] },
        calls: [],
        cost: 0,
      },
      { say: '', calls: [{ action: 'project.create', input: { name: 'Boat' } }], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: { run: async () => ({ ok: true }), settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const waiting = await runtime.create('Create a project', {})
    const question = waiting.plan.steps.find(step => step.kind === 'user_input')
    if (!question) throw new Error('question step is missing')
    await runtime.scheduler.resume(waiting.id, question.id, 'Boat')
    const completed = await manager.read(waiting.id)

    expect(completed?.state).toBe('completed')
    expect(completed?.plan.steps.find(step => step.id === question.id)?.result).toBe('Boat')
  })

  it('fails a mission when a waited job fails', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const { brain } = brainWith([
      { say: '', calls: [{ action: 'project.create', input: {} }], cost: 0 },
    ])
    let failed = false
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: { run: async () => ({ ok: true, data: { jobId: 'job_bad' } }), settle: vi.fn() },
      jobs: {
        list: () => [
          {
            id: 'job_bad',
            targetId: 'model',
            label: 'Generation',
            status: failed ? 'failed' : 'running',
            progress: 0.5,
            createdAt: time.now(),
            assetIds: [],
          },
        ],
      },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const waiting = await runtime.create('Generate', {})
    failed = true
    await runtime.scheduler.resumeJob(waiting.id, 'job_bad')

    expect(await manager.read(waiting.id)).toMatchObject({ state: 'failed' })
  })

  it('does not dispatch an action into another open project', async () => {
    const time = clock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const { brain } = brainWith([
      { say: '', calls: [{ action: 'project.create', input: {} }], cost: 0 },
    ])
    const run = vi.fn(async (): Promise<ActionOutcome> => ({ ok: true }))
    const runtime = createMissionRuntime({
      manager,
      context: {
        build: async ({ mission }) => ({
          ...contextFor(mission),
          project: {
            path: '/projects/other',
            manifest: { version: 1, createdAt: time.now(), updatedAt: time.now() },
          },
        }),
      },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    const mission = await runtime.create('Edit project', { projectId: '/projects/wanted' })

    expect(mission.state).toBe('paused')
    expect(run).not.toHaveBeenCalled()
  })

  it('wakes persisted disposable reasoning when the runtime starts', async () => {
    const time = clock()
    let stored = createMission('Resume', time)
    const reason = createMissionStep(stored.id, 'Continue', { kind: 'reason' }, time)
    stored = addMissionStep(stored, reason, time.now())
    stored = transitionMission(stored, 'planning', time.now())
    stored = transitionMission(stored, 'ready', time.now())
    stored = transitionMission(stored, 'running', time.now())
    stored = transitionMissionStep(stored, reason.id, 'ready', time.now())
    const journal: MissionJournal = { read: async () => [stored], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    const { brain } = brainWith([{ say: 'Done.', calls: [], cost: 0 }])
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => contextFor(mission) },
      brain,
      actions: { run: async () => ({ ok: true }), settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock: time,
    })

    await runtime.start()

    expect(await manager.read(stored.id)).toMatchObject({ state: 'completed' })
  })
})
