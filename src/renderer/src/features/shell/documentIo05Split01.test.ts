import { addNode } from '@/engines/scene/commands'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { isSceneDirty, sceneStore, useScenes } from '@/stores/scenes'
import type { CloseChoice } from '@shared/domain/document'
import { type DocumentWrite } from '@shared/domain/document'
import { describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import { box, closeDocument, closeWindow, restoreDocument, scene } from './documentIoTest-fixtures'

describe('closing a document', () => {
  const openDirtyScene = async (): Promise<string> => {
    installFakeBridge({ documents: { write: () => Promise.resolve<DocumentWrite>('written') } })
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().runCommand(created.id, addNode(box))
    return created.id
  }

  it('never asks about a tab that was opened and never touched', async () => {
    const confirmClose = vi.fn(() => Promise.resolve<CloseChoice>('cancel'))
    installFakeBridge({ documents: { confirmClose } })

    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().ensure(created.id, createDefaultScene)

    await expect(closeDocument(created.id)).resolves.toBe(true)
    expect(confirmClose).not.toHaveBeenCalled()
  })

  it('still calls that untouched document modified on its tab', async () => {
    installFakeBridge({})
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().ensure(created.id, createDefaultScene)

    expect(isSceneDirty(useScenes.getState(), created.id)).toBe(true)
  })

  it('keeps the tab open when the save it was asked for is refused', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({
      documents: {
        write,
        read: () => Promise.reject(new Error('gone')),
        confirmClose: () => Promise.resolve<CloseChoice>('save'),
      },
    })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await restoreDocument('doc-1')
    useScenes.getState().runCommand('doc-1', addNode(box))

    await expect(closeDocument('doc-1')).resolves.toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(useDocuments.getState().documents['doc-1']).toBeDefined()
  })

  it('closes a clean document without asking anything', async () => {
    const confirmClose = vi.fn(() => Promise.resolve<CloseChoice>('cancel'))
    installFakeBridge({
      documents: { confirmClose, write: () => Promise.resolve<DocumentWrite>('written') },
    })

    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().ensure(created.id, createDefaultScene)
    useScenes.getState().markSaved(created.id, sceneStore.markOf(useScenes.getState(), created.id))

    await expect(closeDocument(created.id)).resolves.toBe(true)
    expect(confirmClose).not.toHaveBeenCalled()
  })

  it('writes the document when the answer is save', async () => {
    const documentId = await openDirtyScene()
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({
      documents: { write, confirmClose: () => Promise.resolve<CloseChoice>('save') },
    })

    await expect(closeDocument(documentId)).resolves.toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(useDocuments.getState().documents[documentId]).toBeUndefined()
  })

  it('throws the work away when the answer is discard', async () => {
    const documentId = await openDirtyScene()
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({
      documents: { write, confirmClose: () => Promise.resolve<CloseChoice>('discard') },
    })

    await expect(closeDocument(documentId)).resolves.toBe(true)
    expect(write).not.toHaveBeenCalled()
    expect(useDocuments.getState().documents[documentId]).toBeUndefined()
  })

  // The emptied centre is a screen of its own — it stages the assistant thread, and a window
  // that went with the last tab would take that screen with it.
  it('leaves the window open when the tab it closed was the last one', async () => {
    installFakeBridge({})
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().ensure(created.id, createDefaultScene)
    useScenes.getState().markSaved(created.id, sceneStore.markOf(useScenes.getState(), created.id))

    await closeDocument(created.id)

    expect(useDocuments.getState().documents).toEqual({})
    expect(closeWindow).not.toHaveBeenCalled()
  })
})
