import { useDocuments } from '@/stores/documents'
import { ioOf } from './documentIoAdapters'

/**
 * Whether a document holds work nobody has written down — the one question three parts of the
 * shell ask, and the reason it lives apart from the writing itself.
 *
 * Here rather than in `documentIo.ts`: the recovery area reads it, `documentIo` writes into the
 * recovery area, and a module holding both halves closes an import cycle
 * (`main/import-cycles.test.ts` holds that ratchet at zero).
 */
export function documentIsDirty(documentId: string): boolean {
  const io = ioOf(documentId)
  return io !== undefined && io.holds(documentId) && io.dirty(documentId)
}

export function unsavedDocumentIds(): string[] {
  return Object.keys(useDocuments.getState().documents).filter(documentIsDirty)
}
