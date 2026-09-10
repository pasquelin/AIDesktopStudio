import { z } from 'zod'
import type { DocumentKind } from '@shared/domain/document'
import { isDocumentKind } from '@shared/domain/document'
import { isReadFidelity, type ReadFidelity } from '@shared/domain/readFidelity'
import type { RecoveryDraft } from '@shared/domain/recovery'
import { isWorkspaceId } from '@shared/domain/workspace'
import { assetId } from '@main/assets/validation'
import { pathSegment } from '@main/validation'
import { documentContent, documentTitle, oraSurface } from './validation'

/**
 * A recovery draft on its way to disk. Bounded like a document draft, and for the same reason —
 * the renderer is the sandboxed side — plus one of its own: this composes a FOLDER PATH out of
 * the id it carries, so a `..` there would write outside the project.
 */
const recoveryDraft = z.object({
  entry: z.object({
    documentId: pathSegment,
    kind: z.custom<DocumentKind>(isDocumentKind),
    title: documentTitle,
    workspace: z.string().refine(isWorkspaceId),
    path: z.string().max(1024),
    savedAt: z.string().min(1).max(64),
    sourceAssetId: assetId.optional(),
    sourceFidelity: z.custom<ReadFidelity>(isReadFidelity).optional(),
  }),
  content: documentContent,
  parts: z.array(oraSurface).max(2048).optional(),
})

export function parseRecoveryDraft(value: unknown): RecoveryDraft {
  // `as`: `refine` narrows at runtime and not in the type, so zod hands back `string` where the
  // guard has already proved `WorkspaceId` — the same shape `parseSaveLayered` uses.
  return recoveryDraft.parse(value) as RecoveryDraft
}
