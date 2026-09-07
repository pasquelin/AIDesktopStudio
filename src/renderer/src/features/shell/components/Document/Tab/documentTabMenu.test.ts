import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextMenuAction, ContextMenuRow } from '@/helpers/contextMenu'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { installDocument } from '@/stores/document-fixtures'
import { openDocumentTabMenu } from './documentTabMenu'

/** The rows the menu was asked to show, which is the whole of what it decides. */
const shown = vi.hoisted((): ContextMenuRow[][] => [])

vi.mock('@/helpers/contextMenu', () => ({
  showContextMenu: (rows: ContextMenuRow[]) => {
    shown.push(rows)
    return Promise.resolve()
  },
}))

const rowNamed = (label: string): ContextMenuAction | undefined =>
  shown.at(-1)?.find((row): row is ContextMenuAction => 'onSelect' in row && row.label === label)

const open = (documentId: string): void =>
  openDocumentTabMenu({
    documentId,
    // The label is the key here: no bundle is loaded, and what a case reads is which row it is.
    t: ((key: string) => key) as never,
    onRename: () => {},
  })

beforeEach(() => {
  shown.length = 0
})

describe('what can be done to a tab', () => {
  it('offers to rename and to delete a document of the project', () => {
    installDocument('doc-1', '3d')

    open('doc-1')

    expect(rowNamed('documents.rename')?.disabled).toBeFalsy()
    expect(rowNamed('documents.delete')?.disabled).toBeFalsy()
  })

  /**
   * 🛑 A character tab has no file in the project: it rigs a model of the library, so its name
   * and its removal belong to the shelf. Offered here, Delete would have reached for a file this
   * document never wrote, and Rename for one it does not own.
   */
  it('offers neither on a character, which is named and removed in the library', () => {
    installCharacterDocument('doc-hero', 'asset-hero')

    open('doc-hero')

    expect(rowNamed('documents.rename')?.disabled).toBe(true)
    expect(rowNamed('documents.delete')?.disabled).toBe(true)
    // The rest of the menu stands: closing a tab has never touched a file.
    expect(rowNamed('documents.close')?.disabled).toBeFalsy()
  })
})
