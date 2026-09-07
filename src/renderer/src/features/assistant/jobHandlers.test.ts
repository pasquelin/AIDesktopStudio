import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import type { Job } from '@shared/domain/job'
import type { ModelDescriptor } from '@shared/domain/model'
import { installFakeBridge } from '@/services/fakeBridge'
import { report } from '@/features/usage/components/Usage/usage-fixtures'
import { job as jobOf } from '@/stores/job-fixtures'
import { useJobs } from '@/stores/jobs'
import { runAction } from './executor'

const running = (id: string): Job => jobOf({ id, status: 'running', progress: 0.4 })

beforeEach(() => {
  installFakeBridge()
  useJobs.setState({ jobs: [] })
})

describe('reading a generation', () => {
  /**
   * The whole job, `assetIds` above all. Four fields used to be picked out — id, label, status,
   * progress — which made a client able to start a generation and unable to learn what it
   * produced, which is the one thing it was generating for.
   */
  it('answers with what a job produced, cost and failed on', async () => {
    const done = jobOf({ id: 'job-1', status: 'succeeded', progress: 1 })
    useJobs.setState({ jobs: [{ ...done, assetIds: ['asset-9'], cost: 4 }] })

    await expect(runAction('job.readCloudGeneration', { jobId: 'job-1' })).resolves.toMatchObject({
      ok: true,
      data: { assetIds: ['asset-9'], cost: 4, status: 'succeeded' },
    })
  })

  it('lists jobs whole rather than four fields of each', async () => {
    useJobs.setState({ jobs: [{ ...running('job-1'), assetIds: ['asset-3'] }] })

    expect(await runAction('jobs.list', {})).toMatchObject({
      ok: true,
      data: [{ id: 'job-1', assetIds: ['asset-3'] }],
    })
  })

  it('refuses an id the studio is not following', async () => {
    expect(await runAction('job.readCloudGeneration', { jobId: 'job-none' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })
})

describe('waiting for a generation', () => {
  it('answers at once when the job is already finished', async () => {
    useJobs.setState({ jobs: [jobOf({ id: 'job-1', status: 'succeeded', progress: 1 })] })

    expect(await runAction('job.waitForCloudGeneration', { jobId: 'job-1' })).toMatchObject({
      ok: true,
      data: { status: 'succeeded' },
    })
  })

  // The store, not the API: one poller is the invariant, and it is the JobManager's.
  it('settles when the store carries the job to a terminal state', async () => {
    useJobs.setState({ jobs: [running('job-1')] })
    const waiting = runAction('job.waitForCloudGeneration', { jobId: 'job-1' })

    useJobs.setState({ jobs: [{ ...running('job-1'), status: 'succeeded', assetIds: ['a-1'] }] })

    expect(await waiting).toMatchObject({ ok: true, data: { assetIds: ['a-1'] } })
  })

  /**
   * A timeout answers the job as it stands rather than a refusal: "still running after a minute"
   * is something a client can act on, and a refusal would throw the progress away with it.
   */
  it('answers the job as it stands when the wait runs out', async () => {
    vi.useFakeTimers()
    useJobs.setState({ jobs: [running('job-1')] })

    const waiting = runAction('job.waitForCloudGeneration', { jobId: 'job-1', timeoutMs: 1_000 })
    await vi.advanceTimersByTimeAsync(1_100)

    expect(await waiting).toMatchObject({ ok: true, data: { status: 'running', progress: 0.4 } })
    vi.useRealTimers()
  })
})

describe('before a generation', () => {
  it('reads a model’s own fields, and refuses an id nothing answers for', async () => {
    const schema: ModelDescriptor = {
      id: 'model-1',
      name: 'Stone',
      family: 'material',
      runsOn: SCENARIO_CLOUD,
      source: 'scenario',
      origin: 'official',
      featured: false,
      capabilities: [],
      tags: [],
      fields: [],
    }
    installFakeBridge({ provider: { describeModel: vi.fn(async () => schema) } })
    expect(await runAction('models.readGenerationModelFields', { modelId: 'model-1' })).toEqual({
      ok: true,
      data: schema,
    })

    installFakeBridge()
    // `failed`, not `notFound`: a rejection here is a model nothing declares AND a network that
    // dropped, and nothing at this level tells the two apart.
    expect(
      await runAction('models.readGenerationModelFields', { modelId: 'model-none' }),
    ).toMatchObject({
      ok: false,
      refusal: 'failed',
    })
  })

  // `null` is a legitimate answer and travels as one: the API declines to price some models, and
  // a figure invented to fill the field would be worse than admitting there is none.
  it('carries an absent estimate across rather than filling it in', async () => {
    installFakeBridge({ provider: { estimateCost: vi.fn(async () => null) } })

    expect(await runAction('cost.estimate', { modelId: 'model-1', parameters: {} })).toEqual({
      ok: true,
      data: null,
    })
  })
})

describe('cancelling and counting', () => {
  it('cancels a job the studio is following, and nothing else', async () => {
    const cancel = vi.fn(async () => {})
    useJobs.setState({ jobs: [running('job-1')], cancel })

    expect(await runAction('job.cancelCloudGeneration', { jobId: 'job-1' })).toEqual({ ok: true })
    expect(cancel).toHaveBeenCalledWith('job-1')

    expect(await runAction('job.cancelCloudGeneration', { jobId: 'job-2' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  /**
   * 🛑 A caller told « done » about a generation that runs to its end and is billed is the exact
   * outcome the greyed button prevents at the screen. The same answer is owed here.
   */
  it('refuses to report a spend as stopped where the service does not stop one', async () => {
    const cancel = vi.fn(async () => {})
    useJobs.setState({ jobs: [{ ...running('job-1'), cancellable: false }], cancel })

    expect(await runAction('job.cancelCloudGeneration', { jobId: 'job-1' })).toMatchObject({
      ok: false,
      refusal: 'declined',
    })
    expect(cancel).not.toHaveBeenCalled()
  })

  // Nothing has reached the service while it waits in the studio's own queue.
  it('still cancels one of theirs that has not left the queue', async () => {
    const cancel = vi.fn(async () => {})
    const queued = jobOf({ id: 'job-1', status: 'queued', progress: 0 })
    useJobs.setState({ jobs: [{ ...queued, cancellable: false }], cancel })

    expect(await runAction('job.cancelCloudGeneration', { jobId: 'job-1' })).toEqual({ ok: true })
    expect(cancel).toHaveBeenCalledWith('job-1')
  })

  it('reads the usage over the window asked for, and the default otherwise', async () => {
    const usageReport = vi.fn(async () => report())
    installFakeBridge({ provider: { usageReport } })

    await runAction('usage.report', { days: 7 })
    expect(usageReport).toHaveBeenCalledWith(7)

    await runAction('usage.report', {})
    expect(usageReport).toHaveBeenCalledWith(31)
  })

  /**
   * The studio's own long work, which is not a job: a job runs on Scenario's side. `false` says
   * nothing was running under that id — a click that arrived late rather than a failure.
   */
  it('calls off a local task, answering whether one was still running', async () => {
    const cancel = vi.fn(async () => false)
    installFakeBridge({ tasks: { cancel } })

    expect(await runAction('task.cancelLocalTask', { taskId: 'render-1' })).toEqual({
      ok: true,
      data: false,
    })
    expect(cancel).toHaveBeenCalledWith('render-1')
  })
})
