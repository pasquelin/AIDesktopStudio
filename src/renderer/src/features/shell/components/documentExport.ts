import type { LogScope, StudioBridge } from '@shared/ipc'
import type { TaskWatch } from '@shared/domain/taskProgress'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'
import { runTask } from '@/stores/tasks'

export type DocumentExport = {
  /** What the file is called when the tab has no title of its own. */
  kind: string
  /** The channel a failure goes out on — an enumeration, so a space cannot invent one. */
  scope: LogScope
  /** What that failure names: a size, a target, a format. */
  label: string
}

/**
 * An export of a document — a task named after its tab, and a failure reported on the space's own
 * channel. Nothing awaits these calls, so a writer that refuses would otherwise reject into no
 * one's hands and leave a menu click looking exactly like a dismissed dialog.
 */
export async function runDocumentExport(
  documentId: string,
  { kind, scope, label }: DocumentExport,
  write: (bridge: StudioBridge, watch: TaskWatch) => Promise<unknown>,
): Promise<void> {
  const bridge = getBridge()
  if (!bridge) return

  try {
    // `async` and not a bare arrow: `runTask` calls its work OUTSIDE its own guard, so a writer
    // throwing synchronously would leave a task row running at nothing for the life of the window.
    await runTask(
      documentExportName(useDocuments.getState(), documentId, kind),
      async (_id, watch) => write(bridge, watch),
    )
  } catch (error) {
    reportFailure(scope, label, error)
  }
}
