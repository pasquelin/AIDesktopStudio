import {
  isFinished,
  type Job,
  type JobStatus,
  type JobTarget,
  settlementOf,
} from '@shared/domain/job'
import type { JobFailure } from '@shared/domain/failure'
import { defined } from '@shared/guards'
import { byCodeUnit } from '@shared/text'
import type { WorkspaceId } from '@shared/domain/workspace'
import type { AuthoredPrompt } from '@shared/domain/projectContext'
import { apiFailureOf } from './client'
import { createRetry, DEFAULT_BACKOFF_BASE_MS } from './retry'
import {
  DEFAULT_POLL_INTERVAL_MS,
  MAX_RESUMES,
  POLL_REQUESTS_PER_MINUTE,
  RETAINED_JOBS,
  SETTLED_FOR_GOOD,
  jobProgressOf,
  jobStatusOf,
  type Entry,
  type JobAccount,
  type JobManager,
  type JobManagerDeps,
  type RemoteJob,
} from './jobManagerContract'
import type { PersistedJob } from './persistedJob'
import { newEntryOf, resumedEntryOf } from './jobManagerEntries'

function retryOf(options: JobManagerDeps): ReturnType<typeof createRetry> {
  return createRetry({
    maxRetries: options.maxRetries,
    sleep: options.sleep,
    backoffBaseMs: options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS,
    ...(options.retryable ? { retryable: options.retryable } : {}),
    ...(options.retryDelayFor ? { delayFor: options.retryDelayFor } : {}),
  })
}

