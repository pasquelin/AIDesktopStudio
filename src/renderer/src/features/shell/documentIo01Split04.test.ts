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
import type { NamedDocumentPlace, NewDocumentAnswer } from '@shared/domain/newDocument'
import type { StudioBridge } from '@shared/ipc'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const WHEN = '2026-09-10T00:00:00.000Z'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import {
  box,
  picture,
  restoreDocument,
  saveDocument,
  saveDocumentAs,
  saveDocumentCopy,
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

    /**
     * The window's answer: a name, a folder and a format, exactly as a person would fill it —
     * over the open project, which this gesture asks the main process for rather than reading.
     */
    const chooses = (place: Partial<NamedDocumentPlace>) => ({
      project: {
        current: () =>
          Promise.resolve({
            path: '/tmp/p',
            manifest: { version: 1, createdAt: WHEN, updatedAt: WHEN },
          }),
      },
      newDocument: {
        ask: () =>
          Promise.resolve<NewDocumentAnswer>({
            answer: 'made',
            place: { kind: 'image', title: 'Affiche', folder: 'Images', ...place },
          }),
      },
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

    it('writes the name, the folder and the format that were chosen', async () => {
      const savePicture = vi.fn(() => Promise.resolve({ ...picture(), id: 'asset-2' }))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
        ...chooses({ title: 'Affiche', folder: 'Images/Tirages', format: 'png' }),
      })
      const { documentId, release } = await openLinkedImage()

      await expect(saveDocumentAs(documentId)).resolves.toBe(true)
      release()

      expect(savePicture).toHaveBeenCalledWith({
        derivedFrom: 'asset-1',
        documentId,
        name: 'Affiche',
        folder: 'Images/Tirages',
        png: PNG,
        format: 'png',
      })
      // The file it was opened from is left exactly as it was: nothing overwrote it.
      expect(forgotten).toEqual([])
    })

    /**
     * The whole of « the new destination becomes the active one » (§5.3): the tab writes there
     * from now on. It used to stand a SECOND tab on the copy and leave the first one pointing at
     * the file it had just declined to write — so a second ⌘S landed back on the original.
     */
    it('carries the same tab on to the file it just wrote', async () => {
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: {
          savePicture: () => Promise.resolve({ ...picture(), id: 'asset-2', name: 'Affiche' }),
        },
        ...chooses({ format: 'png' }),
      })
      const { documentId, release } = await openLinkedImage()

      await expect(saveDocumentAs(documentId)).resolves.toBe(true)
      release()

      expect(Object.keys(useDocuments.getState().documents)).toEqual([documentId])
      expect(useDocuments.getState().documents[documentId]).toMatchObject({
        title: 'Affiche',
        sourceAssetId: 'asset-2',
        sourceFidelity: 'faithful',
      })
    })

    /** The container, for a document holding a stack — never a flatten of it. */
    it('writes the container when the chosen format is the layered one', async () => {
      const saveLayered = vi.fn(() => Promise.resolve({ ...picture(), id: 'asset-2' }))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { saveLayered },
        ...chooses({ format: 'ora' }),
      })
      const { documentId, release } = await openLinkedImage()
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-1', 'Layer')))

      await expect(saveDocumentAs(documentId)).resolves.toBe(true)
      release()

      expect(saveLayered).toHaveBeenCalled()
      expect(canvasStore.hasUnsavedWork(useCanvases.getState(), documentId)).toBe(false)
    })

    /** Cancelling writes nothing, moves nothing, and leaves the work where it was. */
    it('writes nothing when the window is closed', async () => {
      const savePicture = vi.fn(() => Promise.resolve(picture()))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
      })
      const { documentId, release } = await openLinkedImage()

      await expect(saveDocumentAs(documentId)).resolves.toBe(false)
      release()

      expect(savePicture).not.toHaveBeenCalled()
      expect(useDocuments.getState().documents[documentId]?.sourceAssetId).toBe('asset-1')
    })

    it('says so when the write itself is refused', async () => {
      const { entries } = bridgeWatchingLogs({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture: () => Promise.reject(new Error('disk full')) },
        ...chooses({ format: 'png' }),
      })
      const { documentId, release } = await openLinkedImage()

      await expect(saveDocumentAs(documentId)).resolves.toBe(false)
      release()

      expect(entries()[0]).toMatchObject({ scope: 'assets.save' })
    })

    /**
     * A scene writes a document FILE, and a new one: a document's id lives inside its file, so
     * the tab moves to the file that was written while the one it came from keeps its own.
     */
    it('moves a document that has a file of its own onto the new one', async () => {
      const write = vi.fn<StudioBridge['documents']['write']>(() =>
        Promise.resolve<DocumentWrite>('written'),
      )
      installFakeBridge({
        documents: { write },
        ...chooses({ kind: 'scene', title: 'Repérage', folder: 'Scenes' }),
      })
      const documentId = await openScene()

      await expect(saveDocumentAs(documentId)).resolves.toBe(true)

      const [id, kind, draft, force, place] = write.mock.calls[0] ?? []
      expect({ kind, force, place }).toEqual({
        kind: 'scene',
        force: false,
        place: { folder: 'Scenes' },
      })
      expect(draft).toMatchObject({ title: 'Repérage' })
      expect(id).not.toBe(documentId)
      // The tab it came from is gone, and the one standing holds what was written.
      expect(Object.keys(useDocuments.getState().documents)).toEqual([id])
    })

    /**
     * §5.3, third row — and the whole of what tells it from « Save as »: the copy is written and
     * the tab stays on what it was editing, destination, history and place in the layout intact.
     */
    it('writes a copy of a picture and leaves the tab on the file it edits', async () => {
      const savePicture = vi.fn(() => Promise.resolve({ ...picture(), id: 'asset-2' }))
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { savePicture },
        ...chooses({ title: 'Affiche', folder: 'Images/Tirages', format: 'png' }),
      })
      const { documentId, release } = await openLinkedImage()

      await expect(saveDocumentCopy(documentId)).resolves.toBe(true)
      release()

      // NO `documentId`: a copy is a file of its own, and stamping the open document's identity
      // into it would leave two files claiming one document.
      expect(savePicture).toHaveBeenCalledWith({
        derivedFrom: 'asset-1',
        name: 'Affiche',
        folder: 'Images/Tirages',
        png: PNG,
        format: 'png',
      })
      expect(useDocuments.getState().documents[documentId]).toMatchObject({
        title: 'Gemini 3.1',
        sourceAssetId: 'asset-1',
      })
    })

    /** A file document's copy is a file of its own, under an id of its own — and no tab on it. */
    it('writes a copy of a document file without opening a tab on it', async () => {
      const write = vi.fn<StudioBridge['documents']['write']>(() =>
        Promise.resolve<DocumentWrite>('written'),
      )
      installFakeBridge({
        documents: { write },
        ...chooses({ kind: 'scene', title: 'Repérage', folder: 'Scenes' }),
      })
      const documentId = await openScene()

      await expect(saveDocumentCopy(documentId)).resolves.toBe(true)

      const [id, , draft] = write.mock.calls[0] ?? []
      expect(id).not.toBe(documentId)
      expect(draft).toMatchObject({ title: 'Repérage' })
      expect(Object.keys(useDocuments.getState().documents)).toEqual([documentId])
    })

    // A copy is not a save: the document still holds work nothing has written to ITS destination.
    it('leaves the work unsaved, a copy being no save of the document', async () => {
      installFakeBridge({
        documents: { write: () => Promise.resolve<DocumentWrite>('written') },
        assets: { saveLayered: () => Promise.resolve({ ...picture(), id: 'asset-2' }) },
        ...chooses({ format: 'ora' }),
      })
      const { documentId, release } = await openLinkedImage()
      useCanvases.getState().runCommand(documentId, addLayer(pixelLayer('layer-1', 'Layer')))

      await expect(saveDocumentCopy(documentId)).resolves.toBe(true)
      release()

      expect(canvasStore.hasUnsavedWork(useCanvases.getState(), documentId)).toBe(true)
    })

    /** A document nothing could read holds nothing to write anywhere. */
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
