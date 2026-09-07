import { describe, expect, it } from 'vitest'

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
 * A generation is minutes spent elsewhere: the progress bar is long gone by the time it ends,
 * and a failure that only reached the terminal was a failure nobody was there for.
 */
describe('what a finished job leaves behind to read', () => {
  it('records a failure, naming the model rather than a code', async () => {
    const { manager, recorded } = harness({
      runner: {
        submit: () => Promise.resolve(remote('failure')),
        poll: () => Promise.resolve(remote('failure')),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(recorded).toContainEqual({
      level: 'error',
      topic: 'generation',
      messageKey: 'activity.jobFailed',
      params: { name: 'Flux' },
    })
  })

  /**
   * Counted rather than listed — and the shelves named, which is the half nobody could guess: an
   * App produces what it produces whichever space launched it, so a run started in 3D can leave
   * a picture in the Image shelf and nothing said where it went.
   */
  it('records what a success produced, and the shelves it landed in', async () => {
    const { manager, recorded } = harness({
      collect: () => landing(['asset_1', 'asset_2'], ['image', '3d']),
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(recorded).toContainEqual({
      level: 'info',
      topic: 'generation',
      messageKey: 'activity.generatedInto',
      params: { count: 2, workspaces: ['image', '3d'] },
    })
  })

  // Ids, never names: the line outlives the language it was written in.
  it('leaves the shelves out when the collector named none', async () => {
    const { manager, recorded } = harness({ collect: () => landing(['asset_1'], []) })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(recorded).toContainEqual({
      level: 'info',
      topic: 'generation',
      messageKey: 'activity.generated',
      params: { count: 1 },
    })
  })

  // Nothing came of it, so there is nothing to say: a line saying "0 assets generated" is one
  // the reader has to work out the meaning of.
  it('says nothing about a success that produced no asset', async () => {
    const { manager, recorded } = harness({ collect: () => landing([], []) })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(recorded).toEqual([])
  })

  it('records a cancellation as a fact rather than as a failure', async () => {
    const { manager, recorded } = harness({
      concurrency: () => 1,
      runner: {
        submit: () => new Promise<RemoteJob>(() => {}),
        poll: () => Promise.resolve(remote('success')),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    const queued = manager.submit({ id: 'model_veo' }, 'Veo', {})
    await manager.cancel(queued.id)

    expect(recorded).toContainEqual({
      level: 'info',
      topic: 'generation',
      messageKey: 'activity.jobCancelled',
      params: { name: 'Veo' },
    })
  })

  // The message is a key and its parameters, never a sentence: a journal written in French is
  // French for ever, and reads as gibberish once the interface is in English.
  it('never stores a sentence, only a key and what fills it', async () => {
    const { manager, recorded } = harness({ collect: () => landing(['asset_1']) })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    for (const report of recorded) expect(report.messageKey).toMatch(/^activity\./)
  })
})
