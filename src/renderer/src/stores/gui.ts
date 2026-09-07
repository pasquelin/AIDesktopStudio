import { uiFromTemplate, type UiTemplateId } from '@shared/domain/uiTemplates'
import { newId } from '@/helpers/ids'
import type { SelectionMode } from '@/helpers/selection'
import { setUiSelection } from '@/engines/gui/guiCommands'
import { createDocumentStore } from './documentStore'
import { EMPTY_GUI, type GuiState } from '@/engines/gui/guiState'
import i18next from 'i18next'

const store = createDocumentStore<GuiState>(EMPTY_GUI)

export const guiStore = store

export const useGuis = store.use

export const isGuiDirty = store.isDirty

export const guiOf = store.stateOf

export const guiHistoryOf = store.historyOf

/**
 * What is designated, written WITHOUT an entry in the history — a click is not an edit, and a
 * ⌘Z that gave back a selection would cost one press per row before undoing anything.
 *
 * Guarded on the ids rather than on the state: clicking a row already selected is the gesture
 * that opens a drag, and writing the document back would have the stage redraw on it.
 */
export function selectInGui(
  documentId: string,
  ids: readonly string[],
  mode: SelectionMode = 'replace',
): void {
  const state = useGuis.getState()
  const current = guiOf(state, documentId)
  const next = setUiSelection(current, ids, mode)

  if (next.selectedIds !== current.selectedIds) state.replaceView(documentId, next)
}

/**
 * Fills a freshly made document with what its template opens on, before any editor mounts.
 *
 * `ensure`, so this never writes over an interface already there — and the state being present
 * is exactly what stops `restoreDocument` from putting the studio default in its place.
 */
export function seedGuiTemplate(documentId: string, template: UiTemplateId): void {
  store.use.getState().ensure(documentId, () => ({
    document: uiFromTemplate(template, newId, i18next.t('game.controlsMenu.title')),
    selectedIds: [],
  }))
}
