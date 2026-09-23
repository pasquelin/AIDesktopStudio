import { z } from 'zod'
import type { DocumentKind } from '@shared/domain/document'
import { isDocumentKind } from '@shared/domain/document'
import { isReadFidelity, type ReadFidelity } from '@shared/domain/readFidelity'
import type { RecoveryDraft, RecoveryEntry } from '@shared/domain/recovery'
import { isWorkspaceId } from '@shared/domain/workspace'
import { assetId } from '@main/assets/validation'
import { pathSegment } from '@main/validation'
import { documentContent, documentTitle, oraSurface } from './validation'

/**
 * A recovery draft on its way to disk. Bounded like a document draft, and for the same reason —
 * the renderer is the sandboxed side — plus one of its own: this composes a FOLDER PATH out of
 * the id it carries, so a `..` there would write outside the project.
 */
const recoveryEntry = z.object({
  documentId: pathSegment,
  kind: z.custom<DocumentKind>(isDocumentKind),
  title: documentTitle,
  workspace: z.string().refine(isWorkspaceId),
  path: z.string().max(1024),
  savedAt: z.string().min(1).max(64),
  sourceAssetId: assetId.optional(),
  sourceFidelity: z.custom<ReadFidelity>(isReadFidelity).optional(),
})

const recoveryDraft = z.object({
  entry: recoveryEntry,
  content: documentContent,
  parts: z.array(oraSurface).max(2048).optional(),
})

export function parseRecoveryDraft(value: unknown): RecoveryDraft {
  // `as`: `refine` narrows at runtime and not in the type, so zod hands back `string` where the
  // guard has already proved `WorkspaceId` — the same shape `parseSaveLayered` uses.
  return recoveryDraft.parse(value) as RecoveryDraft
}

/**
 * The same entry, read back off disk. ONE schema for the two directions: written twice, a field
 * added to one side would be written and then silently dropped on the way back — which is the
 * defect `validation.ts` records twice about zod stripping what it does not name.
 *
 * `null` rather than a throw: a folder a crash caught mid-write is one entry to skip, never the
 * whole offer.
 */
export function recoveryEntryOf(value: unknown): RecoveryEntry | null {
  const read = recoveryEntry.safeParse(value)
  // `as`: the same `refine` narrowing as above.
  return read.success ? (read.data as RecoveryEntry) : null
}
