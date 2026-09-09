import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { messageOf } from '@shared/guards'
import { openDocument } from '@/features/shell/components/dockviewApi'
import { restoreDocument, type DocumentReadiness } from '@/features/shell/documentLoad'
import { documentAtPath, useDocuments } from '@/stores/documents'
import { textOf } from './actionInputs'

/**
 * Opens the document sitting at a path, and answers once the tab HOLDS it.
 *
 * 🛑 Dated 2026-09-09: the tab was raised and the success announced in the same breath, while the
 * read was still on its way back. A `scene.state` called straight after an open answered a scene
 * without the cube that had just been saved into it, and the only cure left to a client was a
 * pause of its own — a pause that proves nothing about the document being there.
 */
export async function openByPath(input: Record<string, unknown>): Promise<ActionOutcome> {
  const path = textOf(input, 'path')
  if (path === null)
    return refused(
      'badInput',
      '"path" is wanted — the path of a document inside the open project, as documents.list answers it',
    )

  // Re-read first: the listing a client holds may predate a file that has since arrived, and
  // answering "no such document" for one sitting on the disk is the least useful refusal there is.
  // `'own-write'` rather than a bare call, which joins a listing already in flight — one that may
  // have STARTED before the file appeared, and would answer without it.
  if (!documentAtPath(useDocuments.getState(), path)) {
    await useDocuments.getState().relist('own-write')
  }

  const document = documentAtPath(useDocuments.getState(), path)
  if (!document)
    return refused(
      'notFound',
      `no document at "${path}" in this project — documents.list answers what is there, each with its path`,
    )

  openDocument(document)
  // The tab is up either way. What is answered is whether its CONTENT is, and a read already in
  // flight — the panel mounting, the project reopening — is joined rather than started again.
  return openedOutcome(document.id, path, await restoreDocument(document.id))
}

function openedOutcome(
  documentId: string,
  path: string,
  readiness: DocumentReadiness,
): ActionOutcome {
  switch (readiness.state) {
    case 'ready':
      return { ok: true, data: { documentId } }
    case 'unreadable':
      return refused(
        'failed',
        `the tab for "${path}" is open, and its file would not read: ${messageOf(readiness.error)}`,
      )
    // Not a failure of the file, and named apart for that reason: the caller's own next gesture —
    // closing the document, changing project — dropped a read it can simply ask for again.
    case 'cancelled':
      return refused(
        'failed',
        `the read of "${path}" was dropped before it landed — the document was closed or the ` +
          'project changed while it was opening; call document.open again',
      )
    case 'noBridge':
      return refused('noBridge', `the window cannot reach the project to read "${path}"`)
    // `openDocument` has just adopted the descriptor, so nothing answers to this in practice; it
    // is answered rather than assumed away, since a store this reads is not this call's to hold.
    case 'noDocument':
      return refused('notFound', `no open document answers to the one found at "${path}"`)
  }
}
