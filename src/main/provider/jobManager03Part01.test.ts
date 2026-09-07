import { APIError } from '@scenario-labs/sdk'

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

describe('job manager', () => {
  it('reports the job as queued the moment it is submitted', () => {
    const { manager } = harness()
    const job = manager.submit({ id: 'model_flux' }, 'Flux', { prompt: 'a rock' })

    expect(job).toMatchObject({
      targetId: 'model_flux',
      label: 'Flux',
      status: 'queued',
      progress: 0,
    })
  })

  /** What the target names has to survive the queue to reach the runner that submits it. */
  it('carries what a job runs through to the runner', async () => {
    const submit = vi.fn(() => Promise.resolve(remote('success')))
    const { manager } = harness({ runner: { submit } })

    manager.submit({ id: 'model_flux' }, 'Flux', { image: 'a' })
    await settled()

    expect(submit).toHaveBeenCalledWith({ id: 'model_flux' }, { image: 'a' })
  })

  /**
   * The ids a form hands over are the studio's own, which the API answers 404 on — see
   * `assetInputs.ts`. Translated here rather than at the boundary, so that sending a file up
   * happens under this loop's bound, with the job already on screen.
   */
  it('runs what the asset translation gave back, over the body it was submitted with', async () => {
    const submit = vi.fn(() => Promise.resolve(remote('success')))
    // Reads its argument, or translating the wrong body — or none at all — would pass here.
    const resolveAssetInputs = vi.fn((body: Record<string, unknown>) =>
      Promise.resolve({ ...body, image: 'asset_remote' }),
    )
    const { manager } = harness({ runner: { submit }, resolveAssetInputs })

    manager.submit({ id: 'model_flux' }, 'Flux', {
      image: 'asset_local',
      prompt: 'a fox',
    })
    await settled()

    // The TARGET travels with the body: a picture is turned into a remote id for the cloud and
    // into a path on this disk for a model that runs here, and only the target says which.
    expect(resolveAssetInputs).toHaveBeenCalledWith(
      { image: 'asset_local', prompt: 'a fox' },
      { id: 'model_flux' },
    )
    expect(submit).toHaveBeenCalledWith(
      { id: 'model_flux' },
      { image: 'asset_remote', prompt: 'a fox' },
    )
  })

  // The longer of the two calls on the wire, so the one a dropped connection finds — and the
  // one whose failure would otherwise cost a whole upload for nothing.
  it('retries a translation that failed on the wire, as it retries a submission', async () => {
    let attempts = 0
    const resolveAssetInputs = vi.fn((body: Record<string, unknown>) => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(APIError.generate(503, undefined, 'upstream', new Headers()))
        : Promise.resolve(body)
    })
    const { manager, progress } = harness({ resolveAssetInputs })

    manager.submit({ id: 'model_flux' }, 'Flux', { image: 'asset_local' })
    await settled()

    expect(attempts).toBe(2)
    expect(progress.at(-1)).toMatchObject({ status: 'succeeded' })
  })

  // Queued first and failed after, rather than a channel held open with nothing on screen: an
  // upload is a file transfer of any size, and it is the job that says so while it runs.
  it('fails the job it already queued when an asset cannot be sent up', async () => {
    const submit = vi.fn(() => Promise.resolve(remote('success')))
    const { manager, progress } = harness({
      runner: { submit },
      resolveAssetInputs: () => Promise.reject(new Error('upload-too-large')),
    })

    const job = manager.submit({ id: 'model_flux' }, 'Flux', {
      image: 'asset_local',
    })
    expect(job.status).toBe('queued')
    await settled()

    expect(submit).not.toHaveBeenCalled()
    expect(progress.at(-1)).toMatchObject({ id: job.id, status: 'failed' })
  })

  /**
   * Nothing reaches a transfer already under way, so cancelling during one is heard only once it
   * ends. What must not happen is the studio calling it an error: the journal would carry a
   * failure for something the user asked to stop.
   */
  it('reports a job cancelled mid-upload as cancelled, not as failed', async () => {
    let release = (): void => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    const { manager, progress } = harness({
      resolveAssetInputs: () => held.then(() => Promise.reject(new Error('upload-too-large'))),
    })

    const job = manager.submit({ id: 'model_flux' }, 'Flux', { image: 'asset_x' })
    await settled()
    await manager.cancel(job.id)
    release()
    await settled()

    expect(progress.at(-1)).toMatchObject({ id: job.id, status: 'cancelled' })
    expect(progress.at(-1)?.error).toBeUndefined()
  })

  it('remembers what a running job runs, so a resumed one still names its target', async () => {
    // Every note written along the way: the last one is empty, since the job finishes here.
    const written: PersistedJob[][] = []
    const { manager } = harness({
      runner: { submit: () => Promise.resolve(remote('in-progress')) },
      persist: jobs => void written.push([...jobs]),
    })

    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(written[0]?.[0]).toMatchObject({ targetId: 'model_flux' })
  })

  it('never runs more jobs at once than it is allowed to', async () => {
    let active = 0
    let peak = 0
    const release: (() => void)[] = []

    const { manager } = harness({
      concurrency: () => 2,
      runner: {
        submit: () => {
          active++
          peak = Math.max(peak, active)
          return new Promise(resolve =>
            release.push(() => {
              active--
              resolve(remote('success'))
            }),
          )
        },
        poll: () => Promise.resolve(remote('success')),
        cancel: () => Promise.resolve(),
      },
    })

    for (let index = 0; index < 6; index++) manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(peak).toBe(2)

    while (release.length > 0) {
      release.shift()?.()
      await settled()
    }

    expect(manager.list().every(job => job.status === 'succeeded')).toBe(true)
    expect(peak).toBe(2)
  })

  /**
   * Two exclusive doors on one GPU fight. A job on this machine takes the local slot; a cloud
   * job does not, so an image denoise does not hold a 3D generation that runs somewhere else.
   */
  it('lets a cloud job start while this machine is already generating', async () => {
    const started: string[] = []
    const release: Record<string, () => void> = {}

    const { manager } = harness({
      concurrency: () => 2,
      isLocalTarget: id => id === 'sana',
      runner: {
        submit: target =>
          new Promise(resolve => {
            started.push(target.id)
            release[target.id] = () => resolve(remote('success'))
          }),
      },
    })

    manager.submit({ id: 'sana' }, 'Sana', {})
    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(started.sort()).toEqual(['model_flux', 'sana'])

    release['sana']?.()
    release['model_flux']?.()
    await settled()
  })

  /**
   * A FIFO that only looks at the head would keep Flux queued behind Shap-E while Sana holds the
   * local slot. The cloud job must overtake.
   */
  it('starts a cloud job even when a local one is waiting behind another', async () => {
    const started: string[] = []
    const release: Record<string, () => void> = {}

    const { manager } = harness({
      concurrency: () => 1,
      isLocalTarget: id => id !== 'model_flux',
      runner: {
        submit: target =>
          new Promise(resolve => {
            started.push(target.id)
            release[target.id] = () => resolve(remote('success'))
          }),
      },
    })

    manager.submit({ id: 'sana' }, 'Sana', {})
    await settled()
    manager.submit({ id: 'shap-e' }, 'Shap-E', {})
    manager.submit({ id: 'model_flux' }, 'Flux', {})
    await settled()

    expect(started).toEqual(['sana', 'model_flux'])

    release['sana']?.()
    await settled()
    expect(started).toContain('shap-e')
    release['shap-e']?.()
    release['model_flux']?.()
    await settled()
  })

  /**
   * A cloud whose ceilings are per CATEGORY — Tripo counts one picture at a time against ten
   * meshes. A single number for the whole cloud would refuse the mesh or take a certain 429 on
   * the second picture.
   */
  it('holds a category at its own ceiling while another category runs freely', async () => {
    const started: string[] = []
    const release: Record<string, () => void> = {}

    const { manager } = harness({
      concurrency: () => 5,
      lane: id => (id.startsWith('tripo:') ? { name: id.split(':')[1] ?? '', limit: 1 } : null),
      runner: {
        submit: target =>
          new Promise(resolve => {
            started.push(target.id)
            release[target.id] = () => resolve(remote('success'))
          }),
      },
    })

    manager.submit({ id: 'tripo:image:one' }, 'One', {})
    manager.submit({ id: 'tripo:image:two' }, 'Two', {})
    manager.submit({ id: 'tripo:mesh:three' }, 'Three', {})
    await settled()

    expect(started).toEqual(['tripo:image:one', 'tripo:mesh:three'])

    release['tripo:image:one']?.()
    await settled()
    expect(started).toContain('tripo:image:two')

    release['tripo:image:two']?.()
    release['tripo:mesh:three']?.()
    await settled()
  })
})
