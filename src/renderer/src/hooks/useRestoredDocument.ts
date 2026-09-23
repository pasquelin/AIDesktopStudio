import { useEffect } from 'react'
import { rehydrateDocument, restoreDocument } from '@/features/shell/documentLoad'

/**
 * Fills a tab from the project when a file is there, from the space's own default otherwise —
 * and it is what saving reads back, so the two never disagree about what the document holds.
 *
 * One hook rather than the same effect per space: three had written it out, two had never
 * written it at all — and a space that opens without it is a space whose documents silently
 * never load.
 *
 * BOTH are asked for, and only one of them ever acts: `restoreDocument` reads the file when the
 * state is missing, `rehydrateDocument` when the state is there and a fresh engine is not. The
 * second is what a REMOUNT needs — `DocumentArea` is keyed on the workspace, so switching space
 * and back rebuilds every engine, and the document came back with its stack and no pixels at all.
 *
 * Nothing is awaited and nothing is caught here. Both report their own failures — they are the
 * side that knows a read failed — and rethrowing into a mount effect would take down the window
 * over a file that would not open.
 */
export function useRestoredDocument(documentId: string): void {
  useEffect(() => {
    void restoreDocument(documentId)
    void rehydrateDocument(documentId)
  }, [documentId])
}
