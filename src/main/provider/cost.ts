import { APIError } from '@scenario-labs/sdk'
import type { CostEstimate, JobTarget } from '@shared/domain/job'
import { isRecord } from '@shared/guards'

/** What a run would cost, unrun: `null` where the API declines to price it, 0 for this machine. */
export type CostEstimator = (
  target: JobTarget,
  body: Record<string, unknown>,
) => Promise<CostEstimate>

/**
 * Fires the call an estimate rides on, whatever it is a dry run of.
 *
 * A function rather than a named method: which endpoint prices the dry run is the target's
 * business, exactly as it is for running one.
 */
export type DryRun = (target: JobTarget, body: Record<string, unknown>) => Promise<unknown>

// Two names for the one figure: `creativeUnitsCost` on a 200, `estimatedCost` on the 402 below.
function priceIn(payload: unknown): CostEstimate {
  if (!isRecord(payload)) return null

  const cost = payload.creativeUnitsCost ?? payload.estimatedCost
  return typeof cost === 'number' && Number.isFinite(cost) ? { creativeUnits: cost } : null
}

/**
 * What a run would cost, without running it.
 *
 * `?dryRun=true` creates no job and spends nothing, and it **answers 200** — observed on both
 * endpoints, against the 402 the reference documents, which is kept as a fallback. Reading that
 * 402 alone is how this went unnoticed: the estimate was never wrong, it was never there.
 *
 * Only a 402 is swallowed. Anything else — a 500, a dead network, a key that expired — is thrown
 * on, so it reaches the log and the journal like every other failure.
 */
export function costEstimatorOf(
  run: DryRun,
  runsHere: (targetId: string) => boolean,
): CostEstimator {
  return async (target, body) => {
    // 🛑 A model of THIS machine is never priced by the API, and the reason is not only that it
    // is free: measured on screen, an estimate for `ssd-1b` reached `runModel` and came back
    // `404 Model ssd-1b not found`, journalled beside the generation's own failure — two error
    // lines for one gesture, and a request spent asking a service about something it never had.
    if (runsHere(target.id)) return { creativeUnits: 0 }

    try {
      return priceIn(await run(target, body))
    } catch (error) {
      if (error instanceof APIError && error.status === 402) return priceIn(error.error)
      throw error
    }
  }
}
