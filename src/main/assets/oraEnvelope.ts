import { DOCUMENT_VERSION } from '@shared/domain/document'
import type { SaveLayeredRequest } from '@shared/ipcExports'

/**
 * What a container says it is — §2.6, one identity per file.
 *
 * The same envelope `documents.write` stamps, written by the one other door that produces an
 * `.ora`: without it the file was listed under its own name with no id, and the tab that wrote it
 * kept another. The clock is the writer's, as it is for every document.
 *
 * Empty for a container nobody claims — a copy, a flattened export, a picture written by an
 * action — and `oraEnvelope` then reads the file by its name, as one painted elsewhere is.
 */
export function oraEnvelopeFor(
  { documentId, name }: Pick<SaveLayeredRequest, 'documentId' | 'name'>,
  now: () => string,
): string {
  if (!documentId) return ''

  return JSON.stringify({
    version: DOCUMENT_VERSION,
    kind: 'image',
    title: name,
    updatedAt: now(),
    id: documentId,
  })
}
