import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { isFinished, type Job } from '@shared/domain/job'
import { DEFAULT_USAGE_PERIOD, USAGE_PERIODS, type UsagePeriod } from '@shared/domain/usage'
import { useJobs } from '@/stores/jobs'
import { withBridge, type ActionHandlers } from './actionHandler'
import { numberOf, recordOf, textOf } from './actionInputs'

/**
 * A generation, from what a model accepts to what came out of it.
 *
 * The jobs read here are the studio's own replica, kept up to date by the progress events the
 * `JobManager` broadcasts. Nothing here polls the API — one poller is the invariant.
 */

const DEFAULT_WAIT_MS = 60_000

function usagePeriodOf(input: Record<string, unknown>): UsagePeriod {
  const value = numberOf(input, 'days')
  return USAGE_PERIODS.find(period => period === value) ?? DEFAULT_USAGE_PERIOD
}

/** What a caller does about a job nobody answers to — spelled once for the three sites. */
const noJob = (jobId: string): string =>
  `no generation "${jobId}" in this studio — jobs.list answers the ones it holds, each with its id`

function jobOf(jobId: string): Job | null {
  return useJobs.getState().jobs.find(job => job.id === jobId) ?? null
}

/**
 * Waits for a job to reach a terminal state, on the store rather than on the API.
 *
 * A timeout answers the job as it stands rather than a refusal: "still running after a minute" is
 * an answer a client can act on, and a refusal would lose the progress along with it.
 */
function waitForJob(input: Record<string, unknown>): Promise<ActionOutcome> {
  const jobId = textOf(input, 'jobId') ?? ''
  const job = jobOf(jobId)
  if (!job) return Promise.resolve(refused('notFound', noJob(jobId)))
  if (isFinished(job.status)) return Promise.resolve({ ok: true, data: job })

  return new Promise(resolve => {
    /**
     * Both ways out are created before anything can take one, and `settle` is a declaration so it
     * is hoisted above them. `zustand` does not notify on subscribe — if it ever did, the listener
     * would throw on `timer` rather than resolve while leaving it running, which is the failure
     * worth having of the two.
     */
    const timer = setTimeout(
      () => settle(jobOf(jobId) ?? job),
      numberOf(input, 'timeoutMs') ?? DEFAULT_WAIT_MS,
    )

    const stop = useJobs.subscribe(state => {
      const seen = state.jobs.find(one => one.id === jobId)
      // Gone from the list is not a failure: a project closing takes its jobs with it, and the
      // last state this saw is more useful to answer than a refusal.
      if (!seen) settle(job)
      else if (isFinished(seen.status)) settle(seen)
    })

    function settle(answer: Job): void {
      stop()
      clearTimeout(timer)
      resolve({ ok: true, data: answer })
    }
  })
}

async function cancelJob(input: Record<string, unknown>): Promise<ActionOutcome> {
  const jobId = textOf(input, 'jobId') ?? ''
  const job = jobOf(jobId)
  if (!job) return refused('notFound', noJob(jobId))

  // 🛑 Refused rather than answered « done »: some services do not stop a task they have
  // started, and `ok` here would have a caller believe it stopped a spend that runs to its end
  // and is billed. Queued is another matter — nothing has reached the service yet.
  if (job.cancellable === false && job.status !== 'queued')
    return refused(
      'declined',
      'the service running this generation does not stop one it has started: it will run to its end and be billed',
    )

  await useJobs.getState().cancel(jobId)
  return { ok: true }
}

/**
 * Both of these ask the API about something that may not be there. `failed` rather than
 * `badInput`: a rejection here is a model id nothing declares AND a network that dropped, and
 * nothing at this level tells the two apart — naming the caller's parameters guesses wrong half
 * the time.
 */
async function asking(run: () => Promise<ActionOutcome>): Promise<ActionOutcome> {
  try {
    return await run()
  } catch {
    return refused(
      'failed',
      'the provider did not answer — the model id may name nothing it publishes, or the network dropped; models.search answers which ids there are',
    )
  }
}

export const JOB_HANDLERS: ActionHandlers = {
  'job.waitForCloudGeneration': waitForJob,
  'job.cancelCloudGeneration': cancelJob,

  'job.readCloudGeneration': input => {
    const job = jobOf(textOf(input, 'jobId') ?? '')
    return job ? { ok: true, data: job } : refused('notFound', noJob(textOf(input, 'jobId') ?? ''))
  },

  'models.readGenerationModelFields': input =>
    asking(() =>
      withBridge(bridge => bridge.provider.describeModel(textOf(input, 'modelId') ?? '')),
    ),

  // `null` is a legitimate answer and travels as one: the API declines to price some models, and
  // a figure invented to fill the field would be worse than admitting there is none.
  'cost.estimate': input =>
    asking(() =>
      withBridge(bridge =>
        bridge.provider.estimateCost(
          { id: textOf(input, 'modelId') ?? '' },
          recordOf(input, 'parameters') ?? {},
        ),
      ),
    ),

  'usage.report': input => withBridge(bridge => bridge.provider.usageReport(usagePeriodOf(input))),

  // `false` says nothing was running under that id, which is a click that arrived late rather
  // than a failure — so it travels as the answer it is.
  'task.cancelLocalTask': input =>
    withBridge(bridge => bridge.tasks.cancel(textOf(input, 'taskId') ?? '')),
}
