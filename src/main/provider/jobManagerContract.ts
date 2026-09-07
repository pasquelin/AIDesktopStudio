import type { ApiFailure, JobFailure } from '@shared/domain/failure'
import { clamp } from '@shared/numeric'
import type { WorkspaceId } from '@shared/domain/workspace'
import {
  INTERACTIVE_REQUESTS_PER_MINUTE,
  type Job,
  type JobNote,
  type JobProgress,
  type JobStatus,
  type JobTarget,
} from '@shared/domain/job'
import type { ActivityReport } from '@main/project/activityLog'
import type { AuthoredPrompt } from '@shared/domain/projectContext'
import type { PersistedJob } from './persistedJob'
import { ORDINARY_REQUESTS_PER_WINDOW } from './rateLimiter'

/**
 * A job as the runner hands it over, reduced to what the studio reads. Whichever endpoint ran
 * it, and however that endpoint reports its outputs — see `outputsOf` in `runner.ts`.
 */
export type RemoteJob = {
  jobId: string
  status: string
  progress?: number
  /** What it has produced so far, as remote asset ids. */
  assetIds: readonly string[]
  /** On a submission, and on a poll too — which is where a resumed job finds its own. */
  cost?: number
  /** What the figure above is quoted in. Absent means Scenario's creative units — see `Job`. */
  costUnit?: string
  /** A local runner names why it failed. Absent on the cloud, which has no code of its own. */
  error?: JobFailure
  /**
   * What a generation that writes NO FILE answered — a script, today, and nothing else. Carried
   * here rather than fetched after: there is no asset to read it back off.
   */
  text?: string
  /** A sentence for the job's own row — see `Job.note`, which it is copied onto. */
  note?: JobNote
}

export type JobRunner = {
  submit: (target: JobTarget, body: Record<string, unknown>) => Promise<RemoteJob>
  /**
   * The target rides along, and a runner needing neither may take one argument: a job picked up
   * from a previous session reaches a runner that has never heard of its id.
   */
  poll: (jobId: string, target: JobTarget) => Promise<RemoteJob>
  cancel: (jobId: string, target: JobTarget) => Promise<void>
  /**
   * The manager has the outcome and will never poll this one again — whatever the runner kept to
   * answer with may go. Optional: a runner that keeps nothing has nothing to release.
   */
  forget?: (jobId: string, target: JobTarget) => void
}

/**
 * What a collected generation left in the project: the local ids, and the shelves they landed
 * in — deduplicated, in the order the outputs came back.
 *
 * The shelves are returned rather than recomputed, because the collector is the only place that
 * ever knows them: it reads each output's type off the API answer and files it accordingly. An
 * App produces what it produces, whichever space it was launched from, so where the result went
 * is the one thing the person waiting cannot guess.
 */
export type CollectedOutputs = {
  ids: string[]
  workspaces: WorkspaceId[]
}

/**
 * Brings a finished job's outputs into the project. Separate from the runner because it is
 * not an API call but a disk write — and because a job is not done until it lands.
 */
export type AssetCollector = (
  job: Job,
  remoteAssetIds: readonly string[],
  /**
   * What the person actually typed, when the project's context lengthened it. The API echoes back
   * what it was SENT, and naming a file after that gives every asset of a project the same name.
   */
  authored: AuthoredPrompt | null,
) => Promise<CollectedOutputs>

/**
 * What a job addresses its account through, captured at submission so that it finishes on the
 * one that launched it. Resolved per call instead, an account switch mid-flight has the next
 * poll ask the new key about the previous account's job id: the API answers 404, no retry can
 * fix a 404, and a ten-minute video generation dies on a switch unrelated to it.
 *
 * `collect` is here for the one dependency of its own that is account-scoped — retrieving the
 * outputs is an API call, and a signed URL fetched under the wrong key answers 404 too.
 */
export type JobAccount = {
  runner: JobRunner
  collect: AssetCollector
}

/** The account in force, named so a job outliving the session can find its way back to it. */
type ActiveAccount = { id: string; account: JobAccount }

type JobAccounts = {
  /** `null` when no credentials are available. Read once per job, at submission. */
  active: () => ActiveAccount | null
  /** The account a resumed job was submitted on, or `null` if the studio no longer holds it. */
  of: (accountId: string) => JobAccount | null
}

