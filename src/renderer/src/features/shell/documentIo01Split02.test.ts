import { DEFAULT_CANVAS, pixelLayer, textLayer } from '@/engines/canvas/canvasState'
import { addLayer, renameLayer, resizeCanvas } from '@/engines/canvas/commands'
import { fakeCanvas } from '@/features/image/canvasHost-fixtures'
import { holdCanvas } from '@/features/image/canvasHosts'
import { PNG_HEAD } from '@/game/game-fixtures'
import { bytesToBase64 } from '@shared/base64'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { canvasStore, useCanvases } from '@/stores/canvases'
import { useDocuments } from '@/stores/documents'
import { type DocumentWrite } from '@shared/domain/document'
import type { SaveLayeredRequest } from '@shared/ipc'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import { PIXELS, picture, saveDocument, unsavedDocumentIds } from './documentIoTest-fixtures'

describe('saveDocument', () => {
  describe('the asset behind the document', () => {
    const PNG = bytesToBase64(PNG_HEAD)

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

    it('writes the asset it edits, after the document', async () => {
      const order: string[] = []
      const savePicture = vi.fn(() => {
        order.push('asset')
        return Promise.resolve(picture())
      })
      installFakeBridge({
        documents: {
          write: () => {
            order.push('document')
            return Promise.resolve<DocumentWrite>('written')
          },
        },
        assets: { savePicture },
      })
      shelve('Images/hero.png')
      const { documentId, release } = await openImage('asset-1')
      editImage(documentId)

      await expect(saveDocument(documentId)).resolves.toBe(true)
      release()

      // `name` rides along because the channel is shaped like `saveAudio`'s; an overwrite keeps
      // the name the asset already has, so this is not ⌘S renaming anything. `format` is the
      // source file's own, so an overwrite never changes what the file IS.
      expect(savePicture).toHaveBeenCalledWith({
        replaces: 'asset-1',
        name: 'Gemini 3.1',
        png: PNG,
        format: 'png',
      })
      expect(order).toEqual(['document', 'asset'])
    })

    it('tells the engine to forget the picture it has just overwritten', async () => {
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture: () => Promise.resolve(picture()) },
      })
      const { documentId, release } = await openImage('asset-1')
      editImage(documentId)

      await saveDocument(documentId)
      release()

      expect(forgotten).toEqual(['asset-1'])
    })

    it('writes the asset even when the document no longer measures what it did', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
      })
      shelve('Images/hero.png')
      const { documentId, release } = await openImage('asset-1')
      editImage(documentId)
      useCanvases.getState().runCommand(documentId, resizeCanvas(320, 200, { x: 0, y: 0 }))

      await expect(saveDocument(documentId)).resolves.toBe(true)
      release()

      expect(savePicture).toHaveBeenCalledWith({
        replaces: 'asset-1',
        name: 'Gemini 3.1',
        png: PNG,
        format: 'png',
      })
    })

    it('counts a painted picture among the work a window would lose', async () => {
      installFakeBridge({ documents: { write: () => Promise.resolve<DocumentWrite>('written') } })
      const { documentId, release } = await openImage('asset-1')
      expect(unsavedDocumentIds()).toEqual([])

      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-1', 'Layer')))
      release()

      expect(unsavedDocumentIds()).toEqual([documentId])
    })

    it('leaves an untouched tab’s asset exactly as it was', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
      })
      const { documentId, release } = await openImage('asset-1')

      await expect(saveDocument(documentId)).resolves.toBe(true)
      release()

      expect(savePicture).not.toHaveBeenCalled()
    })

    it('writes the flattened picture into a source that cannot hold the stack', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      const confirmFlatten = vi.fn(() => Promise.resolve(true))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written'), confirmFlatten },
        assets: { savePicture },
      })
      shelve('Images/hero.png')
      const { documentId, release } = await openImage('asset-1')
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-2', 'Layer')))

      await expect(saveDocument(documentId)).resolves.toBe(true)
      release()

      expect(confirmFlatten).toHaveBeenCalled()
      expect(savePicture).toHaveBeenCalled()
    })

    it('asks once for a document, never again', async () => {
      const confirmFlatten = vi.fn(() => Promise.resolve(true))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written'), confirmFlatten },
        assets: { savePicture: () => Promise.resolve(picture()) },
      })
      shelve('Images/hero.png')
      const { documentId, release } = await openImage('asset-1')
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-2', 'Layer')))

      await saveDocument(documentId)
      useCanvases.getState().runCommand(documentId, renameLayer('layer-2', 'Second'))
      await saveDocument(documentId)
      release()

      expect(confirmFlatten).toHaveBeenCalledTimes(1)
    })

    it('leaves the asset alone when the flatten is declined', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      installFakeBridge({
        documents: {
          write: () => Promise.resolve<DocumentWrite>('written'),
          confirmFlatten: () => Promise.resolve(false),
        },
        assets: { savePicture },
      })
      shelve('Images/hero.png')
      const { documentId, release } = await openImage('asset-1')
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-2', 'Layer')))

      await expect(saveDocument(documentId)).resolves.toBe(true)
      release()

      expect(savePicture).not.toHaveBeenCalled()
      expect(canvasStore.hasUnsavedWork(useCanvases.getState(), documentId)).toBe(false)
    })

    it('writes a stack straight back into a source that can hold one', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      const saveLayered = vi.fn((_request: SaveLayeredRequest) => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture, saveLayered },
      })
      shelve('Images/hero.ora')
      const { documentId, release } = await openImage('asset-1')
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-2', 'Layer')))

      await expect(saveDocument(documentId)).resolves.toBe(true)
      release()

      // The container, never the flatten: sending these bytes down `savePicture` would write a
      // PNG under the `.ora`'s own name and destroy the stack the format was chosen to hold.
      expect(savePicture).not.toHaveBeenCalled()
      expect(saveLayered).toHaveBeenCalledTimes(1)
      expect(saveLayered.mock.calls[0]?.[0]).toMatchObject({
        replaces: 'asset-1',
        format: 'ora',
      })
    })

    it('reads the pixels back off the card once, whatever the second half of ⌘S needs', async () => {
      let flattens = 0
      let extractions = 0
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { saveLayered: () => Promise.resolve(picture()) },
      })
      shelve('Images/hero.ora')
      const created = await useDocuments
        .getState()
        .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset-1' })
      if (!created) throw new Error('expected a document')
      useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)
      const release = holdCanvas(created.id, () =>
        fakeCanvas({
          flatten: () => {
            flattens += 1
            return Promise.resolve(PNG_HEAD)
          },
          pixelSnapshots: () => {
            extractions += 1
            return Promise.resolve([])
          },
        }),
      )
      useCanvases.getState().runCommand(created.id, addLayer(pixelLayer('layer-2', 'Layer')))

      await expect(saveDocument(created.id)).resolves.toBe(true)
      release()

      expect({ flattens, extractions }).toEqual({ flattens: 1, extractions: 1 })
    })

    it('reads the format off the file, never off the name the shelf shows', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      const saveLayered = vi.fn((_request: SaveLayeredRequest) => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture, saveLayered },
      })
      useAssets.setState({ items: [{ ...picture(), name: 'hero.png', path: 'Images/hero.ora' }] })
      const { documentId, release } = await openImage('asset-1')
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-2', 'Layer')))

      await saveDocument(documentId)
      release()

      expect(savePicture).not.toHaveBeenCalled()
      expect(saveLayered).toHaveBeenCalledTimes(1)
    })

    it('sends the whole stack down the layered channel', async () => {
      const saveLayered = vi.fn((_request: SaveLayeredRequest) => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { saveLayered },
      })
      shelve('Images/hero.ora')
      const created = await useDocuments
        .getState()
        .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset-1' })
      if (!created) throw new Error('expected a document')
      useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)
      // The engine hands its surfaces over, which is what a layer of the container is made of:
      // one with no pixels is left out of the stack, so a fake that has none writes nothing.
      const release = holdCanvas(created.id, () =>
        fakeCanvas({
          pixelSnapshots: () =>
            Promise.resolve([
              { layerId: 'layer-1', mask: false, data: PIXELS },
              { layerId: 'layer-2', mask: false, data: PIXELS },
            ]),
        }),
      )
      useCanvases.getState().runCommand(created.id, addLayer(pixelLayer('layer-2', 'Layer')))

      await saveDocument(created.id)
      release()

      expect(saveLayered.mock.calls[0]?.[0].document.stack.nodes).toHaveLength(2)
      expect(saveLayered.mock.calls[0]?.[0].document.surfaces).toContainEqual({
        path: 'mergedimage.png',
        png: PNG_HEAD,
      })
    })

    it('writes OpenRaster rather than guessing, when the source format is not one it writes', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      const saveLayered = vi.fn((_request: SaveLayeredRequest) => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture, saveLayered },
      })
      shelve('Images/scan.tif')
      const { documentId, release } = await openImage('asset-1')
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-2', 'Layer')))

      await saveDocument(documentId)
      release()

      expect(saveLayered).toHaveBeenCalled()
      expect(savePicture).not.toHaveBeenCalled()
    })

    it('names what the source file could not have held', async () => {
      const confirmFlatten = vi.fn(() => Promise.resolve(true))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written'), confirmFlatten },
        assets: { savePicture: () => Promise.resolve(picture()) },
      })
      shelve('Images/hero.png')
      const { documentId, release } = await openImage('asset-1')
      useCanvases
        .getState()
        .runCommand(documentId, addLayer(textLayer('t', 'Hello', { x: 0, y: 0 })))

      await saveDocument(documentId)
      release()

      expect(confirmFlatten).toHaveBeenCalledWith('Gemini 3.1', 'PNG', 'calques, texte modifiable')
    })

    it('does not write the asset again when nothing moved since', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
      })
      const { documentId, release } = await openImage('asset-1')
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-2', 'Layer')))

      await saveDocument(documentId)
      await saveDocument(documentId)
      release()

      expect(savePicture).toHaveBeenCalledTimes(1)
    })

    it('writes no asset for a document that edits none', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
      })
      const { documentId, release } = await openImage()
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-1', 'Layer')))

      await expect(saveDocument(documentId)).resolves.toBe(true)
      release()

      expect(savePicture).not.toHaveBeenCalled()
    })
  })
})
