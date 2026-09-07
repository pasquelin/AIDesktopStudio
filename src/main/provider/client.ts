import Scenario, { APIConnectionError, APIError, type ClientOptions } from '@scenario-labs/sdk'
import type { ApiFailure } from '@shared/domain/failure'
import { isRecord } from '@shared/guards'
import { MAX_LOG_MESSAGE } from '@shared/ipc'
import type { AuthState } from '@shared/domain/settings'
import type { Credentials } from '@main/settings/accounts'
import { log } from '@main/log'
import type { WatchCredentials } from './credentialsWatch'
import { tripoFailureOf } from './tripoApi'

/** Thrown when a channel needing the API is reached without usable credentials. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('not-authenticated')
    this.name = 'NotAuthenticatedError'
  }
}

/** What the API calls a 403 the subscription caused rather than the key. */
const PLAN_RESTRICTED = 'ModelAccessRestrictedError'

/**
 * Whether a 403 blames the plan.
 *
 * Reads the PARSED RESPONSE BODY, which carries no credentials — `describeFailure` already
 * writes it to the log for that reason. Never `error.message`, which embeds the request.
 */
function restrictedByPlan(body: unknown): boolean {
  return isRecord(body) && body.name === PLAN_RESTRICTED
}

/**
 * Reduces an SDK error to a code the renderer can translate.
 *
 * The reduction is the point, not a simplification: an `APIError` message embeds the request
 * that produced it, so returning it would walk the API key across the IPC boundary.
 */
export function apiFailureOf(error: unknown): ApiFailure {
  // A second cloud words its refusals its own way, and the classes below know nothing of it —
  // without this, a revoked Tripo key reaches the jobs panel as « erreur inattendue ».
  const elsewhere = tripoFailureOf(error)
  if (elsewhere) return elsewhere

  if (error instanceof NotAuthenticatedError) return 'missing'
  if (error instanceof APIConnectionError) return 'network'

  if (error instanceof APIError) {
    const { status } = error
    if (status === 401) return 'invalid-credentials'
    if (status === 403) return restrictedByPlan(error.error) ? 'plan-restricted' : 'forbidden'
    if (status === 404) return 'not-found'
    if (status === 429) return 'rate-limited'
    if (status !== undefined && status >= 500) return 'server'
  }

  return 'unexpected'
}

/**
 * What the main process may write to its own console about a failure. The status and the
 * parsed response body are safe — the credentials travel in a request header, never in either
 * — whereas `error.message` embeds the whole request and would put the API key in a log file.
 *
 * Without this, a rejected parameter reaches the user as "an unexpected error occurred" and
 * nothing anywhere says which call the API refused.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof APIError) {
    const body = error.error === undefined ? '' : ` ${JSON.stringify(error.error)}`
    return `HTTP ${error.status ?? '?'}${body}`
  }

  // Not an API error, so nothing in it came from a request: the message is ours and safe, and
  // it is the only thing that says what actually broke.
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`
  }

  return `non-error thrown: ${String(error)}`
}

/**
 * The same failure, for something that keeps it: the journal writes it to `catalog.db`, sends
 * it across the boundary and draws it on screen.
 *
 * Two things `describeFailure` may do and this may not. It carries no stack: a stack holds
 * absolute paths — `/Users/<someone>/…` — and this ends up in a file a user may well pass on.
 * And it is bounded, by the same constant and for the same reason the log channel is: a studio
 * looping on a failure must not be able to fill a database with one.
 */
export function persistableFailure(error: unknown): string {
  if (error instanceof APIError) {
    const body = error.error === undefined ? '' : ` ${JSON.stringify(error.error)}`
    return `HTTP ${error.status ?? '?'}${body}`.slice(0, MAX_LOG_MESSAGE)
  }

  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, MAX_LOG_MESSAGE)

  return `non-error thrown: ${String(error)}`.slice(0, MAX_LOG_MESSAGE)
}

/**
 * The only thing an authentication probe needs. Narrower than `Scenario` on purpose: it says
 * what the check costs, and it is what makes the failure mapping testable without a network.
 */
export type AuthProbe = {
  models: { list: (params: { pageSize: number }) => Promise<unknown> }
}

/** Cheapest authenticated call the API offers — one model is enough to prove the key works. */
export async function testAuthentication(client: AuthProbe): Promise<AuthState> {
  try {
    await client.models.list({ pageSize: 1 })
    return { authenticated: true }
  } catch (error) {
    return { authenticated: false, reason: apiFailureOf(error) }
  }
}

