import type { ApiFailure } from '@shared/domain/failure'
import { isRecord, readOptionalNumber, readText } from '@shared/guards'
import { TRIPO_BASE_URL } from '@shared/domain/tripo'

/** Narrower than `fetch` on purpose: this is what a test has to answer. */
export type TripoFetch = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Measured 2026-08-31 against the live service: a success carries `{"code":0,…,"data":{…}}`, a
 * refusal `{"code":N,"status":"error","message":…}`.
 */
export class TripoError extends Error {
  constructor(
    /** Their own code — 2 for a bad key, 1004 for a malformed id, 1007 rate, 2000 concurrency. */
    readonly code: number,
    /** The HTTP status, which alone separates a refusal from an outage. */
    readonly httpStatus: number,
    message: string,
    /** What `Retry-After` said, in milliseconds. Absent when the header was not sent. */
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'TripoError'
  }
}

/** Their rate limiter. */
const TRIPO_RATE_LIMITED = 1007
/** A category already full — the ceiling `TRIPO_LANE_LIMITS` exists to stay under. */
const TRIPO_TOO_MANY_TASKS = 2000

/**
 * Their refusal, in the studio's OWN vocabulary — the same codes an SDK error reduces to.
 *
 * 🛑 Without this the panel says « erreur inattendue » for a revoked key, where the Scenario
 * half says « clé invalide »: `apiFailureOf` reads the SDK's classes and answers `unexpected`
 * for everything another service words its own way.
 */
export function tripoFailureOf(error: unknown): ApiFailure | null {
  if (!(error instanceof TripoError)) return null
  if (error.httpStatus === 401 || error.code === 2) return 'invalid-credentials'
  if (error.httpStatus === 403) return 'forbidden'
  if (error.httpStatus === 404) return 'not-found'
  if (error.httpStatus === 429) return 'rate-limited'
  if (error.httpStatus >= 500) return 'server'

  return 'unexpected'
}

/**
 * What a retry can fix on their side. Their two waitable refusals are NOT the same thing: 1007
 * is their rate limiter, 2000 a category already full — one arriving means the studio's own
 * count and theirs disagree.
 */
export function isRetryableTripo(error: unknown): boolean {
  if (!(error instanceof TripoError)) return false

  return (
    error.code === TRIPO_RATE_LIMITED ||
    error.code === TRIPO_TOO_MANY_TASKS ||
    error.httpStatus >= 500
  )
}

/** How long they asked to be left alone for, or `null` where they said nothing. */
export function tripoRetryAfterMs(error: unknown): number | null {
  return error instanceof TripoError ? (error.retryAfterMs ?? null) : null
}

/** A task as the studio reads it. Their statuses are kept verbatim — `jobStatusOf` maps them. */
export type TripoTask = {
  taskId: string
  status: string
  /**
   * A fraction of 1, DIVIDED here: theirs is a percentage, and the manager only reads the larger
   * scale above 2 — so 1 % and 2 % would have arrived as a finished bar.
   */
  progress?: number
  /** What it has actually cost, once it has. */
  credits?: number
  /**
   * Every URL their output carries, by name. Signed, and short-lived — hence the eager download.
   *
   * 🛑 Handed over WHOLE rather than reduced to one: measured, a text-to-model answers
   * `model_url`, `rendered_image_url` AND `generated_image_url` — the last two being the picture
   * it drew on the way. Picking here would file a mesh's intermediate picture as the mesh.
   */
  outputUrls: Readonly<Record<string, string>>
  /**
   * Their answer as it came, for the endpoints that ANSWER instead of producing a file:
   * `animations/rig-check` carries three facts and no URL, and thrown away it says nothing.
   */
  output?: Readonly<Record<string, unknown>>
}

export type TripoApi = {
  /** Creates a task and answers the id it will be followed by. */
  create: (endpoint: string, body: Record<string, unknown>) => Promise<string>
  /** The state of several tasks at once — one request for every generation being watched. */
  status: (taskIds: readonly string[]) => Promise<readonly TripoTask[]>
  /** Sends a file up and answers the token a body names it by. */
  upload: (fileName: string, bytes: Uint8Array, mimeType: string) => Promise<string>
  /** What the key has left, and what its running tasks are holding. */
  balance: () => Promise<{ balance: number; frozen: number }>
}

export type TripoApiOptions = {
  key: () => string | null
  fetch?: TripoFetch
  baseUrl?: string
}

const textOf = (record: Record<string, unknown>, key: string): string | undefined =>
  readText(record, key) ?? undefined

/** Seconds or a date, as the RFC allows. Nothing for a third shape, which would wait `NaN`. */
export function retryAfterMsOf(header: string | null, now: number): number | undefined {
  if (!header) return undefined

  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)

  const at = Date.parse(header)
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined
}

/** Every URL their output names, the caller choosing which one its employment produces. */
function urlsIn(output: unknown): Record<string, string> {
  if (!isRecord(output)) return {}

  return Object.fromEntries(
    Object.entries(output).flatMap(([name, value]) =>
      typeof value === 'string' && value.startsWith('http') ? [[name, value]] : [],
    ),
  )
}

