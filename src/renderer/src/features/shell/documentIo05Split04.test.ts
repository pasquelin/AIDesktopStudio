import { addNode } from '@/engines/scene/commands'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useScenes } from '@/stores/scenes'
import type { CloseChoice } from '@shared/domain/document'
import { type DocumentWrite } from '@shared/domain/document'
import { describe, expect, it } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import { box, closeDocument } from './documentIoTest-fixtures'

describe('closing a document', () => {
  const openDirtyScene = async (): Promise<string> => {
    installFakeBridge({ documents: { write: () => Promise.resolve<DocumentWrite>('written') } })
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().runCommand(created.id, addNode(box))
    return created.id
  }

  it('drops the state and the history a closed document was holding', async () => {
    const documentId = await openDirtyScene()
    installFakeBridge({
      documents: { confirmClose: () => Promise.resolve<CloseChoice>('discard') },
    })

    await closeDocument(documentId)
    expect(useScenes.getState().states[documentId]).toBeUndefined()
    expect(useScenes.getState().histories[documentId]).toBeUndefined()
  })
})
