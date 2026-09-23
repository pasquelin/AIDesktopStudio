import { create } from 'zustand'
import { defined } from '@shared/guards'
import { isFinished, type Job, type JobProgress, type JobTarget } from '@shared/domain/job'
import type { ContextUse } from '@shared/domain/projectContext'
import { connectThroughBridge, getBridge } from '@/services/bridge'
import { withoutKey } from '@shared/collections'
import { useAssets } from './assets'

type JobsState = {
  jobs: Job[]
  /**
   * What each job was submitted with, kept per session. The catalogue records `jobId` but not
   * the body, so this is what lets the inspector show the prompt behind an asset and offer to
   * run it again. Dropped on reload, like the job list itself.
   */
  bodies: Record<string, Record<string, unknown>>

  /** Loads the current jobs and follows their progress. Returns the unsubscribe function. */
  connect: () => Promise<() => void>
  /**
   * Runs what the target names, exactly as the main process does. `use` says whether the
   * project's context joins this shot; absent applies it.
   */
  submit: (
    target: JobTarget,
    body: Record<string, unknown>,
    use?: ContextUse,
  ) => Promise<Job | null>
  cancel: (jobId: string) => Promise<void>
  apply: (progress: JobProgress) => void
}

/** Stable, so a surface reading the selector does not re-render on every unrelated job tick. */
const NO_IDS: readonly string[] = []

/**
 * What the most recent finished generation produced — § 24: a result becomes a source without a
 * round trip through the shelf.
 *
 * The LAST one alone, and the list is in submission order: offering everything a session ever
 * made would be a second shelf, and the shelf is one panel away. `assetIds` is what the job
 * carries; the rows themselves are read where they are drawn.
 */
export function latestGenerationIds(state: Pick<JobsState, 'jobs'>): readonly string[] {
  const finished = state.jobs.find(job => job.status === 'succeeded' && job.assetIds?.length)
  return finished?.assetIds ?? NO_IDS
}

/**
 * No asset, no `jobId` for `generationOf` to find the body back through. Code bodies carry
 * `studio.d.ts`: 20 generations retained 254 527 B until the reload.
 */
function unreadable(job: Job): boolean {
  return isFinished(job.status) && (job.assetIds?.length ?? 0) === 0
}

/**
 * Jobs are owned by the main process; this replica exists so the jobs bar can render without
 * asking, and it is refreshed by progress events rather than by polling a second time.
 */
export const useJobs = create<JobsState>()((set, get) => ({
  jobs: [],
  bodies: {},

  connect: connectThroughBridge(async bridge => {
    const stopProgress = bridge.provider.onProgress(progress => get().apply(progress))

    // The whole list, because the main process alone knows when it gains or loses an entry: a
    // job picked up from a previous session, and one that left because its project closed. It
    // replaces the array, which `apply` below avoids doing — but only a handful of times in a
    // session, and `JobRow` is keyed by id, so nothing on screen jumps.
    let pushed = false
    const stopChanges = bridge.provider.onJobsChanged(jobs => {
      pushed = true
      set({ jobs })
    })

    try {
      const jobs = await bridge.provider.listJobs()
      // A list announced while the read was in flight is newer than what the read answered —
      // and jobs are picked up at project open, which is exactly when a window is connecting.
      if (!pushed) set({ jobs })
    } catch {
      // The subscriptions still stand: throwing here would strand them with nobody holding the
      // way to remove them.
    }

    return () => {
      stopProgress()
      stopChanges()
    }
  }),

  // Merged in place rather than refetching the list: a progress event arrives every couple of
  // seconds per job, and replacing the array would restart every animation in the bar.
  apply: progress => {
    // A job only reaches `succeeded` once its assets are on disk and indexed, so this is the
    // exact moment the browser has something new to show.
    if (progress.status === 'succeeded') useAssets.getState().invalidate()

    set(state => {
      const jobs = state.jobs.map(job =>
        job.id === progress.id
          ? {
              ...job,
              status: progress.status,
              progress: progress.progress,
              assetIds: progress.assetIds ?? job.assetIds,
              ...defined({ error: progress.error, cost: progress.cost }),
              // 🛑 Settling emits a progress event and never the whole job, so what is not
              // copied here never reaches a row. The unit was sent and dropped from the day it
              // existed, and `finishedAt` and `remoteId` were never sent at all.
              ...defined({
                costUnit: progress.costUnit,
                note: progress.note,
                finishedAt: progress.finishedAt,
                remoteId: progress.remoteId,
              }),
            }
          : job,
      )

      // Guarded before the scan: an `in-progress` tick arrives every couple of seconds per job,
      // and walking the history for it would answer no every time.
      if (!isFinished(progress.status)) return { jobs }

      const settled = jobs.find(job => job.id === progress.id)
      return settled && unreadable(settled)
        ? { jobs, bodies: withoutKey(state.bodies, settled.id) }
        : { jobs }
    })
  },

  submit: async (target, body, use) => {
    const bridge = getBridge()
    if (!bridge) return null

    const job = await bridge.provider.generate(target.id, body, use)

    set(state => ({ jobs: [job, ...state.jobs], bodies: { ...state.bodies, [job.id]: body } }))
    return job
  },

  cancel: async jobId => {
    await getBridge()?.provider.cancelJob(jobId)
  },
}))
