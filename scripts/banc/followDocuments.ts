import type { DocumentDescriptor } from '@shared/domain/document'
import { useDocuments } from '@/stores/documents'

/**
 * Holds one surface per document the window would mount one for, and gives it back when the
 * document closes — left registered, a scene nobody shows still answers `play.start`, and an
 * image closed by the model still saves its pixels.
 */
export function followDocuments(
  wants: (document: DocumentDescriptor) => boolean,
  hold: (documentId: string) => () => void,
): () => void {
  const held = new Map<string, () => void>()

  const stop = useDocuments.subscribe(state => {
    for (const [documentId, document] of Object.entries(state.documents)) {
      if (wants(document) && !held.has(documentId)) held.set(documentId, hold(documentId))
    }
    for (const [documentId, release] of [...held]) {
      if (state.documents[documentId]) continue
      release()
      held.delete(documentId)
    }
  })

  return () => {
    stop()
    for (const release of held.values()) release()
    held.clear()
  }
}
