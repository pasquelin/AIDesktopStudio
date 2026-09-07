import type { LogVerbosity } from '@shared/domain/settings'
import type { LogEntry, LogLevel } from '@shared/ipc'

/**
 * The main process's own log. It prints to the terminal running the app, records to a rotating
 * file in every build, and — once the mirror is installed — reaches every renderer's devtools.
 *
 * The mirror is the point: the API calls leave from the main process, so they never appear in
 * the renderer's Network tab, and every failure crossing the boundary is reduced to a code —
 * an SDK error message embeds the request that produced it, so it carries the API key and can
 * never reach the renderer. That reduction leaves "unexpected" as the only thing a user sees;
 * this is where the rest of the story stays.
 *
 * Never log a whole SDK error: log its status and its parsed body, which the credentials never
 * travel in — see `describeFailure`.
 */
export type Sink = (entry: LogEntry) => void

let sink: Sink | null = null

/** Installed once the windows exist; before that the terminal is the only output. */
export function mirrorLogsTo(destination: Sink | null): void {
  sink = destination
}

let record: Sink | null = null

/** Installed in EVERY build, unlike the mirror: a run from the Finder has no terminal to read. */
export function recordLogsTo(destination: Sink | null): void {
  record = destination
}

const quiet = process.env['NODE_ENV'] === 'test'

/**
 * How loud each level is. A line is written when its rank is at or below the threshold, so the
 * setting is a comparison rather than a table of what each level lets through.
 */
const RANK: Record<LogLevel, number> = { error: 1, warn: 2, info: 3 }

const RANK_OF_VERBOSITY: Record<LogVerbosity, number> = { silent: 0, error: 1, warn: 2, info: 3 }

let threshold = RANK_OF_VERBOSITY.info

/** Set from the settings, and again whenever they change. */
export function setLogVerbosity(verbosity: LogVerbosity): void {
  threshold = RANK_OF_VERBOSITY[verbosity]
}

/**
 * Whether the person asked for no technical journal at all — read by whoever records BESIDE this
 * one. 🛑 A recorder that ignored it would keep writing what the setting exists to stop.
 */
export const logsSilenced = (): boolean => threshold === RANK_OF_VERBOSITY.silent

function write(level: LogLevel, scope: string, message: string): void {
  if (quiet || RANK[level] > threshold) return

  const line = `[${scope}] ${message}`

  /* oxlint-disable no-console -- this module IS the main process's logger */
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
  /* eslint-enable no-console */

  const entry: LogEntry = { level, scope, message }
  sink?.(entry)
  record?.(entry)
}

export const log = {
  info: (scope: string, message: string) => write('info', scope, message),
  warn: (scope: string, message: string) => write('warn', scope, message),
  error: (scope: string, message: string) => write('error', scope, message),
}
