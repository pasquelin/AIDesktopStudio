import type { CommandId, CommandScope } from '@shared/domain/command'
import { canRedo, canUndo } from '@/engines/core/history'
import type { DocumentStore } from '@/stores/documentStore'

/**
 * `<scope>.undo` and `<scope>.redo` against one document store, the way every tab answers them.
 * `null` for any other command; `false` on an empty stack — answered `ok` regardless, a model sent
 * nine undos in a row and took the whole decor apart (bench pass, 2026-08-26).
 */
export function runHistoryCommand<S>(
  store: DocumentStore<S>,
  scope: CommandScope,
  documentId: string,
  command: CommandId,
): boolean | null {
  const state = store.use.getState()
  if (command === `${scope}.undo`) {
    if (!canUndo(store.historyOf(state, documentId))) return false
    state.undo(documentId)
    return true
  }
  if (command === `${scope}.redo`) {
    if (!canRedo(store.historyOf(state, documentId))) return false
    state.redo(documentId)
    return true
  }
  return null
}
