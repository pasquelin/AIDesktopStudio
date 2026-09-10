import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { createRecoveryFiles } from './recoveryFiles'
import { parseRecoveryDraft } from './recoveryValidation'
import { orWhenGone } from './store'
import { parseDocumentId } from './validation'

/**
 * The four routes of the recovery area — §9.
 *
 * Apart from `handlers.ts` for the reason `askHandlers.ts` gives about the questions: they share
 * no dependency with the rest of the project routes, and the file they were in reached the size
 * guard's five hundred lines.
 */
export function registerRecoveryHandlers(projectPath: () => string): void {
  const recovery = createRecoveryFiles(projectPath)

  handle(CHANNELS.recoveryWrite, (_event, draft) => recovery.write(parseRecoveryDraft(draft)))
  handle(CHANNELS.recoveryList, () => orWhenGone(() => recovery.list(), []))
  handle(CHANNELS.recoveryRead, (_event, documentId) => recovery.read(parseDocumentId(documentId)))
  handle(CHANNELS.recoveryClear, (_event, documentId) =>
    recovery.clear(parseDocumentId(documentId)),
  )
}
