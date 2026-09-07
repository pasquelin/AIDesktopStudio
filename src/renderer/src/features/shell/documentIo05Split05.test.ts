import { addNode } from '@/engines/scene/commands'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useScenes } from '@/stores/scenes'
import type { CloseChoice, DocumentDescriptor } from '@shared/domain/document'
import { type DocumentWrite } from '@shared/domain/document'
import { describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import { box, deleteDocument } from './documentIoTest-fixtures'

describe('deleting a document', () => {
  const openScene = async (): Promise<string> => {
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().ensure(created.id, createDefaultScene)
    return created.id
  }

  // Left standing, a double-click on the row would open an empty document under the same id,
  // and the next ⌘S would write back what was just deleted.
  it('re-reads the folder so the deleted row goes with the file', async () => {
    const list = vi.fn(() => Promise.resolve<DocumentDescriptor[]>([]))
    installFakeBridge({
      documents: {
        list,
        remove: () => Promise.resolve(),
        confirmDelete: () => Promise.resolve(true),
      },
    })
    const documentId = await openScene()
    list.mockClear()

    await deleteDocument(documentId)
    expect(list).toHaveBeenCalled()
  })

  it('removes the file and closes the tab once confirmed', async () => {
    const remove = vi.fn(() => Promise.resolve())
    installFakeBridge({ documents: { remove, confirmDelete: () => Promise.resolve(true) } })
    const documentId = await openScene()

    await expect(deleteDocument(documentId)).resolves.toBe(true)
    expect(remove).toHaveBeenCalledWith(documentId, 'scene')
    expect(useDocuments.getState().documents[documentId]).toBeUndefined()
  })

  it('touches nothing when the confirmation is declined', async () => {
    const remove = vi.fn(() => Promise.resolve())
    installFakeBridge({ documents: { remove, confirmDelete: () => Promise.resolve(false) } })
    const documentId = await openScene()

    await expect(deleteDocument(documentId)).resolves.toBe(false)
    expect(remove).not.toHaveBeenCalled()
    expect(useDocuments.getState().documents[documentId]).toBeDefined()
  })

  // The file is going: writing it on the way out would save and delete in the same breath.
  it('never offers to save the work of a document being deleted', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    const confirmClose = vi.fn(() => Promise.resolve<CloseChoice>('save'))
    installFakeBridge({
      documents: { write, confirmClose, confirmDelete: () => Promise.resolve(true) },
    })
    const documentId = await openScene()
    useScenes.getState().runCommand(documentId, addNode(box))

    await deleteDocument(documentId)
    expect(confirmClose).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })
})
