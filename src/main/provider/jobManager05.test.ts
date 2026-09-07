import { describe, expect, it, vi } from 'vitest'

import type { Job, JobProgress } from '@shared/domain/job'

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

/**
 * A job id belongs to the account that created it. Asking the next account about it answers
 * 404, which no retry can fix — so a ten-minute video generation used to die on a switch that
 * had nothing to do with it.
 */
describe('the account a job runs on', () => {
  /**
   * The studio account, the one switched to mid-generation, and the switch itself. The default
   * poll answers once as running — which is what flips the account — then succeeds.
   */
  function switching(studioPoll?: JobRunner['poll']) {
    const other = { runner: { submit: vi.fn(), poll: vi.fn(), cancel: vi.fn() }, collect: vi.fn() }
    let switched = false

    const defaultPoll = (jobId: string): Promise<RemoteJob> => {
      if (switched) {
        return Promise.resolve(remote('success', { jobId, assetIds: ['r_1'] }))
      }
      // The user switches accounts while the generation is still running.
      switched = true
      return Promise.resolve(remote('in-progress', { jobId }))
    }

    const studio = {
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: vi.fn(studioPoll ?? defaultPoll),
        cancel: vi.fn(() => Promise.resolve()),
      },
      collect: vi.fn(() => landing(['asset_local'])),
    }

    const accounts = {
      active: () =>
        switched
          ? { id: 'account_other', account: other }
          : { id: 'account_studio', account: studio },
      of: (id: string) => (id === 'account_other' ? other : studio),
    }

    const { manager } = harness({ accounts })
    return { manager, studio, other, switch: () => void (switched = true) }
  }

  it('polls the account that submitted it, not the one active when the poll comes round', async () => {
    const { manager, studio, other } = switching()

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    expect(studio.runner.poll).toHaveBeenCalledTimes(2)
    expect(other.runner.poll).not.toHaveBeenCalled()
    expect(manager.list()[0]).toMatchObject({ status: 'succeeded', assetIds: ['asset_local'] })
  })

  // The output is retrieved with the same key that generated it — a signed URL from the other
  // account's client answers 404, which the collector reports as a local storage failure.
  it('collects the outputs on that same account', async () => {
    const { manager, studio, other } = switching()

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    expect(studio.collect).toHaveBeenCalledOnce()
    expect(other.collect).not.toHaveBeenCalled()
  })

  it('cancels on that same account', async () => {
    const {
      manager,
      studio,
      other,
      switch: switchAccount,
    } = switching(() => new Promise<RemoteJob>(() => {}))

    const job = manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()
    switchAccount()
    await manager.cancel(job.id)

    expect(studio.runner.cancel).toHaveBeenCalledWith('job_remote', { id: 'model_veo' })
    expect(other.runner.cancel).not.toHaveBeenCalled()
  })

  it('fails a job submitted without a key rather than borrowing one added since', async () => {
    const { manager } = harness({ accounts: { active: () => null, of: () => null } })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(manager.list()[0]).toMatchObject({ status: 'failed', error: 'missing' })
  })
})
