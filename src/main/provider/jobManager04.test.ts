import { APIError } from '@scenario-labs/sdk'

import { describe, expect, it, vi } from 'vitest'

import type { Job, JobProgress, JobStatus } from '@shared/domain/job'

import type { WorkspaceId } from '@shared/domain/workspace'

import type { ActivityReport } from '@main/project/activityLog'

import {
  createJobManager,
  type AssetCollector,
  type CollectedOutputs,
  type JobManager,
  type JobManagerDeps,
  type JobRunner,
  type RemoteJob,
} from './jobManager'

import type { PersistedJob } from './persistedJob'

export const settled = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

/**
 * Counted across the whole harness rather than per job, so it has to clear the busiest test by
 * a wide margin — a runaway loop reaches it in milliseconds either way.
 */
export const RUNAWAY_SLEEPS = 1000

export function remote(status: string, overrides: Partial<RemoteJob> = {}): RemoteJob {
  return { jobId: 'job_remote', status, progress: 0, assetIds: [], ...overrides }
}

export type Harness = {
  manager: JobManager
  progress: JobProgress[]
  sleeps: number[]
  recorded: ActivityReport[]
  /** Every list the manager announced, in order. One entry per gain or loss, never per poll. */
  announced: (readonly Job[])[]
  /**
   * What would survive the process, as of now. A function and not a value: `persist` replaces
   * the list rather than mutating it, and a destructured getter would freeze the empty one the
   * harness starts with — which is what made two of these tests assert nothing at all.
   */
  remembered: () => PersistedJob[]
}

/** The two halves of a `JobAccount`, spelled apart because most tests only replace one. */
export type HarnessOptions = Partial<JobManagerDeps> & {
  /** Partial, because a test about the queue never reaches `submit` or `poll` at all. */
  runner?: Partial<JobRunner>
  collect?: AssetCollector
}

/** What a collector answers with. Typed here so a shelf id stays one rather than widening. */
export const landing = (
  ids: string[],
  workspaces: WorkspaceId[] = ['image'],
): Promise<CollectedOutputs> => Promise.resolve({ ids, workspaces })

export function harness({ runner, collect, ...overrides }: HarnessOptions = {}): Harness {
  const progress: JobProgress[] = []
  const sleeps: number[] = []
  const recorded: ActivityReport[] = []
  const announced: (readonly Job[])[] = []
  let remembered: PersistedJob[] = []
  let sequence = 0

  const account = {
    runner: {
      submit: () => Promise.resolve(remote('success')),
      poll: () => Promise.resolve(remote('success')),
      cancel: () => Promise.resolve(),
      ...runner,
    },
    collect: collect ?? (() => landing([], [])),
  }

  const manager = createJobManager({
    accounts: { active: () => ({ id: 'fingerprint_studio', account }), of: () => account },
    projectPath: () => '/projects/kingdom',
    // The manifest's name, which is what the shelf holds — never the folder the project sits in.
    projectNameOf: path => (path === '/projects/kingdom' ? 'Royaume' : 'Donjon'),
    persist: jobs => void (remembered = [...jobs]),
    concurrency: () => 2,
    maxRetries: () => 3,
    resolveAssetInputs: (body: Record<string, unknown>) => Promise.resolve(body),
    onProgress: entry => void progress.push(structuredClone(entry)),
    onListChanged: list => void announced.push(structuredClone(list)),
    record: report => void recorded.push(report),
    now: () => `2026-08-06T10:00:${String(sequence++).padStart(2, '0')}.000Z`,
    newId: () => `job_${sequence}`,
    // Delays are recorded rather than waited: the backoff schedule is what matters, and a
    // test that actually sleeps for it takes seconds to prove one assertion.
    // Bounded, because these delays resolve on the microtask queue: a poll loop whose exit
    // condition regresses would spin without ever letting a timer — vitest's own included —
    // fire, turning a red assertion into a run that has to be killed by hand. Thrown outside
    // the promise chain as well, because `execute` catches everything: swallowed, the guard
    // would settle the job as failed and let a spinning loop merge green.
    sleep: ms => {
      sleeps.push(ms)
      if (sleeps.length > RUNAWAY_SLEEPS) {
        const runaway = new Error('poll loop did not terminate')
        queueMicrotask(() => {
          throw runaway
        })
        throw runaway
      }
      return Promise.resolve()
    },
    ...overrides,
  })

  return { manager, progress, sleeps, recorded, announced, remembered: () => remembered }
}

