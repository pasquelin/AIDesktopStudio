import type { Asset, AssetType } from '@shared/domain/asset'
import type { DocumentKind } from '@shared/domain/document'
import { isFinished, type Job } from '@shared/domain/job'
import type { LandingTarget } from '@shared/domain/landingTarget'
import type { LogScope } from '@shared/ipc'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { useAssets } from './assets'
import { activeIdOfKind, useDocuments } from './documents'
import { useJobs } from './jobs'

/**
 * How far back the settle looks. A generation's rows are the newest in the catalogue, and a
 * batch is a handful — this is the margin for the ingests that landed alongside it.
 */
const SETTLE_LIMIT = 200

/** What one workspace needs said about where its generations land. Everything else is shared. */
export type GenerationLanding = {
  kind: DocumentKind
  /** Which of a generation's outputs this workspace can take. The rest stays on the shelf. */
  accepts: (asset: Asset) => boolean
  /**
   * The kinds `accepts` can ever say yes to — what the catalogue is ASKED for when a job lands.
   * Written beside the predicate rather than derived from it: a query takes types, a predicate
   * answers about one asset, and neither can be turned into the other.
   */
  types: readonly AssetType[]
  /**
   * How much of a batch it keeps, and the only thing the three workspaces ever differed on: a
   * sky is one sky and a scene one model, while a canvas gives every picture a layer of its own
   * — so `every` leaves the last one rendered armed.
   */
  takes: 'first' | 'every'
  /** Where a catalogue read that fails is journalled — one space per scope, or the reader is sent
   * to the wrong one. */
  scope: LogScope
  land: (documentId: string, asset: Asset, jobId: string) => void
  onSettled?: (jobId: string) => void
}

/** Hands over the jobs that SUCCEEDED, each with the document it was claimed for. */
type Landed = (jobs: ReadonlyMap<string, string | null>) => void

/**
 * The claimed document, or `null` for a tab of its own — and for one CLOSED since.
 *
 * 🛑 Asked by each consumer AFTER its own awaits, never once when the claim settles: a landing
 * reads the catalogue over IPC first, and a tab closed during that round trip would be written
 * into — resurrecting a document nothing shows, with a history nobody can reach.
 */
export function landingInto(documentId: string | null): string | null {
  if (documentId === null) return null
  return useDocuments.getState().documents[documentId] ? documentId : null
}

/**
 * The half of a landing that is the same whatever comes back: who claimed which document, and
 * when the claim is spent. Shared with the Code space, whose result is text rather than a row of
 * the shelf — everything below this line is about assets.
 */
export type LandingClaims = {
  claimOnSubmit: (into?: LandingTarget) => (job: Job | null) => void
  /** Returns the unsubscribe. `null` for a tab of its own, and for a tab since closed. */
  connect: (settled: Landed) => () => void
}

export function createLandingClaims(kind: DocumentKind): LandingClaims {
  /**
   * Which document each running generation was launched for. Session state: a claim restored
   * tomorrow would drop a result into a document whose author has long moved on.
   */
  const claims = new Map<string, string | null>()

  const settle = (jobs: readonly Job[], landed: Landed): void => {
    if (claims.size === 0) return

    const succeeded = new Map<string, string | null>()
    for (const job of jobs) {
      if (!claims.has(job.id) || !isFinished(job.status)) continue

      // Dropped whatever the outcome: a failed or cancelled job has nothing to land, and a claim
      // kept for it would outlive the window.
      const documentId = claims.get(job.id) ?? null
      claims.delete(job.id)
      if (job.status === 'succeeded') succeeded.set(job.id, documentId)
    }

    if (succeeded.size > 0) landed(succeeded)
  }

  return {
    claimOnSubmit: into => {
      const open = activeIdOfKind(useDocuments.getState(), kind)
      // `null` is a claim too, and that is the change: a workspace with nothing open used to
      // claim NOTHING, so the result was paid for, collected, and left on the shelf unseen.
      const target = open && into !== 'newTab' ? open : null

      return job => {
        if (job) claims.set(job.id, target)
      }
    },

    connect: landed => {
      const stop = useJobs.subscribe(state => settle(state.jobs, landed))
      return () => {
        stop()
        // Nothing can land once nothing listens, so the claims go with the subscription rather
        // than outliving it — which is also what lets a test reset by disconnecting.
        claims.clear()
      }
    },
  }
}