export function createJobManager(options: JobManagerDeps): JobManager {
  const entries = new Map<string, Entry>()
  const queue: string[] = []
  let running = 0
  let localRunning = 0
  const laneRunning = new Map<string, number>()
  const pollDelay = (): number =>
    Math.max(
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      Math.ceil((running * 60_000) / POLL_REQUESTS_PER_MINUTE),
    )
  const targetOf = (entry: Entry): JobTarget => ({ id: entry.job.targetId })
  const emit = (entry: Entry): void => {
    if (entry.discreet) return

    const { job } = entry
    options.onProgress({
      id: job.id,
      status: job.status,
      progress: job.progress,
      ...(job.assetIds.length > 0 ? { assetIds: job.assetIds } : {}),
      ...defined({
        error: job.error,
        cost: job.cost,
        costUnit: job.costUnit,
        note: job.note,
        finishedAt: job.finishedAt,
        remoteId: job.remoteId,
      }),
    })
  }
  const announceList = (): void => options.onListChanged(listed())
  const listed = (): Job[] =>
    [...entries.values()]
      .filter(entry => !entry.discreet)
      .map(entry => entry.job)
      .sort((left, right) => byCodeUnit(right.createdAt, left.createdAt))
  const remember = (): void => {
    const unfinished: PersistedJob[] = []

    for (const entry of entries.values()) {
      const { accountId, projectPath, remoteId } = entry
      if (entry.done) continue
      if (entry.discreet) continue
      if (remoteId === null || accountId === null || projectPath === null) continue

      unfinished.push({
        id: entry.job.id,
        remoteId,
        targetId: entry.job.targetId,
        label: entry.job.label,
        accountId,
        projectPath,
        createdAt: entry.job.createdAt,
        ...(entry.authored ? { authored: entry.authored } : {}),
      })
    }

    options.persist(unfinished, [...entries.keys()])
  }
  const evictOldFinished = (): void => {
    const finished = [...entries.values()].filter(candidate => isFinished(candidate.job.status))
    const stale = finished.slice(0, finished.length - RETAINED_JOBS)

    for (const entry of stale) entries.delete(entry.job.id)
    if (stale.length > 0) announceList()
  }
  const journal = (job: Job, status: JobStatus, workspaces: WorkspaceId[] = []): void => {
    if (status === 'succeeded') {
      if (job.assetIds.length > 0) {
        options.record({
          level: 'info',
          topic: 'generation',
          messageKey: workspaces.length > 0 ? 'activity.generatedInto' : 'activity.generated',
          params: { count: job.assetIds.length, ...(workspaces.length > 0 ? { workspaces } : {}) },
        })
      }
      return
    }

    options.record({
      level: status === 'failed' ? 'error' : 'info',
      topic: 'generation',
      messageKey: status === 'failed' ? 'activity.jobFailed' : 'activity.jobCancelled',
      params: { name: job.label },
    })
  }

  /**
   * A generation that finished with its own project not in front.
   *
   * 🛑 The line is PERSISTED into whichever project is open — `activityLog` writes to the
   * catalogue it holds — so reopening the project it names shows no trace of it. It is written
   * for the moment it arrives, in the panel of the studio the person is looking at.
   */
  const journalWaiting = (label: string, projectPath: string): void => {
    options.record({
      level: 'info',
      topic: 'generation',
      messageKey: 'activity.jobWaitsForProject',
      params: { label, project: options.projectNameOf(projectPath) },
    })
  }
  const settle = (
    entry: Entry,
    status: JobStatus,
    error?: JobFailure,
    workspaces?: WorkspaceId[],
  ): void => {
    entry.job.status = status
    Object.assign(entry.job, settlementOf(status, options.now()))
    const awaiting = entry.settled
    entry.settled = null
    entry.body = {}
    // 🛑 HERE and not on the poll that answered: `follow` leaves without settling when the
    if (entry.remoteId !== null) entry.account?.runner.forget?.(entry.remoteId, targetOf(entry))
    entry.account = null
    if (error !== undefined) entry.job.error = error
    emit(entry)
    if (!entry.discreet) journal(entry.job, status, workspaces)
    evictOldFinished()
    remember()
    awaiting?.(entry.job)
  }
  const abandon = async (entry: Entry, bound: JobAccount, remoteId: string): Promise<void> => {
    try {
      await bound.runner.cancel(remoteId, targetOf(entry))
      entry.done = true
    } catch {
      // A refused cancellation leaves the job resumable on the next launch.
    }

    settle(entry, 'cancelled')
  }
  const withRetry = retryOf(options)
  const advance = (entry: Entry, remote: RemoteJob): JobStatus => {
    const status = jobStatusOf(remote.status)
    const progress = jobProgressOf(remote.progress ?? entry.job.progress)

    const priced = remote.cost !== undefined && remote.cost !== entry.job.cost
    if (priced) {
      entry.job.cost = remote.cost
      if (remote.costUnit !== undefined) entry.job.costUnit = remote.costUnit
    }

    if (isFinished(status)) return status

    if (priced || status !== entry.job.status || progress !== entry.job.progress) {
      entry.job.status = status
      entry.job.progress = progress
      emit(entry)
    }

    return status
  }
  const pollUntilFinished = async (
    entry: Entry,
    bound: JobAccount,
    remoteId: string,
    submitted?: RemoteJob,
  ): Promise<{ remote: RemoteJob; status: JobStatus } | null> => {
    let remote = submitted ?? (await withRetry(() => bound.runner.poll(remoteId, targetOf(entry))))
    let status = advance(entry, remote)
    while (!isFinished(status)) {
      await options.sleep(pollDelay())
      if (entry.cancelled) {
        await abandon(entry, bound, remoteId)
        return null
      }
      remote = await withRetry(() => bound.runner.poll(remoteId, targetOf(entry)))
      status = advance(entry, remote)
    }
    return { remote, status }
  }
  const settleRemoteFailure = (
    entry: Entry,
    remote: RemoteJob,
    status: Exclude<JobStatus, 'succeeded'>,
  ): void => {
    entry.done = true
    settle(entry, status, status === 'failed' ? (remote.error ?? 'rejected') : undefined)
  }
  const collectSuccessful = async (
    entry: Entry,
    bound: JobAccount,
    remote: RemoteJob,
  ): Promise<void> => {
    if (remote.text !== undefined) entry.job.text = remote.text
    if (remote.note !== undefined) entry.job.note = remote.note
    if (entry.discreet) {
      entry.job.assetIds = [...remote.assetIds]
      entry.done = true
      settle(entry, 'succeeded')
      return
    }
    if (entry.projectPath !== null && entry.projectPath !== options.projectPath()) {
      entries.delete(entry.job.id)
      journalWaiting(entry.job.label, entry.projectPath)
      announceList()
      return
    }
    try {
      const landed = await bound.collect(entry.job, remote.assetIds, entry.authored)
      entry.job.assetIds = landed.ids
      entry.done = true
      settle(entry, 'succeeded', undefined, landed.workspaces)
    } catch {
      settle(entry, 'failed', 'storage')
    }
  }
  const follow = async (
    entry: Entry,
    bound: JobAccount,
    remoteId: string,
    submitted?: RemoteJob,
  ): Promise<void> => {
    if (entry.cancelled) return await abandon(entry, bound, remoteId)
    entry.job.remoteId = remoteId
    const result = await pollUntilFinished(entry, bound, remoteId, submitted)
    if (result === null) return
    const { remote, status } = result
    if (status !== 'succeeded') {
      settleRemoteFailure(entry, remote, status)
      return
    }
    await collectSuccessful(entry, bound, remote)
  }
  const handleExecutionFailure = (entry: Entry, error: unknown): void => {
    if (entry.cancelled) {
      entry.done = true
      settle(entry, 'cancelled')
      return
    }
    const failure = apiFailureOf(error)
    const canResume =
      entry.remoteId !== null && !SETTLED_FOR_GOOD.has(failure) && entry.resumes < MAX_RESUMES
    if (canResume) {
      entry.resumes += 1
      queue.push(entry.job.id)
      return
    }
    entry.done = SETTLED_FOR_GOOD.has(failure)
    settle(entry, 'failed', failure)
  }
  const execute = async (entry: Entry): Promise<void> => {
    const { account: bound, remoteId } = entry
    if (!bound) {
      settle(entry, 'failed', 'missing')
      return
    }

    try {
      if (remoteId !== null) return await follow(entry, bound, remoteId)

      const target = targetOf(entry)
      const body = await withRetry(() => options.resolveAssetInputs(entry.body, target))
      const submitted = await withRetry(() => bound.runner.submit(target, body))
      entry.remoteId = submitted.jobId
      if (submitted.cost !== undefined) entry.job.cost = submitted.cost
      if (submitted.costUnit !== undefined) entry.job.costUnit = submitted.costUnit

      entry.body = {}
      remember()

      await follow(entry, bound, submitted.jobId, submitted)
    } catch (error) {
      handleExecutionFailure(entry, error)
    }
  }
  const onThisMachine = options.isLocalTarget ?? (() => false)
  const laneOf = (targetId: string): { name: string; limit: number } | null =>
    options.lane?.(targetId) ?? null
  const canStart = (entry: Entry): boolean => {
    const own = laneOf(entry.job.targetId)
    if (own && (laneRunning.get(own.name) ?? 0) >= own.limit) return false

    return onThisMachine(entry.job.targetId)
      ? localRunning < (options.localConcurrency?.() ?? 1)
      : running - localRunning < options.concurrency()
  }
  const executeAndRelease = async (
    entry: Entry,
    local: boolean,
    own: { name: string; limit: number } | null,
  ): Promise<void> => {
    try {
      await execute(entry)
    } finally {
      running--
      if (local) localRunning--
      if (own) laneRunning.set(own.name, Math.max(0, (laneRunning.get(own.name) ?? 1) - 1))
      pump()
    }
  }
  const pump = (): void => {
    while (true) {
      const index = queue.findIndex(id => {
        const entry = entries.get(id)
        return !entry || entry.cancelled || canStart(entry)
      })
      if (index < 0) return

      const id = queue.splice(index, 1)[0]
      if (id === undefined) return

      const entry = entries.get(id)
      if (!entry) continue

      if (entry.cancelled) {
        settle(entry, 'cancelled')
        continue
      }

      const local = onThisMachine(entry.job.targetId)
      const own = laneOf(entry.job.targetId)
      running++
      if (local) localRunning++
      if (own) laneRunning.set(own.name, (laneRunning.get(own.name) ?? 0) + 1)
      void executeAndRelease(entry, local, own)
    }
  }
  const enqueue = (
    target: JobTarget,
    label: string,
    body: Record<string, unknown>,
    discreet: boolean,
    settledCallback: ((job: Job) => void) | null,
    authored: AuthoredPrompt | null,
  ): Job => {
    const active = options.accounts.active()
    const entry = newEntryOf({
      target,
      label,
      body,
      discreet,
      settled: settledCallback,
      authored,
      account: active,
      projectPath: options.projectPath(),
      cancellable: options.cancellableTarget?.(target.id) !== false,
      id: options.newId(),
      createdAt: options.now(),
    })
    entries.set(entry.job.id, entry)
    queue.push(entry.job.id)
    emit(entry)
    if (!discreet) announceList()
    pump()

    return entry.job
  }
  const cancelRunning = async (entry: Entry): Promise<void> => {
    // 🛑 Read out FIRST because `?.` short-circuited the WHOLE chain: an entry with no account
    const runner = entry.account?.runner
    if (entry.remoteId && runner) {
      try {
        await runner.cancel(entry.remoteId, targetOf(entry))
        entry.done = true
        remember()
      } catch {
        // A refused cancellation leaves the job resumable on the next launch.
      }
    }
  }
  async function cancelJob(jobId: string): Promise<void> {
    const entry = entries.get(jobId)
    if (!entry || isFinished(entry.job.status) || entry.cancelled) return
    entry.cancelled = true
    const position = queue.indexOf(jobId)
    if (position < 0) return await cancelRunning(entry)
    queue.splice(position, 1)
    const { account, remoteId } = entry
    if (account && remoteId) return await abandon(entry, account, remoteId)
    settle(entry, 'cancelled')
  }

  // 🛑 An already-aborted signal is not an edge: a stop pressed while the queue was full arrives
  function watchForAbort(jobId: string, signal?: AbortSignal): void {
    if (!signal) return
    if (signal.aborted) void cancelJob(jobId)
    else signal.addEventListener('abort', () => void cancelJob(jobId), { once: true })
  }

  return {
    submit: (target, label, body, authored) =>
      enqueue(target, label, body, false, null, authored ?? null),

    run: (target, label, body, signal) =>
      new Promise<Job>(resolve => {
        const job = enqueue(target, label, body, true, resolve, null)
        // 🛑 The id exists only once it is queued, so the stop is armed HERE and nowhere higher:
        watchForAbort(job.id, signal)
      }),

    resume: stored => {
      let added = false

      for (const remembered of stored) {
        if (entries.has(remembered.id)) continue

        // 🛑 Cancellability is read again because persisted jobs do not carry that capability.
        const entry = resumedEntryOf(
          remembered,
          options.accounts.of(remembered.accountId),
          options.cancellableTarget?.(remembered.targetId) !== false,
        )
        entries.set(entry.job.id, entry)
        queue.push(entry.job.id)
        added = true
      }

      if (added) announceList()

      pump()
    },

    cancel: cancelJob,

    list: listed,

    runningIn: projectPath =>
      [...entries.values()].filter(
        entry =>
          entry.projectPath === projectPath && !entry.discreet && !isFinished(entry.job.status),
      ).length,
  }
}