export type JobManagerDeps = {
  accounts: JobAccounts
  /** The project a job's outputs belong in, captured at submission like the account is. */
  projectPath: () => string | null
  /**
   * What a project is CALLED — the name of its folder, and there is nowhere else to read it.
   */
  projectNameOf: (projectPath: string) => string
  /**
   * Where unfinished jobs are kept so that closing the studio does not abandon them. `handled`
   * is every job this session is answering for, finished ones included: what the store may
   * replace, as against the entries of a project nobody has reopened.
   */
  persist: (jobs: readonly PersistedJob[], handled: readonly string[]) => void
  concurrency: () => number
  /**
   * How many jobs that run on THIS machine may occupy the GPU at once. Cloud jobs ignore it.
   * Absent, and a target this machine holds, means one — two exclusive doors on one GPU fight.
   */
  localConcurrency?: () => number
  /** Whether the target is a model this machine holds. Absent, every job uses `concurrency`. */
  isLocalTarget?: (targetId: string) => boolean
  /**
   * Whether the service behind a target stops a task it has started. Absent, every one does —
   * which is what the studio assumed before a cloud that does not.
   */
  cancellableTarget?: (targetId: string) => boolean
  /**
   * A per-category ceiling beside the global bound — `null` for a target counted only against
   * `concurrency()`. One cloud allows ONE picture at a time while ten of its 3D slots sit idle,
   * which a single number for a whole cloud cannot say.
   */
  lane?: (targetId: string) => { name: string; limit: number } | null
  maxRetries: () => number
  /**
   * The pictures a body names, turned into what the TARGET's runtime takes: an id the API
   * answers to — sending the file up where it has no twin yet — or a path on this disk for a
   * model that runs here. The target is not decoration, and neither is the injection: sending a
   * picture to an account to run a generation that never leaves the machine is a transfer nobody
   * asked for, and this file knows nothing of the catalogue or the cloud backend.
   */
  resolveAssetInputs: (
    body: Record<string, unknown>,
    target: JobTarget,
  ) => Promise<Record<string, unknown>>
  onProgress: (progress: JobProgress) => void
  /** Told when the list gains or loses an entry. See `onJobsChanged` in `shared/ipc.ts`. */
  onListChanged: (jobs: readonly Job[]) => void
  /** Where a finished generation says what became of it. See `ActivityLog`. */
  record: (report: ActivityReport) => void
  now: () => string
  newId: () => string
  sleep: (ms: number) => Promise<void>
  pollIntervalMs?: number
  backoffBaseMs?: number
  /** What a retry can fix. Defaults to the Scenario SDK's reading, which is blind to the rest. */
  retryable?: (error: unknown) => boolean
  /** How long a service asked to be left alone for. See `RetryOptions.delayFor`. */
  retryDelayFor?: (error: unknown) => number | null
}

