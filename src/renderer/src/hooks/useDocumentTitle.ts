import { useEffect } from 'react'
import { useDocuments } from '@/stores/documents'
import { setDocumentTitle } from '@/features/shell/components/dockviewApi'

/**
 * Keeps a document's tab saying what the document is called, and whether it holds unsaved work.
 *
 * The title is read here rather than passed in: it belongs to the document, and a space that
 * repeated it would be free to disagree with the panel next to it — which is the defect this
 * whole change is about. `modified` is the space's to supply, and only its own: a document is
 * dirty in exactly one of the six stores, and only the one holding it can say so as it changes.
 *
 * Every space calls this. Written as one hook because five of them did not call anything at
 * all: `setDocumentTitle` had a single caller, so a scene showed its mark and said its new
 * name, while an image, a take, a montage, a texture and a sky kept the title they were opened
 * with and never once said they were unsaved.
 */
export function useDocumentTitle(documentId: string, modified: boolean): void {
  const title = useDocuments(state => state.documents[documentId]?.title)

  useEffect(() => {
    if (title) setDocumentTitle(documentId, title, modified)
  }, [documentId, title, modified])
}
