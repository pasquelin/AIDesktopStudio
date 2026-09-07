import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { fileViewsHoldEdits, settleFileViews } from './components/dockviewApi'
import { settleUnsavedWork, unsavedDocumentIds } from './documentIo'

/**
 * Keeps the window from going while a document still holds unsaved work, and says so instead of
 * letting it go silently.
 *
 * `beforeunload` is the one moment Chromium asks the document whether it may leave, and it asks
 * **synchronously** — no dialog can be awaited from here. So the gesture is refused first and
 * the question asked after: once every document has been answered for, nothing is dirty and the
 * next attempt goes straight through.
 *
 * It covers the ways the work goes with the window rather than with a tab — quitting, and the
 * developer reload — for a document AND for a file view, whose edits live outside the documents
 * store. It does not cover `refreshDocuments`, which drops documents on a project change without
 * unloading anything, and which no `beforeunload` can see.
 *
 * A script goes with the rest: it is a document since Code became a space, so `SCRIPT_IO` is what
 * writes it — one channel per file, where a second one left `heads` stale and asked to overwrite.
 */
export function guardUnsavedWork(target: Window): () => void {
  // A second ⌘Q while the first question is still on screen would stack a dialog per press.
  let asking = false

  const resumeAfterSettling = async (): Promise<void> => {
    let proceed = false
    try {
      // A write that throws — a project on a volume that went away — would otherwise close the
      // dialog and say nothing, leaving every attempt to leave to replay the same silent scene.
      // File views FIRST: settling the documents forgets them, and a cancel on a file view asked
      // after that kept the window with the document tabs already gone.
      proceed = (await settleFileViews()) && (await settleUnsavedWork())
    } catch (error) {
      reportFailure('document.close', '', error)
    }
    try {
      const bridge = getBridge()
      if (bridge) await bridge.window.resumeLeave(proceed)
      else if (proceed) window.close()
    } finally {
      asking = false
    }
  }

  const refuse = (event: BeforeUnloadEvent): void => {
    if (unsavedDocumentIds().length === 0 && !fileViewsHoldEdits()) return
    event.preventDefault()
    if (asking) return

    asking = true
    void resumeAfterSettling()
  }

  target.addEventListener('beforeunload', refuse)
  return () => target.removeEventListener('beforeunload', refuse)
}