export type LandingChannel = {
  /**
   * Takes note of where a generation is being launched to, and hands back what claims the job
   * once its id is known.
   *
   * In two halves because the two moments are: the target has to be read at the click, while a
   * job id only exists after `POST /generate` has answered — and a user who switches tabs during
   * that round trip would otherwise have the result land wherever they went.
   *
   * `into` overrides what the click would have read — what the question answers when it is
   * asked. Absent, the open document takes it, and a tab of its own when there is none.
   */
  claimOnSubmit: (into?: LandingTarget) => (job: Job | null) => void
  /** Follows the job list and lands what this workspace asked for. Returns the unsubscribe. */
  connect: () => () => void
}

async function openGeneratedAsset(asset: Asset): Promise<void> {
  const { openAsset } = await import('@/helpers/openAsset')
  await openAsset(asset)
}

function landRows(
  settled: ReadonlyMap<string, string | null>,
  rows: readonly Asset[],
  accepts: (asset: Asset) => boolean,
  takes: GenerationLanding['takes'],
  land: GenerationLanding['land'],
  onSettled: GenerationLanding['onSettled'],
): void {
  for (const [jobId, claimed] of settled) {
    const into = landingInto(claimed)
    for (const asset of rows) {
      if (asset.jobId !== jobId || !accepts(asset)) continue
      if (into === null) void openGeneratedAsset(asset)
      else land(into, asset, jobId)
      if (takes === 'first') break
    }
    onSettled?.(jobId)
  }
}

/**
 * The machinery every workspace shares for putting a finished generation where it was asked
 * for: a claim per running job, settled when it stops running.
 *
 * Written once because the sky, the scene and the canvas need the same thing and differ by four
 * values. The canvas proved the point the hard way: it kept its own copy of this for a while,
 * ninety lines against fifteen, carrying the subtleties (capture at the click, drop the claim
 * whatever the outcome, read the catalogue rather than wait on it) without the tests that guard
 * them here.
 */
export function createGenerationLanding({
  kind,
  accepts,
  types,
  takes,
  scope,
  land,
  onSettled,
}: GenerationLanding): LandingChannel {
  const claims = createLandingClaims(kind)

  /**
   * The catalogue is read rather than waited on: `useAssets` coalesces its refresh over a couple
   * of hundred milliseconds so that a burst of finishing ingests does not freeze every window,
   * and the rows are therefore not in the list yet at the moment a job reports success.
   *
   * The job hands back Scenario's own asset ids; what a document stores is the id of the row the
   * collector wrote, so the two are joined on `jobId` — the only identifier both sides share.
   */
  const settleInto = async (settled: ReadonlyMap<string, string | null>): Promise<void> => {
    const finish = (): void => {
      for (const jobId of settled.keys()) onSettled?.(jobId)
    }
    const bridge = getBridge()
    if (!bridge) return finish()

    // Asked of the catalogue directly, never of `useAssets.items`. Two reasons, and each one
    // loses the result on its own: that list is FILTERED by the space in front — a generation
    // launched from the image space and awaited in the audio space finds no picture in it — and
    // `refresh` hands back a read already in flight, which may have been sent before the
    // collector wrote the outputs. Either way the claim is already spent, and nothing retries.
    // The claim is already spent by `settle`, so a read that throws loses a generation that was
    // PAID for — and, unhandled, takes an unhandled rejection with it. The `refresh` this
    // replaced could not reject; this one reaches the catalogue over IPC.
    let rows
    try {
      rows = await bridge.assets.search({ types: [...types], limit: SETTLE_LIMIT })
    } catch (error) {
      reportFailure(scope, kind, error)
      return finish()
    }

    if (!rows) return finish()
    // The shelf still has to hear about them: it is what the browser shows.
    void useAssets.getState().refresh()

    landRows(settled, rows, accepts, takes, land, onSettled)
  }

  return {
    claimOnSubmit: claims.claimOnSubmit,
    connect: () => claims.connect(succeeded => void settleInto(succeeded)),
  }
}