export function taskOf(payload: unknown): TripoTask | null {
  if (!isRecord(payload)) return null
  const taskId = textOf(payload, 'task_id') ?? textOf(payload, 'id')
  const status = textOf(payload, 'status')
  if (!taskId || !status) return null

  const percent = readOptionalNumber(payload, 'progress')
  const progress = percent === undefined ? undefined : percent / 100
  // 🛑 `credits_consumed`, and their v2 says `consumed_credit`: a curl against the wrong host
  // once "proved" the other name and broke this. The studio speaks v3 — read v3.
  const credits = readOptionalNumber(payload, 'credits_consumed')
  const output = payload['output']
  return {
    taskId,
    status,
    outputUrls: urlsIn(payload['output']),
    ...(isRecord(output) ? { output } : {}),
    ...(progress === undefined ? {} : { progress }),
    ...(credits === undefined ? {} : { credits }),
  }
}

/**
 * What the grouped read answers.
 *
 * 🛑 MEASURED 2026-08-31: `data.tasks` is an OBJECT INDEXED BY TASK ID, not an array — read as
 * one, this answered nothing and the studio fell back to a request per task for the session,
 * with the whole point of the grouped read silently lost. Both shapes are taken: a list is what
 * every neighbouring endpoint of theirs returns, and nothing says this one will not follow.
 */
function tasksIn(data: unknown): readonly TripoTask[] | null {
  const held = Array.isArray(data) ? data : isRecord(data) ? data['tasks'] : null
  if (Array.isArray(held)) return held.flatMap(one => taskOf(one) ?? [])
  if (!isRecord(held)) return null

  return Object.entries(held).flatMap(([taskId, task]) =>
    // Their entries carry `task_id` inside too; the key is what answers if one ever does not.
    isRecord(task) ? (taskOf({ task_id: taskId, ...task }) ?? []) : [],
  )
}

async function answerOf(response: Response, path: string): Promise<unknown> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // A gateway answering HTML is the ordinary shape of an outage: the status below says it.
  }
  const code = isRecord(body) ? readOptionalNumber(body, 'code') : undefined
  if (response.ok && code === 0) return isRecord(body) ? body['data'] : null

  throw new TripoError(
    code ?? 0,
    response.status,
    (isRecord(body) ? textOf(body, 'message') : undefined) ?? `${path} answered ${response.status}`,
    retryAfterMsOf(response.headers.get('retry-after'), Date.now()),
  )
}

export function createTripoApi({
  key,
  fetch: get = fetch,
  baseUrl = TRIPO_BASE_URL,
}: TripoApiOptions): TripoApi {
  // 🛑 NOT MEASURED: their reference recommends the grouped read and nothing here has run it.
  // Refused once, this drops to one request per task for the session.
  let grouped = true

  const call = async (
    path: string,
    init?: RequestInit,
    headers?: Record<string, string>,
  ): Promise<unknown> => {
    const held = key()
    if (!held) throw new TripoError(2, 401, 'no Tripo key is held')

    const response = await get(`${baseUrl}/${path}`, {
      ...init,
      headers: { authorization: `Bearer ${held}`, ...headers },
    })

    return answerOf(response, path)
  }

  const postJson = (path: string, body: Record<string, unknown>): Promise<unknown> =>
    call(
      path,
      { method: 'POST', body: JSON.stringify(body) },
      { 'content-type': 'application/json' },
    )

  const oneByOne = async (taskIds: readonly string[]): Promise<readonly TripoTask[]> => {
    const read = await Promise.all(taskIds.map(id => call(`tasks/${id}`)))
    return read.flatMap(one => taskOf(one) ?? [])
  }

  return {
    create: async (endpoint, body) => {
      const data = await postJson(endpoint, body)
      const taskId = isRecord(data) ? (textOf(data, 'task_id') ?? textOf(data, 'id')) : undefined
      // Refused rather than answered with an empty id: a task that exists and cannot be followed
      // is a generation paid for and abandoned, which is the one outcome worth throwing over.
      if (!taskId) throw new TripoError(0, 200, 'a task was created without an id to follow it by')

      return taskId
    },

    status: async taskIds => {
      if (taskIds.length === 0) return []
      if (!grouped) return await oneByOne(taskIds)

      try {
        const tasks = tasksIn(await postJson('tasks/list', { task_ids: [...taskIds] }))
        // 🛑 Demoted on a SHAPE nobody serves, never on a refusal: read as "not served", one
        // rate limit would have spent a request per task for the session — against the very
        // limiter the grouped read exists to stay under.
        if (tasks) return tasks
      } catch (error) {
        if (!(error instanceof TripoError) || error.httpStatus !== 404) throw error
      }

      grouped = false
      return await oneByOne(taskIds)
    },

    upload: async (fileName, bytes, mimeType) => {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), fileName)
      const data = await call('files', { method: 'POST', body: form })
      const token = isRecord(data) ? textOf(data, 'file_token') : undefined
      if (!token) throw new TripoError(0, 200, 'a file was accepted without a token')

      return token
    },

    balance: async () => {
      const data = await call('account/balance')
      const balance = isRecord(data) ? readOptionalNumber(data, 'balance') : undefined
      // 🛑 Refused rather than defaulted: a zero drawn beside a key holding hundreds is the one
      // outcome this must not produce, and the screen can say it could not read instead.
      if (balance === undefined) throw new TripoError(0, 200, 'the balance came back unreadable')

      return { balance, frozen: (isRecord(data) && readOptionalNumber(data, 'frozen')) || 0 }
    },
  }
}
