import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { renameLayer } from '@/engines/canvas/commands'
import { fakeCanvas } from '@/features/image/canvasHost-fixtures'
import { holdCanvas } from '@/features/image/canvasHosts'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { useCanvases } from '@/stores/canvases'
import { useDocuments } from '@/stores/documents'
import { type DocumentWrite } from '@shared/domain/document'
import type { ReadFidelity } from '@shared/domain/readFidelity'
import i18next from 'i18next'
import { describe, expect, it, vi } from 'vitest'

const WHEN = '2026-09-10T00:00:00.000Z'

import type { NewDocumentAnswer } from '@shared/domain/newDocument'

import { picture, saveDocument, unsavedDocumentIds } from './documentIoTest-fixtures'

/**
 * The two protections a save answers to BEFORE it writes anything — §5.7 of the spec.
 *
 * Both are checked on what reaches the disk rather than on a return value: the point of putting
 * them ahead of the write is that a refusal leaves the folder exactly as it was, and « saved
 * nothing » is only believable if no channel was called.
 */
describe('a save that would not be faithful', () => {
  const openPictureDocument = async (
    path: string,
    sourceFidelity: ReadFidelity | undefined,
  ): Promise<{ documentId: string; release: () => void }> => {
    useAssets.setState({ items: [{ ...picture(), path }] })
    const created = await useDocuments.getState().create('image', {
      title: 'Gemini 3.1',
      sourceAssetId: 'asset-1',
      ...(sourceFidelity ? { sourceFidelity } : {}),
    })
    if (!created) throw new Error('expected a document')
    useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)
    const release = holdCanvas(created.id, () => fakeCanvas({}))
    useCanvases.getState().runCommand(created.id, renameLayer('layer-1', 'Backdrop'))
    return { documentId: created.id, release }
  }

  const watchWrites = (): {
    write: ReturnType<typeof vi.fn>
    picture: ReturnType<typeof vi.fn>
  } => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    const savePicture = vi.fn(() => Promise.resolve(picture()))
    installFakeBridge({
      documents: { write },
      assets: { savePicture, saveLayered: savePicture },
    })
    return { write, picture: savePicture }
  }

  it('writes nothing at all when the picture was read below its own size', async () => {
    const written = watchWrites()
    const { documentId, release } = await openPictureDocument('Images/hero.png', 'reduced')

    await expect(saveDocument(documentId)).resolves.toBe(false)
    release()

    expect(written.write).not.toHaveBeenCalled()
    expect(written.picture).not.toHaveBeenCalled()
    // Still modified: the work is unsaved, and nothing may suggest otherwise.
    expect(unsavedDocumentIds()).toEqual([documentId])
  })

  /**
   * Absent is not permission — and it is not the same refusal either: one says the studio shrank
   * the file on the way in, the other that nothing here knows how it was read. Only the second
   * has a gesture that clears it, and its sentence names that gesture.
   */
  it('writes nothing, and says so differently, when nothing says how the picture was read', async () => {
    const written = watchWrites()
    const { entries } = bridgeWatchingLogs()
    const { documentId, release } = await openPictureDocument('Images/hero.png', undefined)

    await expect(saveDocument(documentId)).resolves.toBe(false)
    release()

    expect(written.write).not.toHaveBeenCalled()
    expect(entries()).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(i18next.t('documents.sourceReadUnknown')),
      }),
    ])
  })

  it('says why, in the sentence the refusal owns', async () => {
    const { entries } = bridgeWatchingLogs()
    const { documentId, release } = await openPictureDocument('Images/hero.png', 'reduced')

    await saveDocument(documentId)
    release()

    expect(entries()).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(i18next.t('documents.sourceReadReduced')),
      }),
    ])
  })

  /** The JPEG chain: the writer only makes PNG, and `replaceBytes` renames what it replaces. */
  it('writes nothing when the bytes would land under another extension', async () => {
    const written = watchWrites()
    const { documentId, release } = await openPictureDocument('Images/hero.jpg', 'faithful')

    await expect(saveDocument(documentId)).resolves.toBe(false)
    release()

    expect(written.write).not.toHaveBeenCalled()
    expect(written.picture).not.toHaveBeenCalled()
  })

  /** A format the writable table does not name falls back to the container — also a change. */
  it('writes nothing when a format it cannot write would fall back to a container', async () => {
    const written = watchWrites()
    const { documentId, release } = await openPictureDocument('Images/loop.gif', 'faithful')

    await expect(saveDocument(documentId)).resolves.toBe(false)
    release()

    expect(written.write).not.toHaveBeenCalled()
    expect(written.picture).not.toHaveBeenCalled()
  })
})