export type JobManager = {
  submit: (
    target: JobTarget,
    label: string,
    body: Record<string, unknown>,
    authored?: AuthoredPrompt | null,
  ) => Job
  /**
   * Runs a model the user did not ask to watch, and answers what became of it.
   *
   * For the assistant's own reasoning: it needs the same queue, the same concurrency bound and
   * the same retries as any other call to the API — polling anywhere else is a bug — but none of
   * what surrounds a generation. Nothing is collected, listed, journalled or persisted.
   *
   * The job carries the API's own asset ids rather than local ones, because nothing was
   * downloaded: the answer is read from the asset itself.
   */
  run: (
    target: JobTarget,
    label: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<Job>
  cancel: (jobId: string) => Promise<void>
  list: () => Job[]
  /**
   * How many unfinished generations belong to a project — what the studio asks about before
   * leaving it. Counted by `projectPath` and not off `list()`: a job whose own project was
   * closed earlier is still being polled, and would put a stranger in that count.
   *
   * A discreet job is machinery and never counts: nobody asked for it and nobody is waiting.
   */
  runningIn: (projectPath: string) => number
  /**
   * Picks up jobs left running by a previous session: polling starts again, and one that
   * finished while the studio was closed is collected into the project it was meant for.
   */
  resume: (jobs: readonly PersistedJob[]) => void
}

export const DEFAULT_POLL_INTERVAL_MS = 2000

/**
 * What the poll loop alone may spend.
 *
 * Left at two seconds whatever the load, four concurrent jobs ask for 120 a minute against the
 * hundred the API grants: the limiter then holds every poll, the SDK retries, and a generation
 * that is running and being paid for is reported as a rate-limit failure fifteen seconds in.
 *
 * Derived and not written down: the budget it stays under is three constants of `rateLimiter.ts`
 * away, and stated as prose it would go quietly false the day one of them is tuned — with that
 * same failure as the symptom.
 */
export const POLL_REQUESTS_PER_MINUTE =
  ORDINARY_REQUESTS_PER_WINDOW - INTERACTIVE_REQUESTS_PER_MINUTE

/** Finished jobs kept for the bar's history. Beyond this a long session is just a leak. */
export const RETAINED_JOBS = 200

/**
 * The one answer that settles a job's fate for good: the API says it has no such job.
 *
 * A short list rather than `isRetryable`, which answers a different question — whether asking
 * again might work — and agrees with this one only by coincidence. Keeping the note is the
 * default because the two mistakes do not cost the same: an entry replayed for nothing is
 * noise, an entry dropped is a paid generation abandoned. So `missing` and `invalid-credentials`
 * stay, the user may yet re-add the key and the fingerprint naming the account is the same one;
 * `forbidden` stays, a scope the key lost says nothing about a job that is still running and
 * still billed; and `unexpected` stays, which this `catch` also reaches for anything thrown
 * outside the SDK. `rejected` is not here because it cannot arrive here — the API pronouncing a
 * job failed is `follow`'s business, and it settles `done` itself.
 */
export const SETTLED_FOR_GOOD: ReadonlySet<ApiFailure> = new Set(['not-found'])

/**
 * How many times a job may go back in the queue after losing its connection mid-follow. Past
 * this it is reported failed, and the note left on disk lets the next launch collect its output
 * — the outcome the studio had before, minus the false report on a short outage.
 */
export const MAX_RESUMES = 3

/**
 * The API spells eight states, the studio has five. `warming-up` and `finalizing` are running
 * states, not states of their own; an unknown one is treated as running, so a status Scenario
 * adds keeps the job polling instead of declaring an outcome nobody understood.
 *
 * `succeeded` and `failed` are insurance, not observation: the SDK types spell eight states and
 * the prose guide has been seen using these two instead. They cost two rows and no collision —
 * and without them, the guide being right means a job polls for ever while holding its place in
 * the concurrency count.
 */
const STATUS: Record<string, JobStatus> = {
  pending: 'queued',
  queued: 'queued',
  'warming-up': 'running',
  'in-progress': 'running',
  finalizing: 'running',
  running: 'running',
  success: 'succeeded',
  succeeded: 'succeeded',
  failure: 'failed',
  failed: 'failed',
  canceled: 'cancelled',
  /**
   * 🛑 The three a second cloud spells and Scenario does not — plus its own spelling of
   * cancelled, with two `l`s. Unmapped, each is read as RUNNING and polls for ever while holding
   * its slot: one banned picture would block a lane whose ceiling is one for the whole session.
   */
  cancelled: 'cancelled',
  banned: 'failed',
  expired: 'failed',
}

export function jobStatusOf(remoteStatus: string): JobStatus {
  // Own keys only: a status spelled like an inherited member would otherwise resolve to one.
  return Object.hasOwn(STATUS, remoteStatus) ? (STATUS[remoteStatus] ?? 'running') : 'running'
}

/**
 * A progress reading above this is a percentage, below it a fraction. Not 1: generation
 * overshoots its own scale — `ProgressBar` is clamped because a job reports 1.02 — so dividing
 * from 1 would show the end of a generation as 1 %.
 */
const PERCENTAGE_ABOVE = 2

/**
 * Progress as the fraction `Job.progress` promises, which several surfaces sum.
 *
 * The SDK types say 0–1; the prose guide has been seen saying 0–100, and reading the larger
 * scale costs nothing if the types are right. Anything outside either scale
 * is out of contract and clamped rather than passed on — NaN included, which would otherwise
 * emit on every poll, `NaN !== NaN` defeating the guard that only emits on change.
 */
export function jobProgressOf(reported: number): number {
  if (!Number.isFinite(reported)) return 0

  const fraction = reported > PERCENTAGE_ABOVE ? reported / 100 : reported
  return clamp(fraction, 0, 1)
}

export type Entry = {
  job: Job
  /**
   * A job nobody asked to see.
   *
   * The assistant runs a text model to work out what a sentence meant, and that is machinery,
   * not a generation: it must not appear in the jobs bar, must not be written to the journal,
   * must not be resumed on the next launch, and above all its output must not be collected —
   * the answer is a fragment of JSON, and the asset browser is for the user's own work.
   *
   * Everything else it keeps: the queue, the concurrency bound, the retries, the single poll
   * loop. That is the whole reason it lives here rather than in a poller of its own.
   */
  discreet: boolean
  /** Resolved once the job has settled, for a caller that awaits its outcome rather than watching. */
  settled: ((job: Job) => void) | null
  /**
   * How many times the connection has been lost while FOLLOWING this job. Bounded because the
   * queue is not a retry loop: without a ceiling, a network that stays down puts the same job
   * back for ever, and it holds a concurrency slot on every pass.
   */
  resumes: number
  /** Captured when the user asked for it: the credits and the output belong to that account. */
  account: JobAccount | null
  /** Kept beside the account itself, because it is the half that survives the session. */
  accountId: string | null
  /** Likewise: where the outputs go, decided when the job was asked for, not when it lands. */
  projectPath: string | null
  body: Record<string, unknown>
  /** Kept past `body`, which is dropped on submit: the collector needs it when the outputs land. */
  authored: AuthoredPrompt | null
  remoteId: string | null
  cancelled: boolean
  /**
   * Whether the API has said what became of it, and its outputs are where they belong.
   *
   * The one thing that decides whether the note may be dropped. A job can fail here while it is
   * alive and paid for over there — a poll past its retry budget, a key the keychain would not
   * hand back, a disk that refused the download — and forgetting it then is the exact loss this
   * whole mechanism exists to prevent.
   */
  done: boolean
}

/**
 * Owns the queue, the concurrency and the polling. The only place in the codebase that polls:
 * `job.wait()` from the SDK reports no progress and gives up after two minutes, which a video
 * generation exceeds on its own — see CLAUDE.md.
 */
