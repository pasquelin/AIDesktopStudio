import type { DocumentKind } from './document'
import type { OraSurface } from './openRaster'
import type { ReadFidelity } from './readFidelity'
import type { WorkspaceId } from './workspace'

/**
 * Where unsaved work waits for a crash that may never come.
 *
 * Under a dot, so no surface that browses the project lists it (`isStudioPrivate`), and inside the
 * project rather than beside the app: recovery belongs to the work, and a project copied to
 * another machine carries what was not yet written.
 *
 * 🛑 NOT `.index/`, and the distinction is the whole reason this folder exists. `.index/` is a
 * cache — every byte of it can be rebuilt from what is saved, so losing it costs time. This holds
 * the ONLY copy of work nobody has written down: losing it costs the work.
 */
export const RECOVERY_FOLDER = '.recovery'

/**
 * What a recovery entry says about itself, without reading the work back.
 *
 * Enough to OFFER it — a name, a kind, a date, a destination — because the offer is made before
 * anything is opened, and reading every entry to draw a list would open the very documents the
 * user may be about to discard.
 */
export type RecoveryEntry = {
  documentId: string
  kind: DocumentKind
  title: string
  workspace: WorkspaceId
  /** Where the work was going to be written, or the empty string for a document never filed. */
  path: string
  /** When this entry was last written, ISO 8601. What the offer shows and orders by. */
  savedAt: string
  sourceAssetId?: string
  sourceFidelity?: ReadFidelity
}

/** An entry and the work it holds — what a restore reads and what a pass writes. */
export type RecoveryDraft = {
  entry: RecoveryEntry
  content: string
  /** The surfaces an image document holds beside its stack. Absent for every other kind. */
  parts?: readonly OraSurface[]
}

/**
 * How much of the disk the recovery of one project may take before the studio says so.
 *
 * A ceiling that WARNS and never evicts: every byte here may be the only copy of somebody's
 * afternoon, and choosing which afternoon to drop is not a choice a program makes on its own
 * (§9.1, guarantee 2). Passing it is a sentence, not a deletion.
 */
export const RECOVERY_MAX_BYTES = 2 * 1024 * 1024 * 1024

/** What a recovery write settled on. `over-budget` still WROTE — it is a warning, not a refusal. */
export type RecoveryWrite = 'written' | 'over-budget'
