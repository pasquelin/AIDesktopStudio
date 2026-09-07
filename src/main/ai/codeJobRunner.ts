import { chatModelOf, type CloudProviderId, type HttpChat } from '@shared/domain/aiCloud'
import {
  CODE_API_FIELD,
  CODE_MAX_TOKENS,
  CODE_SOURCE_FIELD,
  codeChatPrompt,
  cloudOfModelId,
  unfencedCode,
} from '@shared/domain/codeGeneration'
import type { JobFailure } from '@shared/domain/failure'
import { PROMPT_FIELD_KEY } from '@shared/domain/localFields'
import type { JobRunner, RemoteJob } from '@main/provider/jobManager'
import type { Retry } from '@main/provider/retry'
import { askCloudChat, CloudRefused, type CloudPoster } from './cloudChat'
import { forgetSettled, knobsIn, textIn } from './localJobRunner'

/**
 * Scripts written by a chat cloud, behind the shape the job manager already speaks. What comes
 * back is TEXT, on `RemoteJob.text` — there is nothing to collect.
 *
 * What one job amounts to here; the statuses are the API's own words — see `JobStatus`.
 */
type CodeJob = {
  status: 'in-progress' | 'success' | 'failure'
  abort: AbortController
  answer: string
  /** A code, never a message — the renderer translates it. */
  error: JobFailure | null
}

export type CodeJobDeps = {
  /** How this cloud is talked to, or nothing when the id names none. */
  chatOf: (cloud: CloudProviderId) => HttpChat | null
  /** The key held for it, or nothing when no account is. */
  keyOf: (cloud: CloudProviderId) => string | null
  /** Which model of that cloud answers. Read per job: it is a setting, and settings change. */
  modelOf: (cloud: CloudProviderId) => string | undefined
  post: CloudPoster
  /** The backoff of the studio, so a 429 waits rather than failing the generation — `retry.ts`. */
  retry: Retry
  newId: () => string
  log: (level: 'info' | 'warn', message: string) => void
}

export type CodeJobRunner = JobRunner & {
  /** Whether this job id is one of ours — what routes the poll and the collection. */
  owns: (jobId: string) => boolean
}

function maxTokensIn(body: Record<string, unknown>): number {
  const held = body['maxTokens']
  return typeof held === 'number' && held > 0 ? held : CODE_MAX_TOKENS
}

/** A job as it enters the map: running, or already refused for want of an account. */
function entered(error: JobFailure | null): CodeJob {
  return {
    status: error === null ? 'in-progress' : 'failure',
    abort: new AbortController(),
    answer: '',
    error,
  }
}

/**
 * A code, never a message: a cloud's own text embeds the request that produced it, key and all.
 * The STATUS is what a person can act on — a key to fix, a quota to wait out, an outage.
 */
function failureOf(error: unknown): JobFailure {
  if (error instanceof CloudRefused) {
    if (error.status === 401 || error.status === 403) return 'invalid-credentials'
    if (error.status === 429) return 'rate-limited'
    if (error.status >= 500) return 'server'
    return 'rejected'
  }

  // A fetch that never reached anyone: `TypeError` is what the platform throws for it.
  return error instanceof TypeError ? 'network' : 'rejected'
}

/** What waiting can fix, for a chat cloud — the studio's own rule, read off the status. */
export function isRetryableCloudChat(error: unknown): boolean {
  const failure = failureOf(error)
  return failure === 'rate-limited' || failure === 'server' || failure === 'network'
}

export function createCodeJobRunner(deps: CodeJobDeps): CodeJobRunner {
  const jobs = new Map<string, CodeJob>()

  const answered = (jobId: string): RemoteJob => {
    const job = jobs.get(jobId)
    if (!job) return { jobId, status: 'failure', assetIds: [], error: 'rejected' }

    return {
      jobId,
      status: job.status,
      progress: job.status === 'in-progress' ? 0 : 1,
      assetIds: [],
      ...(job.error === null ? {} : { error: job.error }),
      ...(job.answer === '' ? {} : { text: job.answer }),
    }
  }

  const write = async (
    jobId: string,
    chat: HttpChat,
    key: string,
    body: Record<string, unknown>,
  ): Promise<void> => {
    const job = jobs.get(jobId)
    if (!job) return

    const prompt = codeChatPrompt({
      prompt: textIn(body, PROMPT_FIELD_KEY) ?? '',
      source: textIn(body, CODE_SOURCE_FIELD),
      api: textIn(body, CODE_API_FIELD) ?? '',
    })

    try {
      // Through the studio's backoff: a 429 waits and comes back, where a bare call would fail
      // the generation — `CLAUDE.md` asks for exponential backoff on 429 and 5xx.
      const answer = await deps.retry(async () =>
        askCloudChat(
          {
            chat,
            key,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            json: false,
            ...knobsIn(body),
            maxTokens: maxTokensIn(body),
            signal: job.abort.signal,
          },
          deps.post,
        ),
      )
      job.answer = unfencedCode(answer.text)
      job.status = 'success'
    } catch (error) {
      deps.log('warn', `writing a script failed: ${String(error)}`)
      job.status = 'failure'
      job.error = failureOf(error)
    }
  }

  return {
    owns: jobId => jobs.has(jobId),

    // The identity is what routes a poll and a collection; the script is what weighed — the 64
    // remembered ones measured 1 024 000 B at the 4 096-token ceiling.
    forget: jobId => {
      const job = jobs.get(jobId)
      if (job) job.answer = ''
    },

    submit: async (target, body) => {
      const jobId = `code_${deps.newId()}`
      const cloud = cloudOfModelId(target.id)
      const chat = cloud === null ? null : deps.chatOf(cloud)
      const key = cloud === null ? null : deps.keyOf(cloud)

      // Refused as a FINISHED job rather than thrown: the manager words an outcome, and a throw
      // here would be retried against an account that is still not held.
      jobs.set(jobId, entered(cloud === null || chat === null || key === null ? 'missing' : null))
      // Pruned on BOTH paths: pressing Generate with no key configured grew the map for the life
      // of the process, and nothing else ever visits it.
      forgetSettled(jobs)
      if (cloud === null || chat === null || key === null) return answered(jobId)

      // Not awaited: the manager submits, then polls — an awaited round trip would hold the
      // submission open for the whole of a generation and report no progress at all.
      void write(jobId, { ...chat, model: chatModelOf(deps.modelOf(cloud), chat.model) }, key, body)
      return answered(jobId)
    },

    poll: async jobId => answered(jobId),

    // The abort alone: the round trip rejects on it, and `write`'s own catch settles the job —
    // settling it here as well would race that catch for the outcome.
    cancel: async jobId => {
      jobs.get(jobId)?.abort.abort()
    },
  }
}
