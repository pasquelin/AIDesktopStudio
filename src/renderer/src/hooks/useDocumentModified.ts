import { useCallback, useSyncExternalStore } from 'react'
import {
  documentIsMarkedModified,
  subscribeDocumentModified,
} from '@/features/shell/components/dockviewApi'

/**
 * Whether the tab of this document currently holds unsaved work. Written by `useDocumentTitle`
 * from the space that owns the document, and read by the tab chrome that draws the mark.
 */
export function useDocumentModified(documentId: string): boolean {
  const read = useCallback(() => documentIsMarkedModified(documentId), [documentId])
  return useSyncExternalStore(subscribeDocumentModified, read, read)
}