/**
 * A refusal is a protection, not an answer — §5.1. It used to be the end of the road: a JPEG
 * painted on said no and left the person with nothing to do about it. Every one of them now
 * carries the one destination that is always available with it.
 */
describe('a refused save, offered another destination', () => {
  const openJpegDocument = async (): Promise<{ documentId: string; release: () => void }> => {
    useAssets.setState({ items: [{ ...picture(), path: 'Images/hero.jpg' }] })
    const created = await useDocuments.getState().create('image', {
      title: 'Gemini 3.1',
      sourceAssetId: 'asset-1',
      sourceFidelity: 'faithful',
    })
    if (!created) throw new Error('expected a document')
    useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)
    const release = holdCanvas(created.id, () => fakeCanvas({}))
    useCanvases.getState().runCommand(created.id, renameLayer('layer-1', 'Backdrop'))
    return { documentId: created.id, release }
  }

  it('writes where the person then chose, and the tab saves there from now on', async () => {
    const savePicture = vi.fn(() =>
      Promise.resolve({ ...picture(), id: 'asset-2', name: 'Affiche' }),
    )
    installFakeBridge({
      documents: {
        write: () => Promise.resolve<DocumentWrite>('written'),
        confirmSaveElsewhere: () => Promise.resolve(true),
      },
      assets: { savePicture },
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
            place: { kind: 'image', title: 'Affiche', folder: 'Images', format: 'png' },
          }),
      },
    })
    const { documentId, release } = await openJpegDocument()

    await expect(saveDocument(documentId)).resolves.toBe(true)
    release()

    expect(savePicture).toHaveBeenCalledWith(expect.objectContaining({ name: 'Affiche' }))
    expect(useDocuments.getState().documents[documentId]?.sourceAssetId).toBe('asset-2')
  })

  /** Nobody is at the machine to answer a window: the pass says the refusal and writes nothing. */
  it('raises nothing under autosave, and still says why', async () => {
    const confirmSaveElsewhere = vi.fn(() => Promise.resolve(true))
    const { entries } = bridgeWatchingLogs({ documents: { confirmSaveElsewhere } })
    const { documentId, release } = await openJpegDocument()

    await expect(saveDocument(documentId, false)).resolves.toBe(false)
    release()

    expect(confirmSaveElsewhere).not.toHaveBeenCalled()
    expect(entries()).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(i18next.t('documents.sourceFormatChange')),
      }),
    ])
  })

  /**
   * Nothing moved since the last save, so this ⌘S writes nothing back — and a question raised
   * over a write that will not happen is a dialog for a gesture with no effect.
   */
  it('asks nothing at all when the document has not moved', async () => {
    const confirmSaveElsewhere = vi.fn(() => Promise.resolve(false))
    installFakeBridge({
      documents: {
        write: () => Promise.resolve<DocumentWrite>('written'),
        confirmSaveElsewhere,
      },
    })
    useAssets.setState({ items: [{ ...picture(), path: 'Images/hero.jpg' }] })
    const created = await useDocuments.getState().create('image', {
      title: 'Gemini 3.1',
      sourceAssetId: 'asset-1',
      sourceFidelity: 'faithful',
    })
    if (!created) throw new Error('expected a document')
    useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)
    const release = holdCanvas(created.id, () => fakeCanvas({}))

    await expect(saveDocument(created.id)).resolves.toBe(true)
    release()

    expect(confirmSaveElsewhere).not.toHaveBeenCalled()
  })
})
