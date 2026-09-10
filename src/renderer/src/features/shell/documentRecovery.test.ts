import { addNode } from '@/engines/scene/commands'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { isSceneDirty, useScenes } from '@/stores/scenes'
import type { DocumentWrite } from '@shared/domain/document'
import type { RecoveryDraft, RecoveryEntry } from '@shared/domain/recovery'
import { describe, expect, it, vi } from 'vitest'

import {
  box,
  closeDocument,
  keepUnsavedWorkSafe,
  offerRecoveredWork,
  saveDocument,
} from './documentIoTest-fixtures'

const ENTRY: RecoveryEntry = {
  documentId: 'doc-back',
  kind: 'scene',
  title: 'Repérage',
  workspace: '3d',
  path: 'Scenes/Repérage.gltf',
  savedAt: '2026-09-10T09:00:00.000Z',
}

/**
 * The net under unsaved work — §9 of the spec, and the answer to the two defects it names: the
 * pass wrote the user's own files (so opening a video left an `.otio` beside it) and the image
 * had no net at all.
 */
describe('the recovery area', () => {
  const openScene = async (): Promise<string> => {
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().runCommand(created.id, addNode(box))
    return created.id
  }

  it('writes the unsaved work of an open document', async () => {
    const write = vi.fn((_draft: RecoveryDraft) => Promise.resolve<'written'>('written'))
    installFakeBridge({ recovery: { write } })
    const documentId = await openScene()

    await keepUnsavedWorkSafe()

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ entry: expect.objectContaining({ documentId, kind: 'scene' }) }),
    )
  })

  /** Writing an entry is not saving: a document the net has held is still unsaved work. */
  it('leaves the document modified', async () => {
    installFakeBridge({})
    const documentId = await openScene()

    await keepUnsavedWorkSafe()

    expect(isSceneDirty(useScenes.getState(), documentId)).toBe(true)
  })

  it('drops what a save covers', async () => {
    const clear = vi.fn(() => Promise.resolve())
    installFakeBridge({
      documents: { write: () => Promise.resolve<DocumentWrite>('written') },
      recovery: { clear },
    })
    const documentId = await openScene()

    await saveDocument(documentId)

    expect(clear).toHaveBeenCalledWith(documentId)
  })

  /** Purged at the CONFIRMED abandonment, and never before it — §9.1, guarantee 4. */
  it('drops the entry only once the abandonment is confirmed', async () => {
    const clear = vi.fn(() => Promise.resolve())
    installFakeBridge({
      documents: { confirmClose: () => Promise.resolve('cancel') },
      recovery: { clear },
    })
    const documentId = await openScene()

    await closeDocument(documentId)
    expect(clear).not.toHaveBeenCalled()

    installFakeBridge({
      documents: { confirmClose: () => Promise.resolve('discard') },
      recovery: { clear },
    })
    await closeDocument(documentId)
    expect(clear).toHaveBeenCalledWith(documentId)
  })

  it('offers what is waiting rather than taking it back', async () => {
    const confirmRestore = vi.fn(() => Promise.resolve(false))
    const read = vi.fn(() => Promise.resolve(null))
    installFakeBridge({ recovery: { list: () => Promise.resolve([ENTRY]), confirmRestore, read } })

    await offerRecoveredWork()

    expect(confirmRestore).toHaveBeenCalledWith(1)
    expect(read).not.toHaveBeenCalled()
  })

  /**
   * Restored work is UNSAVED work. Filled in and left reading as saved, the next close would
   * throw it away without a question — the very loss the area exists to prevent.
   */
  it('brings the work back as work nobody has written down', async () => {
    installFakeBridge({
      recovery: {
        list: () => Promise.resolve([ENTRY]),
        confirmRestore: () => Promise.resolve(true),
        read: () => Promise.resolve({ entry: ENTRY, content: JSON.stringify({ nodes: [box] }) }),
      },
    })

    await offerRecoveredWork()

    expect(isSceneDirty(useScenes.getState(), ENTRY.documentId)).toBe(true)
  })
})
