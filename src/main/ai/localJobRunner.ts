import { ENGINE_FAILURES, type JobFailure } from '@shared/domain/failure'
import { codeIn, messageOf } from '@shared/guards'
import type { AssetType } from '@shared/domain/asset'
import {
  assetTypeOfModality,
  producesFile,
  PROMPT_FIELD_KEY,
  type ProducingModality,
} from '@shared/domain/localFields'
import {
  CODE_API_FIELD,
  CODE_SOURCE_FIELD,
  codeChatPrompt,
  unfencedCode,
} from '@shared/domain/codeGeneration'
import { capabilitiesIn, distributionStatusOf, type LocalModel } from '@shared/domain/localModel'
import { CODE_FAMILY } from '@shared/domain/model'
import type { JobRunner, RemoteJob } from '@main/provider/jobManager'
import type { ChatRequest, ChatTurn, GenerateResult } from './localRuntimes'
import { NetworkInterrupted, isNetworkError } from './modelInstall'

/**
 * Generations run on THIS machine, behind the shape the job manager already speaks.
 *
 * Routed by MODALITY and not by calling `chat` outright: an image is not a sentence, and a runtime
 * that produces one answers a PATH. Which of the two a model wants is on the manifest.
 */

/** What a job on this machine amounts to. Statuses are the API's own words — see `JobStatus`. */
type LocalJob = {
  status: 'in-progress' | 'success' | 'failure'
  progress: number
  abort: AbortController
  /** What the model answered, once it has. Read through `outputOf`. */
  answer: string
  /** A code, never a message — the renderer translates it. */
  error: JobFailure | null
  /** Where a generation landed, for whoever files it. Empty for a job that produced a sentence. */
  produced: LocalProduction | null
}

/**
 * A file a generation wrote, with what it was asked for.
 *
 * The prompt and the shelf travel WITH the file: the collector runs turns later, when the body
 * that carried them is gone, and naming an asset after the model that answered rather than after
 * what was asked makes a shelf where everything of one model reads the same.
 */
type LocalProduction = GenerateResult & {
  readonly type: AssetType
  readonly prompt: string
}

export type LocalJobDeps = {
  /** The one round trip. Rejects on an abort, which is what `cancel` turns into a failure. */
  chat: (request: ChatRequest) => Promise<string>
  /**
   * Produces something that is not a sentence. Absent for a model whose loader has no `generate`,
   * which is what makes an image target refuse readably instead of answering an empty string.
   */
  generate: (request: LocalGenerateRequest) => Promise<GenerateResult>
  modelOf: (modelId: string) => LocalModel | null
  newId: () => string
  log: (level: 'info' | 'warn', message: string) => void
}

type LocalGenerateRequest = {
  readonly model: string
  /** Which door answers, and what extension the file lands under. Read off the manifest. */
  readonly modality: ProducingModality
  readonly prompt: string
  readonly fields: Readonly<Record<string, unknown>>
  readonly jobId: string
  readonly onProgress: (ratio: number) => void
  readonly signal: AbortSignal
}

/**
 * How many finished jobs are remembered. `owns` reads these maps, so a job cannot simply be
 * dropped when it settles — the poll that follows would then be routed to a runner that never
 * ran it. Shared with the code runner, which answers `owns` the same way.
 */
const REMEMBERED = 64

/**
 * Drops the OLDEST settled jobs down to the ceiling — oldest first, which is what a `Map`
 * iterates. Settled only: evicting a running job makes `owns` answer no.
 */
export function forgetSettled(jobs: Map<string, { status: string }>): void {
  for (const [jobId, job] of jobs) {
    if (jobs.size <= REMEMBERED) return
    if (job.status !== 'in-progress') jobs.delete(jobId)
  }
}

export type LocalJobRunner = JobRunner & {
  /** What a finished job answered, or nothing — for whoever files it. */
  outputOf: (jobId: string) => string | null
  /** The file a finished generation wrote, or nothing. It is the caller's to file, and to delete. */
  producedBy: (jobId: string) => LocalProduction | null
  /** Whether this runner is the one that owns a job id, which is how a caller routes a poll. */
  owns: (jobId: string) => boolean
}

/** The prompt a body carries, under the key `localFields.ts` gives every modality. */
function promptOf(body: Record<string, unknown>): string {
  return textIn(body, PROMPT_FIELD_KEY) ?? ''
}

/** A text a body carries, or nothing — an absent field and an empty one say the same thing. */
export function textIn(body: Record<string, unknown>, key: string): string | null {
  const held = body[key]
  return typeof held === 'string' && held.length > 0 ? held : null
}

/** The codes a load or a runtime throws by name, read whole or after the `: ` a wrapper adds. */
const CODED_FAILURES: readonly JobFailure[] = ['incomplete-model', 'network', ...ENGINE_FAILURES]

function jobFailureOf(error: unknown): JobFailure {
  if (error instanceof NetworkInterrupted || isNetworkError(error)) return 'network'
  const text = messageOf(error)
  const coded = codeIn(text, CODED_FAILURES)
  if (coded) return coded
  if (text.includes('no file named')) return 'incomplete-model'
  return 'rejected'
}

/**
 * The three knobs `localFieldsOf('text', …)` publishes, as the form filled them. Absent stays
 * absent, so a door keeps its own default rather than one written here.
 */
export function knobsIn(body: Record<string, unknown>): {
  maxTokens?: number
  temperature?: number
  topP?: number
} {
  const maxTokens = body['maxTokens']
  const temperature = body['temperature']
  const topP = body['topP']

  return {
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(typeof topP === 'number' ? { topP } : {}),
  }
}