describe('job manager', () => {
  /** Each outcome, beside the spelling the API answers it with. */
  const SETTLED: readonly [JobStatus, string][] = [
    ['succeeded', 'success'],
    ['failed', 'failed'],
    ['cancelled', 'canceled'],
  ]

  it('follows the progress the API reports', async () => {
    const statuses = [remote('queued', { progress: 0 }), remote('in-progress', { progress: 0.4 })]
    const { manager, progress } = harness({
      runner: {
        submit: () => Promise.resolve(remote('queued', { progress: 0 })),
        poll: () => Promise.resolve(statuses.shift() ?? remote('success', { progress: 1 })),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(progress.map(entry => [entry.status, entry.progress])).toEqual([
      ['queued', 0],
      ['running', 0.4],
      ['succeeded', 1],
    ])
  })

  /**
   * The percentages have to land on a poll that is still running: `advance` returns before
   * storing anything once the status is final, and `settle` writes 1 of its own accord.
   */
  it('finishes a job that spells its outcome and its progress the way the guide does', async () => {
    const polls = [remote('in-progress', { progress: 40 }), remote('finalizing', { progress: 100 })]
    const { manager, progress } = harness({
      runner: {
        submit: () => Promise.resolve(remote('queued', { progress: 0 })),
        poll: () => Promise.resolve(polls.shift() ?? remote('succeeded', { progress: 100 })),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(progress.map(entry => [entry.status, entry.progress])).toEqual([
      ['queued', 0],
      ['running', 0.4],
      ['running', 1],
      ['succeeded', 1],
    ])
  })

  it('retries a rate limit with a growing delay', async () => {
    let attempts = 0
    const { manager, sleeps } = harness({
      maxRetries: () => 3,
      runner: {
        submit: () => {
          attempts++
          return attempts < 3
            ? Promise.reject(APIError.generate(429, undefined, undefined, new Headers()))
            : Promise.resolve(remote('success'))
        },
        poll: () => Promise.resolve(remote('success')),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    // Doubling, within the ±20 % the jitter spreads them over — three jobs that take a 429
    // together must not come back together, which an exact sequence would forbid.
    expect(sleeps).toHaveLength(2)
    expect(sleeps[0]).toBeGreaterThanOrEqual(800)
    expect(sleeps[0]).toBeLessThanOrEqual(1200)
    expect(sleeps[1]).toBeGreaterThanOrEqual(1600)
    expect(sleeps[1]).toBeLessThanOrEqual(2400)
    expect(manager.list()[0]?.status).toBe('succeeded')
  })

  /**
   * 🛑 A runner may keep what it answered WITH — `codeJobRunner` holds a whole script — and only
   * the manager knows when it will never poll again. Told on the poll instead, the script would
   * be gone by the resume the step-aside below needs.
   */
  it('tells the runner it is done with a job once the outcome is settled', async () => {
    const forget = vi.fn()
    const { manager } = harness({
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => Promise.resolve(remote('success', { assetIds: ['r_1'] })),
        cancel: () => Promise.resolve(),
        forget,
      },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(forget).toHaveBeenCalledWith('job_remote', { id: 'model_flux' })
  })

  /** The step aside settles nothing, so what the runner kept has to outlive it — see the resume. */
  it('tells it nothing when the job steps aside for a project that closed', async () => {
    let open: string | null = '/projects/kingdom'
    const forget = vi.fn()
    const { manager } = harness({
      projectPath: () => open,
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => {
          open = null
          return Promise.resolve(remote('success', { assetIds: ['r_1'] }))
        },
        cancel: () => Promise.resolve(),
        forget,
      },
    })

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    expect(forget).not.toHaveBeenCalled()
  })

  it('gives up on an error a retry cannot fix', async () => {
    const submit = vi.fn(() =>
      Promise.reject(APIError.generate(400, undefined, 'bad body', new Headers())),
    )
    const { manager } = harness({
      runner: { submit, poll: () => Promise.resolve(remote('success')), cancel: vi.fn() },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(submit).toHaveBeenCalledOnce()
    expect(manager.list()[0]).toMatchObject({ status: 'failed' })
  })

  it('drops a queued job without ever reaching the API', async () => {
    const submit = vi.fn(() => new Promise<RemoteJob>(() => {}))
    const cancel = vi.fn(() => Promise.resolve())
    const { manager } = harness({
      concurrency: () => 1,
      runner: { submit, poll: () => Promise.resolve(remote('success')), cancel },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    // Awaited, because the first job now translates its asset ids before it submits: without
    // this it would still be holding the slot on that step, and the runner untouched either way.
    await settled()
    const queued = manager.submit({ id: 'model_flux' }, 'Flux', {})
    await manager.cancel(queued.id)

    expect(submit).toHaveBeenCalledOnce()
    expect(cancel).not.toHaveBeenCalled()
    expect(manager.list().find(job => job.id === queued.id)?.status).toBe('cancelled')
  })

  it('tells the API about a job it has already started', async () => {
    const cancel = vi.fn(() => Promise.resolve())
    const { manager } = harness({
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => new Promise<RemoteJob>(() => {}),
        cancel,
      },
    })

    const job = manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()
    await manager.cancel(job.id)

    expect(cancel).toHaveBeenCalledWith('job_remote', { id: 'model_flux' })
  })

  it('succeeds only once the assets are indexed', async () => {
    const order: string[] = []
    const { manager, progress } = harness({
      runner: {
        submit: () => Promise.resolve(remote('success', { assetIds: ['remote_1'] })),
        poll: () => Promise.resolve(remote('success')),
        cancel: () => Promise.resolve(),
      },
      collect: (_job, remoteAssetIds) => {
        order.push(`collect:${remoteAssetIds.join(',')}`)
        return landing(['asset_local'])
      },
      onProgress: entry => void order.push(`progress:${entry.status}`),
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(order).toEqual(['progress:queued', 'collect:remote_1', 'progress:succeeded'])
    expect(manager.list()[0]?.assetIds).toEqual(['asset_local'])
    expect(progress).toEqual([])
  })

  it("hands the collector the runner's job id", async () => {
    const seen: Array<string | undefined> = []
    const { manager } = harness({
      runner: {
        submit: () => Promise.resolve(remote('success', { jobId: 'local_abc' })),
        poll: () => Promise.resolve(remote('success', { jobId: 'local_abc' })),
        cancel: () => Promise.resolve(),
      },
      collect: job => {
        seen.push(job.remoteId)
        return landing(['asset_local'])
      },
    })

    manager.submit({ id: 'sana-600m-1024' }, 'Sana', {})
    await settled()

    expect(seen).toEqual(['local_abc'])
  })

  /**
   * The shape the renderer's fixture builds on (`stores/job-fixtures.ts`). Held here because a
   * fixture can only assert against its own text: if `settle` stopped dating a job, five suites
   * would go on passing against a job this process no longer produces.
   */
  it.each(SETTLED)(
    'dates a %s job, and carries a succeeded one to full progress',
    async (status, spelling) => {
      const { manager } = harness({
        runner: {
          submit: () => Promise.resolve(remote(spelling)),
          poll: () => Promise.resolve(remote(spelling)),
          cancel: () => Promise.resolve(),
        },
      })

      manager.submit({ id: 'model_flux' }, 'Flux', {})
      await settled()

      const [job] = manager.list()
      expect(job?.status).toBe(status)
      expect(job?.finishedAt).toEqual(expect.any(String))
      expect(job?.progress).toBe(status === 'succeeded' ? 1 : 0)
    },
  )

  // A local write failure is not what the API said, and neither is a code the renderer can
  // mistake for an API problem.
  it('fails the job on a storage code when its assets cannot be brought down', async () => {
    const { manager } = harness({
      collect: () => Promise.reject(new Error('disk full')),
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(manager.list()[0]).toMatchObject({ status: 'failed', error: 'storage' })
  })

  it('reduces an API error to a code rather than carrying its message across', async () => {
    const leaky = APIError.generate(500, undefined, 'Authorization: Basic c2VjcmV0', new Headers())
    const { manager } = harness({
      maxRetries: () => 0,
      runner: {
        submit: () => Promise.reject(leaky),
        poll: () => Promise.resolve(remote('success')),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    const failed = manager.list()[0]
    expect(failed).toMatchObject({ status: 'failed', error: 'server' })
    expect(JSON.stringify(failed)).not.toContain('c2VjcmV0')
  })

  it('reports a job the API rejected as rejected, not as an unknown failure', async () => {
    const { manager } = harness({
      runner: {
        submit: () => Promise.resolve(remote('failure')),
        poll: () => Promise.resolve(remote('failure')),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(manager.list()[0]).toMatchObject({ status: 'failed', error: 'rejected' })
  })

  it('lists the most recent job first', async () => {
    const { manager } = harness()
    manager.submit({ id: 'model_flux' }, 'Flux', {})
    const second = manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    expect(manager.list()[0]?.id).toBe(second.id)
  })
})
