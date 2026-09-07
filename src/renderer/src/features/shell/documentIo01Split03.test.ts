import { pushEdit } from '@/engines/audio/edits'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { renameLayer } from '@/engines/canvas/commands'
import { addNode } from '@/engines/scene/commands'
import { fakeCanvas } from '@/features/image/canvasHost-fixtures'
import { holdCanvas } from '@/features/image/canvasHosts'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { useAudioEdits } from '@/stores/audioEdits'
import { canvasStore, useCanvases } from '@/stores/canvases'
import { useDocuments } from '@/stores/documents'
import { useScenes } from '@/stores/scenes'
import { DOCUMENT_VERSION, type DocumentWrite } from '@shared/domain/document'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import {
  PIXELS,
  box,
  oraContent,
  picture,
  rehydrateDocument,
  saveDocument,
  savedFile,
} from './documentIoTest-fixtures'

describe('saveDocument', () => {
  const openScene = async (): Promise<string> => {
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().runCommand(created.id, addNode(box))
    return created.id
  }

  describe('the asset behind the document', () => {
    let forgotten: string[] = []

    beforeEach(() => {
      forgotten = []
    })

    const openImage = async (
      sourceAssetId?: string,
    ): Promise<{ documentId: string; release: () => void }> => {
      const created = await useDocuments
        .getState()
        .create('image', sourceAssetId ? { title: 'Gemini 3.1', sourceAssetId } : undefined)
      if (!created) throw new Error('expected a document')

      useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)
      const release = holdCanvas(created.id, () =>
        fakeCanvas({
          forgetPicture: assetId => {
            forgotten.push(assetId)
            return Promise.resolve()
          },
        }),
      )
      return { documentId: created.id, release }
    }

    const editImage = (documentId: string): void =>
      useCanvases.getState().runCommand(documentId, renameLayer('layer-1', 'Backdrop'))

    const shelve = (path: string): void => {
      useAssets.setState({ items: [{ ...picture(), path }] })
    }

    it('hands a remounted engine the pixels the document holds on disk', async () => {
      const restored: string[] = []
      installFakeBridge({
        documents: {
          write: () => Promise.resolve<DocumentWrite>('written'),
          read: () =>
            Promise.resolve({
              version: DOCUMENT_VERSION,
              kind: 'image',
              title: 'Gemini 3.1',
              content: oraContent(JSON.stringify(DEFAULT_CANVAS)),
              updatedAt: '2026-08-12T10:00:00.000Z',
              parts: [{ path: 'data/p_layer-1.png', png: PIXELS }],
            }),
        },
      })
      const { documentId, release } = await openImage('asset-1')
      release()

      // The engine that comes up after the switch, holding nothing.
      const remounted = holdCanvas(documentId, () =>
        fakeCanvas({
          restoreSnapshot: pixels => {
            restored.push(pixels.layerId)
            return Promise.resolve()
          },
        }),
      )
      await rehydrateDocument(documentId)
      remounted()

      expect(restored).toEqual(['layer-1'])
    })

    it('says so when the file it would read back refuses', async () => {
      const { entries } = bridgeWatchingLogs({
        documents: {
          write: () => Promise.resolve<DocumentWrite>('written'),
          read: () => Promise.reject(new Error('gone')),
        },
      })
      const { documentId, release } = await openImage('asset-1')
      release()

      await rehydrateDocument(documentId)

      expect(entries()[0]).toMatchObject({ scope: 'document.load' })
    })

    it('reads nothing back for a kind that keeps everything in its state', async () => {
      const read = vi.fn(() => Promise.resolve(savedFile()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written'), read },
      })

      const documentId = await openScene()
      await rehydrateDocument(documentId)

      expect(read).not.toHaveBeenCalled()
    })

    it('hands nothing back when the file carries no pixels', async () => {
      installFakeBridge({
        documents: {
          write: () => Promise.resolve<DocumentWrite>('written'),
          read: () =>
            Promise.resolve({
              version: DOCUMENT_VERSION,
              kind: 'image',
              title: 'Gemini 3.1',
              content: JSON.stringify(DEFAULT_CANVAS),
              updatedAt: '2026-08-12T10:00:00.000Z',
            }),
        },
      })
      const restored: string[] = []
      const { documentId, release } = await openImage('asset-1')
      release()

      const remounted = holdCanvas(documentId, () =>
        fakeCanvas({
          restoreSnapshot: pixels => {
            restored.push(pixels.layerId)
            return Promise.resolve()
          },
        }),
      )
      await rehydrateDocument(documentId)
      remounted()

      expect(restored).toEqual([])
    })

    it('leaves a document that has not been filled to the reader that fills it', async () => {
      const read = vi.fn(() => Promise.resolve(null))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written'), read },
      })
      useDocuments.setState({
        documents: {
          'doc-1': {
            id: 'doc-1',
            kind: 'image',
            title: 'x',
            workspace: 'image',
            path: 'documents/x.ora',
          },
        },
      })

      await rehydrateDocument('doc-1')

      expect(read).not.toHaveBeenCalled()
    })

    it('writes the asset on the next ⌘S after one that failed', async () => {
      let refuse = true
      const savePicture = vi.fn(() => {
        if (refuse) return Promise.reject(new Error('disk full'))
        return Promise.resolve(picture())
      })
      bridgeWatchingLogs({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
      })
      shelve('Images/hero.png')
      const { documentId, release } = await openImage('asset-1')
      editImage(documentId)

      await saveDocument(documentId)
      // Nothing was edited in between, and the document is clean: only the debt makes it retry.
      refuse = false
      await saveDocument(documentId)
      release()

      expect(savePicture).toHaveBeenCalledTimes(2)
    })

    it('says so, and retries, when there was nothing to bake yet', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      let booting = (): void => undefined
      const { entries } = bridgeWatchingLogs({
        documents: {
          write: () => {
            booting()
            return Promise.resolve<DocumentWrite>('written')
          },
        },
        assets: { savePicture },
      })
      const created = await useDocuments
        .getState()
        .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset-1' })
      if (!created) throw new Error('expected a document')
      shelve('Images/hero.png')
      useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)

      booting = holdCanvas(created.id, () => fakeCanvas())
      editImage(created.id)
      await saveDocument(created.id)

      expect(savePicture).not.toHaveBeenCalled()
      expect(entries()[0]).toMatchObject({ scope: 'assets.save' })

      // The engine is up now, and the debt is what brings the asset back into line.
      booting = () => undefined
      const ready = holdCanvas(created.id, () => fakeCanvas())
      await saveDocument(created.id)
      ready()

      expect(savePicture).toHaveBeenCalledTimes(1)
    })

    it('keeps the document written when the asset is refused', async () => {
      const { entries } = bridgeWatchingLogs({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture: () => Promise.reject(new Error('disk full')) },
      })
      const { documentId, release } = await openImage('asset-1')
      editImage(documentId)

      await expect(saveDocument(documentId)).resolves.toBe(true)
      release()

      expect(canvasStore.hasUnsavedWork(useCanvases.getState(), documentId)).toBe(false)
      expect(entries()[0]).toMatchObject({ scope: 'assets.save' })
    })

    it('leaves a take alone too, chain and all', async () => {
      const saveAudio = vi.fn(() => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { saveAudio },
      })

      const created = await useDocuments
        .getState()
        .create('audio', { title: 'pad.wav', sourceAssetId: 'asset-take' })
      if (!created) throw new Error('expected a document')
      useAudioEdits
        .getState()
        .runCommand(created.id, pushEdit('clip-a', { kind: 'normalize', targetLufs: -14 }))

      await expect(saveDocument(created.id)).resolves.toBe(true)

      expect(saveAudio).not.toHaveBeenCalled()
    })
  })
})
