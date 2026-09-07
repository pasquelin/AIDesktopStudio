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

/** A note a previous session left behind: the job exists at the API and has been paid for. */
export const RUNNING: PersistedJob = {
  id: 'job_left_running',
  remoteId: 'job_remote',
  targetId: 'model_veo',
  label: 'Veo',
  accountId: 'fingerprint_studio',
  projectPath: '/projects/kingdom',
  createdAt: '2026-08-06T09:00:00.000Z',
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

describe('what the list itself announces', () => {
  it('announces the whole list when a job is picked up from a previous session', () => {
    const { manager, announced } = harness({ concurrency: () => 0 })

    manager.resume([RUNNING])

    expect(announced).toHaveLength(1)
    expect(announced[0]).toEqual([expect.objectContaining({ id: RUNNING.id, label: 'Veo' })])
  })

  // Handed nothing new, there is no composition to announce and no list to redraw.
  it('says nothing when the same note is handed twice', () => {
    const { manager, announced } = harness({ concurrency: () => 0 })

    manager.resume([RUNNING])
    manager.resume([RUNNING])

    expect(announced).toHaveLength(1)
  })

  /**
   * The one exit that leaves no outcome behind. Told nothing, a replica keeps drawing the job as
   * running for the rest of the session, with a cancel button the manager has no entry for.
   */
  it('announces the list when a job steps aside because its project closed', async () => {
    let open = '/projects/kingdom'
    const { manager, announced } = harness({
      projectPath: () => open,
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => {
          open = '/projects/dungeon'
          return Promise.resolve(remote('success', { assetIds: ['r_1'] }))
        },
      },
    })

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    // The submission announced it first; what matters is that its removal was announced too.
    expect(announced.at(-1)).toEqual([])
  })

  /**
   * The window that asked already holds it, but the others never will otherwise: they only hear
   * progress, and progress cannot be merged into a job a replica has never seen.
   */
  it('announces a submission too, for the windows that did not make it', async () => {
    const { manager, announced } = harness({ concurrency: () => 0 })

    manager.submit({ id: 'model_flux' }, 'Flux', {})

    expect(announced).toEqual([[expect.objectContaining({ label: 'Flux' })]])
  })
})
