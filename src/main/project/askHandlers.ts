import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import {
  askCloseChoice,
  askDeleteDocument,
  askFlattenDocument,
  askOverwriteDocument,
  askRestoreRecovery,
} from './documentDialogs'
import { askTrashProject } from './projectDialogs'
import type { AskUser } from './documentDialogs'
import { parseDocumentTitle, parseProjectName } from './validation'

/** A count on its way into a sentence: whatever crossed, it is a small whole number here. */
const parseCount = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, 9999) : 0

/**
 * The routes that only ASK. They move nothing: each one raises the system's dialog, answers what
 * the person said, and the window decides what to do with it.
 *
 * 🛑 Apart from the gestures themselves on purpose, and the split is what makes the boundary
 * honest: `document.deleteFromDisk` and `project.trash` are reachable from the WIRE, where a
 * native dialog would stand for good — nobody on the other side of the machine can answer one.
 * They raise none. A hand at the machine comes through here first, and the doing follows.
 *
 * A file of its own since 2026-09-09, when `handlers.ts` reached the size guard's 500 lines: the
 * five questions were the one group in it that shares no dependency with the rest.
 *
 * 🛑 `ask` is HANDED here, never imported: `ProjectHandlerDeps` declares it so every suite of
 * `handlers0N.test.ts` can put a fake in front of it. Reaching for `serviceDialogs` directly cut
 * that seam and pointed the tests at the real `dialog.showMessageBox`.
 */
export function registerAskHandlers(ask: AskUser): void {
  handle(CHANNELS.projectConfirmTrash, (_event, name) =>
    askTrashProject(ask, parseProjectName(name)),
  )
  handle(CHANNELS.documentConfirmClose, (_event, title) =>
    askCloseChoice(ask, parseDocumentTitle(title)),
  )
  handle(CHANNELS.documentConfirmDelete, (_event, title) =>
    askDeleteDocument(ask, parseDocumentTitle(title)),
  )
  handle(CHANNELS.documentConfirmFlatten, (_event, title, format, lost) =>
    askFlattenDocument(ask, parseDocumentTitle(title), String(format), String(lost)),
  )
  handle(CHANNELS.documentConfirmOverwrite, (_event, title) =>
    askOverwriteDocument(ask, parseDocumentTitle(title)),
  )
  handle(CHANNELS.recoveryConfirmRestore, (_event, count) =>
    askRestoreRecovery(ask, parseCount(count)),
  )
}
