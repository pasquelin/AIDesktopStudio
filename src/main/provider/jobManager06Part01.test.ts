import { APIConnectionError } from '@scenario-labs/sdk'

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
  /** Held open at the poll, so the job stays unfinished for as long as the test needs it. */
  const holding = (): Partial<HarnessOptions> => ({
    runner: {
      submit: () => Promise.resolve(remote('in-progress')),
      poll: () => new Promise<RemoteJob>(() => {}),
      cancel: () => Promise.resolve(),
    },
  })
  /** A generation prices the request, beside the job: that figure is only ever said once. */
  it('keeps what the submission said the job cost', async () => {
    const { manager, progress } = harness({
      runner: { submit: () => Promise.resolve(remote('success', { cost: 12 })) },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(manager.list()[0]?.cost).toBe(12)
    expect(progress.at(-1)?.cost).toBe(12)
  })

  it('leaves the cost unsaid when the API priced nothing', async () => {
    const { manager } = harness()

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(manager.list()[0]?.cost).toBeUndefined()
  })

  /** Submitted in another session, so a poll is the only place its cost can still arrive. */
  it('takes the cost a poll brings for a job it never submitted', async () => {
    let polls = 0
    // The figure rides the poll that is still running, and the one that ends says nothing: read
    // anywhere but in `advance`, there would be no 7 left to find at the end of this.
    const { manager, progress } = harness({
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () =>
          Promise.resolve(
            polls++ === 0 ? remote('in-progress', { progress: 0.5, cost: 7 }) : remote('success'),
          ),
        cancel: () => Promise.resolve(),
      },
    })

    manager.resume([RUNNING])
    await settled()

    expect(manager.list()[0]?.cost).toBe(7)
    expect(progress.at(-1)?.cost).toBe(7)
  })

  it('writes a job down once it exists at the API, and not before', async () => {
    const { manager, remembered } = harness(holding())

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    // Nothing was written at submission: no request had gone out, so nothing had been spent.
    expect(remembered()).toEqual([])

    await settled()

    expect(remembered()).toEqual([
      expect.objectContaining({
        remoteId: 'job_remote',
        targetId: 'model_veo',
        label: 'Veo',
        accountId: 'fingerprint_studio',
        projectPath: '/projects/kingdom',
      }),
    ])
  })

  it('forgets it again once it is finished', async () => {
    const { manager, remembered } = harness()

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(manager.list()[0]?.status).toBe('succeeded')
    expect(remembered()).toEqual([])
  })

  it('polls a job it picked up, and collects what finished while the studio was closed', async () => {
    const submit = vi.fn(() => Promise.resolve(remote('success')))
    const { manager } = harness({
      runner: {
        submit,
        poll: () => Promise.resolve(remote('success', { assetIds: ['r_1'] })),
        cancel: () => Promise.resolve(),
      },
      collect: () => landing(['asset_local']),
    })

    manager.resume([RUNNING])
    await settled()

    // Followed, never submitted a second time: the job already exists and has already been paid.
    expect(submit).not.toHaveBeenCalled()
    expect(manager.list()[0]).toMatchObject({
      id: RUNNING.id,
      label: 'Veo',
      status: 'succeeded',
      assetIds: ['asset_local'],
    })
  })

  /**
   * Its id means nothing under another key, so there is nothing to do this launch — but the key
   * may simply be a keychain that would not open yet, and erasing the note would delete every
   * paid job of the previous session in one pass.
   */
  it('gives up on one whose account the studio no longer holds, without forgetting it', async () => {
    const { manager, remembered } = harness({
      accounts: { active: () => null, of: () => null },
    })

    manager.resume([RUNNING])
    await settled()

    expect(manager.list()[0]).toMatchObject({ status: 'failed', error: 'missing' })
    expect(remembered()).toHaveLength(1)
  })

  // Taken by the API, the job is dead: a note kept would resume one that will never answer.
  it('forgets a cancelled job as soon as the API has taken the cancellation', async () => {
    const { manager, remembered } = harness(holding())

    const job = manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()
    expect(remembered()).toHaveLength(1)

    await manager.cancel(job.id)

    expect(remembered()).toEqual([])
  })

  // Refused, it is still running and still being charged: the note has to outlive the attempt.
  it('keeps the note of a cancellation the API would not take', async () => {
    const { manager, remembered } = harness({
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => new Promise<RemoteJob>(() => {}),
        cancel: () => Promise.reject(new APIConnectionError({})),
      },
    })

    const job = manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()
    await manager.cancel(job.id)

    expect(remembered()).toHaveLength(1)
  })

  /**
   * The failure that matters most, and the one the first draft of this got wrong: a poll giving
   * up is a local event. The generation is running and paid for at Scenario either way, so
   * forgetting it here is the exact loss the whole mechanism exists to prevent.
   */
  it('keeps the note of a job the studio lost touch with', async () => {
    const { manager, remembered } = harness({
      maxRetries: () => 0,
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => Promise.reject(new APIConnectionError({})),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    expect(manager.list()[0]).toMatchObject({ status: 'failed', error: 'network' })
    expect(remembered()).toHaveLength(1)
  })

  // The API said no. Nothing is owed, and a note kept would poll a job that will never run.
  it('forgets one the API itself refused', async () => {
    const { manager, remembered } = harness({
      runner: {
        submit: () => Promise.resolve(remote('failure')),
        poll: () => Promise.resolve(remote('failure')),
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(remembered()).toEqual([])
  })

  // The generation succeeded and is paid for; only the download failed, and it can be retried.
  it('keeps the note of a job whose outputs would not come down', async () => {
    const { manager, remembered } = harness({ collect: () => Promise.reject(new Error('disk')) })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(manager.list()[0]).toMatchObject({ status: 'failed', error: 'storage' })
    expect(remembered()).toHaveLength(1)
  })

  /**
   * The collector writes into whichever project is open. Rather than file this generation in
   * the wrong library, the job steps aside and its note waits for its own project to reopen.
   */
  it('leaves its outputs uncollected rather than put them in another project', async () => {
    let open = '/projects/kingdom'
    const collect = vi.fn(() => landing(['asset_local']))
    const { manager, remembered } = harness({
      projectPath: () => open,
      collect,
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

    expect(collect).not.toHaveBeenCalled()
    expect(remembered()).toEqual([expect.objectContaining({ projectPath: '/projects/kingdom' })])
  })

  /**
   * The same step aside, for the case « Fermer le projet » made reachable: there is no library
   * to file into at all. The note is what carries the generation to the next opening — settling
   * it `failed` would announce a loss for work that is paid for and still on the API.
   */
  it('leaves its outputs uncollected when no project is open at all', async () => {
    let open: string | null = '/projects/kingdom'
    const collect = vi.fn(() => landing(['asset_local']))
    const { manager, remembered } = harness({
      projectPath: () => open,
      collect,
      runner: {
        submit: () => Promise.resolve(remote('in-progress')),
        poll: () => {
          open = null
          return Promise.resolve(remote('success', { assetIds: ['r_1'] }))
        },
        cancel: () => Promise.resolve(),
      },
    })

    manager.submit({ id: 'model_veo' }, 'Veo', {})
    await settled()

    expect(collect).not.toHaveBeenCalled()
    expect(manager.list()).toEqual([])
    expect(remembered()).toEqual([expect.objectContaining({ projectPath: '/projects/kingdom' })])
  })

  /**
   * What the question before leaving a project counts. Off the ENTRIES and not off `list()`,
   * because a job whose own project was closed earlier is still being polled — counted there, it
   * would put a stranger's generation in a sentence about this project.
   */
  describe('counting what is still running in a project', () => {
    it('counts only the unfinished jobs of the project it is asked about', async () => {
      let open = '/projects/kingdom'
      const { manager } = harness({
        projectPath: () => open,
        runner: {
          submit: () => Promise.resolve(remote('in-progress')),
          poll: () => new Promise(() => {}),
          cancel: () => Promise.resolve(),
        },
      })

      manager.submit({ id: 'model_flux' }, 'Kingdom', {})
      open = '/projects/dungeon'
      manager.submit({ id: 'model_flux' }, 'Dungeon', {})
      await settled()

      expect(manager.runningIn('/projects/kingdom')).toBe(1)
      expect(manager.runningIn('/projects/dungeon')).toBe(1)
      expect(manager.runningIn('/projects/nowhere')).toBe(0)
    })

    // A reasoning step nobody asked for is machinery: counting it would put a number in front of
    // someone for work they never started.
    it('never counts a discreet job', async () => {
      const { manager } = harness({
        runner: {
          submit: () => Promise.resolve(remote('in-progress')),
          poll: () => new Promise(() => {}),
          cancel: () => Promise.resolve(),
        },
      })

      void manager.run({ id: 'model_scenario-llm' }, 'Assistant', {})
      await settled()

      expect(manager.runningIn('/projects/kingdom')).toBe(0)
    })

    it('stops counting a job once it has settled', async () => {
      const { manager } = harness({ collect: () => landing(['asset_1']) })

      manager.submit({ id: 'model_flux' }, 'Flux', {})
      await settled()

      expect(manager.runningIn('/projects/kingdom')).toBe(0)
    })
  })
})
