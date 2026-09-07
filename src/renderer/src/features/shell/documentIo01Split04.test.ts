import { DEFAULT_CANVAS, pixelLayer } from '@/engines/canvas/canvasState'
import { addLayer } from '@/engines/canvas/commands'
import { addNode } from '@/engines/scene/commands'
import { fakeCanvas } from '@/features/image/canvasHost-fixtures'
import { holdCanvas } from '@/features/image/canvasHosts'
import { PNG_HEAD } from '@/game/game-fixtures'
import { bytesToBase64 } from '@shared/base64'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { canvasStore, useCanvases } from '@/stores/canvases'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useScenes } from '@/stores/scenes'
import { type DocumentWrite } from '@shared/domain/document'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import {
  box,
  picture,
  restoreDocument,
  saveDocument,
  saveDocumentAs,
  scene,
} from './documentIoTest-fixtures'

describe('saveDocument', () => {
  const openScene = async (): Promise<string> => {
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().runCommand(created.id, addNode(box))
    return created.id
  }

  describe('saveDocumentAs', () => {
    const PNG = bytesToBase64(PNG_HEAD)

    /** What the engine was told to forget — nothing, for a gesture that overwrites nothing. */
    let forgotten: string[] = []

    beforeEach(() => {
      forgotten = []
    })

    const openLinkedImage = async (): Promise<{ documentId: string; release: () => void }> => {
      useAssets.setState({ items: [{ ...picture(), path: 'Images/hero.png' }] })
      const created = await useDocuments
        .getState()
        .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset-1' })
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

    it('writes a copy beside the asset rather than over it', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
      })
      const { documentId, release } = await openLinkedImage()

      await expect(saveDocumentAs(documentId)).resolves.toBe(true)
      release()

      expect(savePicture).toHaveBeenCalledWith({
        derivedFrom: 'asset-1',
        name: 'Gemini 3.1 copie',
        png: PNG,
        format: 'png',
      })
      // The original's picture is untouched, so the loader's copy of it is still the truth.
      expect(forgotten).toEqual([])
    })

    // The tab carries on with the copy: a second ⌘S must land on the new asset, not the old one.
    it('opens a document linked to the copy, and leaves the first one alone', async () => {
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: {
          savePicture: () => Promise.resolve(picture()),
          saveLayered: () => Promise.resolve(picture()),
        },
      })
      const { documentId, release } = await openLinkedImage()

      await saveDocumentAs(documentId)
      release()

      const documents = Object.values(useDocuments.getState().documents)
      expect(documents).toHaveLength(2)
      expect(documents.at(-1)).toMatchObject({
        title: 'Gemini 3.1 copie',
        sourceAssetId: 'asset-1',
      })
      // The original tab keeps pointing at the original asset.
      expect(useDocuments.getState().documents[documentId]?.sourceAssetId).toBe('asset-1')
    })

    /** A blank document edits no asset, so there is nothing to copy — and it says so. */
    it('refuses a document that edits no asset, out loud', async () => {
      const { entries } = bridgeWatchingLogs({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
      })

      await expect(saveDocumentAs(await openScene())).resolves.toBe(false)

      expect(entries()).toHaveLength(1)
      // `assets.copy`, never `assets.save`: ⇧⌘S makes a copy and rewrites nothing, so every
      // refusal here is a copy that was not made — not a save that failed.
      expect(entries()[0]).toMatchObject({ scope: 'assets.copy' })
    })

    // Nothing baked means nothing to copy: no second document is opened onto an asset that was
    // never written, which would be a tab pointing at a picture that does not exist.
    it('opens nothing when the picture cannot be extracted yet', async () => {
      const { entries } = bridgeWatchingLogs({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
      })
      const created = await useDocuments
        .getState()
        .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset-1' })
      if (!created) throw new Error('expected a document')

      useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)
      const release = holdCanvas(created.id, () => fakeCanvas())

      await expect(saveDocumentAs(created.id)).resolves.toBe(false)
      release()

      expect(Object.keys(useDocuments.getState().documents)).toHaveLength(1)
      expect(entries()[0]).toMatchObject({ scope: 'assets.copy' })
    })

    // No engine at all, as opposed to one whose context is still coming up: both mean there are
    // no pixels to bake, and neither may open a tab onto an asset that was never written.
    it('opens nothing when no engine holds the document', async () => {
      const { entries } = bridgeWatchingLogs({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
      })
      const created = await useDocuments
        .getState()
        .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset-1' })
      if (!created) throw new Error('expected a document')
      useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)

      await expect(saveDocumentAs(created.id)).resolves.toBe(false)

      expect(entries()[0]).toMatchObject({ scope: 'assets.copy' })
    })

    it('says so when the copy itself is refused', async () => {
      const { entries } = bridgeWatchingLogs({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture: () => Promise.reject(new Error('disk full')) },
      })
      const { documentId, release } = await openLinkedImage()

      await expect(saveDocumentAs(documentId)).resolves.toBe(false)
      release()

      expect(entries()[0]).toMatchObject({ scope: 'assets.copy' })
    })

    /**
     * The copy is what reached the disk, so the copy is what opens clean. Marking the ORIGINAL
     * saved is the trap: `capture` closes over its id, and calling its `commit` would clear the
     * bullet of a tab whose file was never rewritten — it would then close without a word, and
     * the work in it would go with it.
     */
    it('leaves the original tab modified, since nothing was written for it', async () => {
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        // A stack, so the copy is a container rather than a flatten — which is the one write
        // ⇧⌘S must never be for a document holding layers.
        assets: { saveLayered: () => Promise.resolve(picture()) },
      })
      const { documentId, release } = await openLinkedImage()
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-1', 'Layer')))
      expect(canvasStore.hasUnsavedWork(useCanvases.getState(), documentId)).toBe(true)

      await expect(saveDocumentAs(documentId)).resolves.toBe(true)
      release()

      // The copy is on disk and opens clean; the original's own file was never rewritten.
      expect(canvasStore.hasUnsavedWork(useCanvases.getState(), documentId)).toBe(true)
      const copy = Object.values(useDocuments.getState().documents).at(-1)
      expect(canvasStore.hasUnsavedWork(useCanvases.getState(), copy?.id ?? '')).toBe(false)
    })

    /** A document nothing could read must not be copied either: the copy would hold nothing. */
    it('refuses a document whose file would not read', async () => {
      installFakeBridge({
        documents: {
          write: () => Promise.resolve<DocumentWrite>('written'),
          read: () => Promise.reject(new Error('gone')),
        },
      })
      useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

      await restoreDocument('doc-1')
      await expect(saveDocumentAs('doc-1')).resolves.toBe(false)
    })
  })

  it('writes nothing for a space that has no serialized form yet', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({ documents: { write } })

    const created = await useDocuments.getState().create('image')
    if (!created) throw new Error('expected a document')
    await saveDocument(created.id)

    expect(write).not.toHaveBeenCalled()
  })
})