export type ClientProvider = {
  /** `null` when no credentials are available. */
  get: () => Scenario | null
  /** Same, but throws — every `provider:*` handler needs a client to do anything at all. */
  require: () => Scenario
  authState: () => Promise<AuthState>
}

/** What a refused call is told to, beyond the terminal. Installed once the journal exists. */
type FailureSink = (scope: string, detail: string) => void

let sink: FailureSink | null = null

/**
 * Sends every reduced failure to the journal as well as to the log.
 *
 * Installed rather than injected, exactly as `mirrorLogsTo` is: `reducedBy` is called at module
 * load, long before a project — and therefore a journal — exists.
 */
export function recordFailuresTo(destination: FailureSink | null): void {
  sink = destination
}

/** The reduction itself, which is the part that must never be written twice. */
function reducing(note: (error: unknown) => void) {
  return async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action()
    } catch (error) {
      // No credentials is a state, not a refused call: there was never a request to describe.
      if (!(error instanceof NotAuthenticatedError)) note(error)
      throw new Error(apiFailureOf(error), { cause: error })
    }
  }
}

/**
 * Runs an API call and lets nothing of it cross the IPC boundary but a code.
 *
 * An SDK message embeds the request that produced it — headers included, so the key. The cause
 * stays attached for the main process alone: Electron serializes `message`, `name` and `stack`
 * of a rejected handler, never `cause`.
 *
 * A factory rather than a function per handler family: three of them had copied the same six
 * lines, and the rule that matters here is the one it would take one forgetful copy to break.
 */
export function reducedBy(scope: string) {
  return reducing(error => noteFailure(scope, error))
}

// What every reduced failure leaves behind — log line and journal entry — for a caller that
// answers a page instead of throwing, and would otherwise leave nothing at all.
export function noteFailure(scope: string, error: unknown): void {
  // No credentials is a state, not a refused call: there was never a request to describe.
  if (error instanceof NotAuthenticatedError) return
  // Logged where the credentials already live: reduced to a code, neither the renderer nor
  // anyone reading a bug report could say which call the API refused.
  log.error(scope, describeFailure(error))
  // Every API failure the studio reduces passes here — which is why the journal is fed from
  // this one place rather than from each handler that happens to remember.
  sink?.(scope, persistableFailure(error))
}

/**
 * The same reduction, kept out of the JOURNAL — and only out of the journal.
 *
 * The journal is what somebody opens after a job went wrong, and a decorative band that polls on
 * its own must not fill it: one rate-limited home leaves five entries about requests nobody asked
 * for, and the push that actually failed scrolls off the top.
 *
 * Still `log.error`, deliberately. A packaged app has no terminal attached and only mirrors its
 * log to the window in development, and `settings.advanced.logLevel` can drop warnings outright —
 * so demoting the level here would not move the failure somewhere quieter, it would erase it.
 */
export function quietlyReducedBy(scope: string) {
  return reducing(error => log.error(scope, describeFailure(error)))
}

/** What a client is built through, so that no client can be built without its rate limit. */
export type Transport = (credentials: Credentials) => NonNullable<ClientOptions['fetch']>

/**
 * The one place a client is constructed.
 *
 * Exported because two callers need one outside the active-credentials cache: a job outliving
 * its session, which has to be polled on the account that paid for it, and the usage reader,
 * which asks every stored key at once and must leave the active account as it found it. Both
 * still go through `transport`, so neither escapes the account's own rate-limit window.
 */
export function clientFor(credentials: Credentials, transport: Transport): Scenario {
  return new Scenario({
    apiKey: credentials.key,
    apiSecret: credentials.secret,
    fetch: transport(credentials),
  })
}

export type ClientProviderDeps = {
  /** `null` when the settings hold no usable key. */
  resolve: () => Credentials | null
  watch: WatchCredentials
  transport: Transport
}

/**
 * Holds the SDK client. Building one is cheap, but it caches nothing useful across
 * credentials, so it is rebuilt lazily and dropped whenever they change.
 */
export function createClientProvider({
  resolve,
  watch,
  transport,
}: ClientProviderDeps): ClientProvider {
  let client: Scenario | null = null

  const get = (): Scenario | null => {
    if (client) return client
    const credentials = resolve()
    if (!credentials) return null
    client = clientFor(credentials, transport)
    return client
  }

  const invalidate = (): void => {
    client = null
  }

  watch(invalidate)

  return {
    get,

    require: () => {
      const resolved = get()
      if (!resolved) throw new NotAuthenticatedError()
      return resolved
    },

    authState: async () => {
      const resolved = get()
      return resolved
        ? await testAuthentication(resolved)
        : { authenticated: false, reason: 'missing' }
    },
  }
}