/** The system turn, when there is one, then the sentence. */
function turnsOf(prompt: { system: string | null; user: string }): readonly ChatTurn[] {
  const system: ChatTurn = { role: 'system', content: prompt.system ?? '' }
  const user: ChatTurn = { role: 'user', content: prompt.user }

  return prompt.system === null ? [user] : [system, user]
}

export function createLocalJobRunner(deps: LocalJobDeps): LocalJobRunner {
  const jobs = new Map<string, LocalJob>()

  const converse = async (
    job: LocalJob,
    model: LocalModel,
    body: Record<string, unknown>,
  ): Promise<void> => {
    // Read off the MANIFEST: an Ollama tag declares the code employments it serves, so the same
    // weights answer a conversation and write a script without a marker in the body to say which.
    const writesCode = capabilitiesIn(model, CODE_FAMILY) !== null
    const prompt = writesCode
      ? codeChatPrompt({
          prompt: promptOf(body),
          source: textIn(body, CODE_SOURCE_FIELD),
          api: textIn(body, CODE_API_FIELD) ?? '',
        })
      : { system: null, user: promptOf(body) }

    const answer = await deps.chat({
      model: model.id,
      contextTokens: model.contextTokens ?? 0,
      messages: turnsOf(prompt),
      json: false,
      ...knobsIn(body),
      signal: job.abort.signal,
    })

    // The fence comes off a script and never off a sentence: an assistant answer is prose, and
    // stripping its backticks would eat a code block the person asked for.
    job.answer = writesCode ? unfencedCode(answer) : answer
  }

  const produce = async (
    job: LocalJob,
    model: LocalModel,
    jobId: string,
    body: Record<string, unknown>,
  ): Promise<void> => {
    const modality = model.modality
    // Refused rather than filed somewhere: a modality with no shelf has nowhere for its output to
    // land, and writing the file anyway would leave bytes nothing ever points at.
    if (!modality || !producesFile(modality)) {
      throw new Error(`${modality} produces nothing this project can hold`)
    }

    const written = await deps.generate({
      model: model.id,
      modality,
      prompt: promptOf(body),
      fields: body,
      jobId,
      // A real fraction, pushed between two denoise steps — where a sentence has none to give.
      onProgress: ratio => (job.progress = ratio),
      signal: job.abort.signal,
    })

    job.produced = {
      ...written,
      type: capabilitiesIn(model, '3d')?.includes('motion')
        ? 'animation'
        : assetTypeOfModality(modality),
      prompt: promptOf(body),
    }
  }

  const run = async (
    job: LocalJob,
    model: LocalModel,
    jobId: string,
    body: Record<string, unknown>,
  ): Promise<void> => {
    try {
      if (distributionStatusOf(model) === 'blocked') throw new Error('distribution-blocked')
      // The manifest says which, and a modality it does not carry is a conversation — the only
      // thing this ran before there was anything else to run.
      if (model.modality && producesFile(model.modality)) {
        await produce(job, model, jobId, body)
      } else {
        await converse(job, model, body)
      }

      job.status = 'success'
      job.progress = 1
    } catch (error) {
      job.status = 'failure'
      job.error = jobFailureOf(error)
      deps.log('warn', `a local job of ${model.id} failed: ${String(error)}`)
    }
  }

  const answerFor = (jobId: string, job: LocalJob): RemoteJob => ({
    jobId,
    status: job.status,
    progress: job.progress,
    assetIds: [],
    // What a model that writes no file answered — a script. The window lands it in an editor.
    ...(job.answer === '' ? {} : { text: job.answer }),
    error: job.error ?? undefined,
    // Nothing was billed, and saying zero is what keeps a local run out of the usage report as a
    // figure rather than as a hole.
    cost: 0,
  })

  return {
    submit: (target, body) => {
      const model = deps.modelOf(target.id)
      const jobId = `local_${deps.newId()}`
      // Working already: nothing queues on this machine, and the manager's own queue is what
      // bounds how many run at once. A local runtime reports tokens rather than a fraction of a
      // whole nobody knows, so a job that started is halfway and finishing is what moves the bar.
      const job: LocalJob = {
        status: model === null ? 'failure' : 'in-progress',
        // A generation counts its steps and overwrites this at the first one; a conversation never
        // will, which is why a half is the only honest figure a sentence can start on.
        progress: model === null ? 0 : 0.5,
        abort: new AbortController(),
        answer: '',
        produced: null,
        error: null,
      }

      jobs.set(jobId, job)
      forgetSettled(jobs)
      if (model !== null) void run(job, model, jobId, body)

      return Promise.resolve(answerFor(jobId, job))
    },

    poll: jobId => {
      const job = jobs.get(jobId)
      // Rejected rather than answered `failure`: a poll for a job nobody submitted is a routing
      // defect, and answering it would hide the defect behind an ordinary-looking outcome.
      if (!job) return Promise.reject(new Error(`${jobId} is not a job of this machine`))

      return Promise.resolve(answerFor(jobId, job))
    },

    cancel: jobId => {
      jobs.get(jobId)?.abort.abort()
      return Promise.resolve()
    },

    outputOf: jobId => jobs.get(jobId)?.answer ?? null,

    producedBy: jobId => jobs.get(jobId)?.produced ?? null,

    owns: jobId => jobs.has(jobId),
  }
}
