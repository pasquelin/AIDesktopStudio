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
 * The assistant reasons by running a text model, which is machinery rather than a generation.
 * It needs this loop — the queue, the concurrency bound, the retries, the one poll — and none of
 * what surrounds a generation, because a sentence typed at the assistant is not something the
 * person asked to watch, keep, or find in their library afterwards.
 */
describe('a job nobody asked to see', () => {
  it('answers what became of it, rather than being watched', async () => {
    const { manager } = harness({
      runner: { submit: () => Promise.resolve(remote('success', { assetIds: ['asset_reply'] })) },
    })

    const job = await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})

    expect(job.status).toBe('succeeded')
  })

  /**
   * The line that keeps the assistant out of the asset browser. Collecting would download a
   * fragment of JSON into the project and index it beside the person's own work; the ids kept
   * are the API's own, which is where the answer is read from.
   */
  it('collects nothing, and keeps the ids the API gave', async () => {
    const collect = vi.fn(() => landing(['asset_local']))
    const { manager } = harness({
      collect,
      runner: { submit: () => Promise.resolve(remote('success', { assetIds: ['asset_reply'] })) },
    })

    const job = await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})

    expect(collect).not.toHaveBeenCalled()
    expect(job.assetIds).toEqual(['asset_reply'])
  })

  /**
   * 🛑 The assistant's stop must reach a job that is BILLED and that nobody is watching: without
   * this, pressing stop left the sentence running to its end and paid for it.
   */
  it('is cancelled by the signal the caller armed it with', async () => {
    const cancel = vi.fn(() => Promise.resolve())
    const { manager } = harness({
      runner: {
        cancel,
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => new Promise(() => {}),
      },
    })
    const stopping = new AbortController()

    void manager.run({ id: 'model_scenario-llm' }, 'Assistant', {}, stopping.signal)
    await settled()
    stopping.abort()
    await settled()

    expect(cancel).toHaveBeenCalled()
  })

  // A stop pressed while the queue was full arrives before the job is ever submitted.
  it('is cancelled by a signal that was already aborted when it was queued', async () => {
    const cancel = vi.fn(() => Promise.resolve())
    const { manager } = harness({
      runner: {
        cancel,
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => new Promise(() => {}),
      },
    })
    const stopping = new AbortController()
    stopping.abort()

    const job = await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {}, stopping.signal)

    expect(job.status).toBe('cancelled')
  })

  it('never reaches the jobs bar', async () => {
    const { manager, progress, announced } = harness()

    await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})

    expect(progress).toEqual([])
    expect(announced).toEqual([])
    expect(manager.list()).toEqual([])
  })

  it('writes nothing to the journal', async () => {
    const { manager, recorded } = harness({
      runner: { submit: () => Promise.resolve(remote('success', { assetIds: ['asset_reply'] })) },
    })

    await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})

    expect(recorded).toEqual([])
  })

  /**
   * Picked up tomorrow, a reasoning step would answer a question nobody is still asking — and
   * charge an account for it. So it goes through the loop that persists, and is not written.
   *
   * The runner SETTLES on the second look rather than answering `in-progress` for ever. A poll
   * loop with no way out spins past the end of the test on the microtask queue, and the
   * harness's runaway guard then throws into whatever file happens to be running — which is
   * exactly what it did, as an unhandled error nobody could place.
   */
  it('is never written down to be resumed', async () => {
    let looks = 0
    const { manager, remembered } = harness({
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => Promise.resolve(remote((looks += 1) > 1 ? 'success' : 'in-progress')),
      },
    })

    await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})

    // In flight AND settled: a generation is written down at both, and this is written at neither.
    expect(looks).toBeGreaterThan(1)
    expect(remembered()).toEqual([])
  })

  it('answers a failure rather than hanging on it', async () => {
    const { manager } = harness({
      runner: { submit: () => Promise.resolve(remote('failure')) },
    })

    const job = await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})

    expect(job.status).toBe('failed')
    expect(job.error).toBe('rejected')
  })

  // The bar and the journal still belong to generations: a discreet job beside one must not
  // take either away from it.
  it('leaves an ordinary generation alone beside it', async () => {
    const { manager, announced, progress } = harness({ collect: () => landing(['asset_1']) })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})
    await settled()

    expect(manager.list().map(job => job.label)).toEqual(['Flux'])
    for (const list of announced) expect(list.every(job => job.label === 'Flux')).toBe(true)
    expect(progress.length).toBeGreaterThan(0)
  })
})
