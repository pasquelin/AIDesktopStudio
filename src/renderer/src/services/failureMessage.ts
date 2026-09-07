import type { JobFailure } from '@shared/domain/failure'

/**
 * One message per failure code, for both authentication and generation. The main process
 * never sends text — an SDK error message embeds the request that produced it, and that
 * request carries the API key.
 */
const MESSAGE_KEY: Record<JobFailure, string> = {
  missing: 'errors.missingCredentials',
  'invalid-credentials': 'errors.invalidCredentials',
  forbidden: 'errors.forbidden',
  'plan-restricted': 'errors.planRestricted',
  'not-found': 'errors.notFound',
  'rate-limited': 'errors.rateLimited',
  server: 'errors.server',
  network: 'errors.network',
  rejected: 'errors.rejected',
  storage: 'errors.storage',
  'incomplete-model': 'errors.incompleteModel',
  'engine-missing': 'errors.engineMissing',
  'engine-failed': 'errors.engineFailed',
  unexpected: 'errors.unexpected',
}

export function failureMessageKey(failure: JobFailure): string {
  return MESSAGE_KEY[failure]
}

/**
 * The message key for a rejection that crossed the boundary. The main process sends a code as
 * the error's message — never the SDK's own text, which carries the API key — so an unknown
 * one is simply not ours, and reads as unexpected.
 *
 * Membership is read off `MESSAGE_KEY`, which the compiler keeps exhaustive: a second list of
 * codes would fall behind the union without anything failing to build.
 */
export function failureKeyOf(error: unknown): string {
  if (!(error instanceof Error)) return MESSAGE_KEY.unexpected

  /**
   * Matched at the end, not compared whole: `ipcMain.handle` does not hand the rejection over
   * untouched, it wraps the message — `Error invoking remote method 'provider:search-models':
   * Error: rate-limited`. An equality test never fires, and every failure reads as unexpected.
   */
  const found = CODES.find(code => error.message === code || error.message.endsWith(`: ${code}`))
  return found ? MESSAGE_KEY[found] : MESSAGE_KEY.unexpected
}

/** Derived from the table above, so the two can never list different codes. */
const CODES: readonly JobFailure[] = Object.keys(MESSAGE_KEY).filter(isFailure)

function isFailure(code: string): code is JobFailure {
  return Object.hasOwn(MESSAGE_KEY, code)
}
