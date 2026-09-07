import { APIConnectionError, APIError } from '@scenario-labs/sdk'

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

describe('a job that outlives the session', () => {
  /**
   * The whole promise the closing dialog makes, end to end: a generation that finishes while its
   * project is closed is not lost, and its outputs land in THAT project when it is opened again.
   * Each half is guarded on its own above; nothing measured the two together.
   */
  it('collects into its own project when that project is opened again', async () => {
    let open: string | null = '/projects/kingdom'
    let left = false
    const collect = vi.fn(() => landing(['asset_local']))
    const { manager, remembered } = harness({
      projectPath: () => open,
      collect,
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        // The FIRST poll leaves the project, and only that one: the poll after the reopening has
        // to find it open, or the decor would be measuring itself rather than the manager.
        poll: () => {
          if (!left) {
            left = true
            open = null
          }
          return Promise.resolve(remote('success', { assetIds: ['r_1'] }))
        },
        cancel: () => Promise.resolve(),
      },
    })

    // Submitted IN the kingdom — the project rides on the entry from that moment — and left
    // before the poll comes back.
    manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    expect(collect).not.toHaveBeenCalled()
    const note = remembered()
    expect(note).toEqual([expect.objectContaining({ projectPath: '/projects/kingdom' })])

    // …and the project is opened again, which is what `resumeJobsOf` does with that note.
    open = '/projects/kingdom'
    manager.resume(note)
    await settled()

    expect(collect).toHaveBeenCalledTimes(1)
    expect(manager.list()[0]).toMatchObject({ status: 'succeeded', assetIds: ['asset_local'] })
  })

  /**
   * The row leaves the bar with no outcome shown, and the note behind it says nothing until its
   * project is opened again. This line is the only thing that says where the work went — and it
   * is a TOAST (`ATTENTION_MESSAGES`), because the journal of a project nobody has open holds
   * nothing anyone will read.
   */
  it('says where the work went when it steps aside', async () => {
    let open = '/projects/kingdom'
    const { manager, recorded } = harness({
      projectPath: () => open,
      collect: () => landing(['asset_local']),
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => {
          open = '/projects/dungeon'
          return Promise.resolve(remote('success', { assetIds: ['r_1'] }))
        },
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    expect(recorded).toContainEqual({
      level: 'info',
      topic: 'generation',
      messageKey: 'activity.jobWaitsForProject',
      // Its MANIFEST name, not the folder: a rename writes one and leaves the other alone.
      params: { label: 'Veo', project: 'Royaume' },
    })
  })

  /**
   * A discreet job owes its outputs to no project, so the guard above must not see it at all.
   * Leaving by that exit settled nothing, and `run` awaits the outcome: an assistant whose
   * project changed mid-thought waited for an answer that never came.
   */
  it('settles a discreet job whose project changed, rather than leaving it hanging', async () => {
    let open = '/projects/kingdom'
    const { manager, recorded } = harness({
      projectPath: () => open,
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => {
          open = '/projects/dungeon'
          return Promise.resolve(remote('success', { assetIds: ['r_1'] }))
        },
        cancel: () => Promise.resolve(),
      },
    })

    const job = await manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})

    expect(job.status).toBe('succeeded')
    // And nothing is said about it: nobody asked for this one, and nobody is waiting for it.
    expect(recorded.map(one => one.messageKey)).not.toContain('activity.jobWaitsForProject')
  })

  it('picks up a job once, however often it is handed the same note', async () => {
    const { manager } = harness()

    manager.resume([RUNNING])
    manager.resume([RUNNING])
    await settled()

    expect(manager.list()).toHaveLength(1)
  })

  /**
   * Queued is not the same as never submitted, and that is new with resumption: a picked-up job
   * waits its turn with a remote id already set. Dropped from the queue alone, it would keep
   * running and being charged for, and `settle` releases the account that could have stopped it.
   */
  it('tells the API about a picked-up job cancelled before its turn came', async () => {
    const cancel = vi.fn(() => Promise.resolve())
    // Nothing may run, so the job stays in the queue: `submit` and `poll` are never reached.
    const { manager, remembered } = harness({ concurrency: () => 0, runner: { cancel } })

    manager.resume([RUNNING])
    await settled()
    // Still in the queue, since nothing may run: this is the branch under test.
    expect(manager.list()[0]?.status).toBe('queued')

    await manager.cancel(RUNNING.id)

    expect(cancel).toHaveBeenCalledWith('job_remote', { id: 'model_veo' })
    expect(manager.list()[0]?.status).toBe('cancelled')
    // Taken by the API, so nothing is owed and the note goes with it.
    expect(remembered()).toEqual([])
  })

  /**
   * Everything up to the API call is synchronous, so a second click lands while the first is
   * still in flight — and finds the job already out of the queue. Unguarded, it fell through to
   * the running branch and spent a second cancel, taking two of the five urgent slots.
   */
  it('tells the API once, however many times the user asks', async () => {
    const cancel = vi.fn(() => Promise.resolve())
    const { manager } = harness({ concurrency: () => 0, runner: { cancel } })

    manager.resume([RUNNING])
    await settled()
    await Promise.all([manager.cancel(RUNNING.id), manager.cancel(RUNNING.id)])

    expect(cancel).toHaveBeenCalledOnce()
  })

  // Refused, it is running and being charged: the note outlives the session that gave up on it.
  it('keeps the note of a queued job the API would not cancel', async () => {
    const { manager, remembered } = harness({
      concurrency: () => 0,
      runner: { cancel: () => Promise.reject(new APIConnectionError({})) },
    })

    manager.resume([RUNNING])
    await settled()
    await manager.cancel(RUNNING.id)

    expect(remembered()).toHaveLength(1)
  })

  /**
   * A note nothing can ever act on is not insurance, it is a job that fails again on every
   * project open until the sweep a week later — with a bogus red row each time.
   */
  it('forgets a resumed job whose remote record the API no longer has', async () => {
    const { manager, remembered } = harness({
      runner: { poll: () => Promise.reject(new APIError(404, undefined, 'gone', undefined)) },
    })

    manager.resume([RUNNING])
    await settled()

    expect(manager.list()[0]).toMatchObject({ status: 'failed', error: 'not-found' })
    expect(remembered()).toEqual([])
  })
})
