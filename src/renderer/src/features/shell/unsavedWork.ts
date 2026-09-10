import { autosaveOpenDocuments } from './documentIo'
import { recoverableDocument, recoverOpenDocuments } from './documentRecovery'

/**
 * One pass of the net under unsaved work, for every open document.
 *
 * Its own module because it needs both halves and belongs to neither: the recovery area reads
 * what a document holds, and the writing half writes into that area.
 *
 * The two kinds the recovery does not hold — the character, whose content is a model of the
 * library, and the script, which IS its own text file — keep the pass that writes them, since
 * for those two the destination and the work are one file and saving it converts nothing.
 */
export async function keepUnsavedWorkSafe(): Promise<void> {
  await recoverOpenDocuments()
  await autosaveOpenDocuments(documentId => recoverableDocument(documentId) === null)
}
