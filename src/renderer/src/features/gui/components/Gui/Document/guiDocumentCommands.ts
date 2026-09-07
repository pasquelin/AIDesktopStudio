import type { CommandId } from '@shared/domain/command'
import { runHistoryCommand } from '@/services/historyCommand'
import { guiStore } from '@/stores/gui'

/**
 * The commands of an interface, reached the same way from the tab and from a headless run.
 * Named for the DOCUMENT: `engines/gui/guiCommands.ts` holds the undoable ones, and two files of
 * one name read as a single module in every import list.
 */
export const runGuiDocumentCommand = (documentId: string, command: CommandId): boolean =>
  runHistoryCommand(guiStore, 'gui', documentId, command) ?? false
