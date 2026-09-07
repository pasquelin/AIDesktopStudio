import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { fakeCanvas } from '@/features/image/canvasHost-fixtures'
import { holdCanvas } from '@/features/image/canvasHosts'
import { PNG_HEAD } from '@/game/game-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { useCanvases } from '@/stores/canvases'
import { useDocuments } from '@/stores/documents'
import type { DocumentDraft, DocumentKind } from '@shared/domain/document'
import { DOCUMENT_VERSION, documentFolderOf, type DocumentWrite } from '@shared/domain/document'
import { isOraSurfacePath } from '@shared/domain/openRaster'
import { describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import { PIXELS, oraContent, restoreDocument, saveDocument } from './documentIoTest-fixtures'

describe('an image document', () => {
  const openImage = async (): Promise<string> => {
    const created = await useDocuments.getState().create('image')
    if (!created) throw new Error('expected a document')
    useCanvases.getState().ensure(created.id, () => DEFAULT_CANVAS)
    return created.id
  }

  it('writes one surface per texture, named after the layer it belongs to', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({ documents: { write } })
    const documentId = await openImage()
    const release = holdCanvas(documentId, () =>
      fakeCanvas({
        pixelSnapshots: () =>
          Promise.resolve([
            { layerId: 'layer-1', mask: false, data: PIXELS },
            { layerId: 'layer-1', mask: true, data: PIXELS },
          ]),
      }),
    )

    await saveDocument(documentId)
    release()

    expect(write).toHaveBeenCalledWith(
      documentId,
      'image',
      expect.objectContaining({
        parts: [
          { path: 'mergedimage.png', png: PNG_HEAD },
          { path: 'data/p_layer-1.png', png: PIXELS },
          { path: 'data/m_layer-1.png', png: PIXELS },
        ],
      }),
      false,
      documentFolderOf('image'),
    )
  })

  /**
   * The container has no document without one: `mergedimage.png` is what every other application
   * draws of a `.ora`, and the spec requires it. A save that wrote a stack with no flatten under
   * it would make a file that opens as nothing, with the layers inside it intact and unreachable.
   */
  it('refuses to save rather than write a container with no flatten in it', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({ documents: { write } })
    const documentId = await openImage()
    const release = holdCanvas(documentId, () =>
      fakeCanvas({ flatten: () => Promise.resolve(null) }),
    )

    await expect(saveDocument(documentId)).rejects.toThrow(/would open as nothing/)
    expect(write).not.toHaveBeenCalled()
    release()
  })

  // Every surface name becomes a ZIP entry the main process writes, so the two ends have to agree.
  it('names its surfaces so the file layer accepts them', async () => {
    const written: DocumentDraft[] = []
    installFakeBridge({
      documents: {
        write: (_id, _kind, draft) => {
          written.push(draft)
          return Promise.resolve<DocumentWrite>('written')
        },
      },
    })
    const documentId = await openImage()
    const release = holdCanvas(documentId, () =>
      fakeCanvas({
        pixelSnapshots: () => Promise.resolve([{ layerId: 'a-b_1', mask: true, data: PIXELS }]),
      }),
    )

    await saveDocument(documentId)
    release()

    expect(written[0]?.parts).toHaveLength(2)
    for (const part of written[0]?.parts ?? []) expect(isOraSurfacePath(part.path)).toBe(true)
  })

  /**
   * The container is replaced whole, so writing one with no pictures would delete the ones on
   * disk and mark the document clean — the work gone, with nothing said. The engine is
   * unreachable while it boots its GPU context, which is exactly when a ⌘S after switching
   * workspace lands.
   */
  it('refuses to save rather than write a document without its pixels', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({ documents: { write } })
    const documentId = await openImage()

    await expect(saveDocument(documentId)).rejects.toThrow(/pixels cannot be read/)
    expect(write).not.toHaveBeenCalled()
  })

  /**
   * A suffix would not be injective: a layer literally called `x-mask` and the mask of a layer
   * called `x` would claim the same file, and one would quietly overwrite the other.
   */
  it('tells a layer called like a mask apart from a mask', async () => {
    const written: DocumentDraft[] = []
    installFakeBridge({
      documents: {
        write: (_id, _kind, draft) => {
          written.push(draft)
          return Promise.resolve<DocumentWrite>('written')
        },
      },
    })
    const documentId = await openImage()
    const release = holdCanvas(documentId, () =>
      fakeCanvas({
        pixelSnapshots: () =>
          Promise.resolve([
            { layerId: 'x-mask', mask: false, data: PIXELS },
            { layerId: 'x', mask: true, data: PIXELS },
          ]),
      }),
    )

    await saveDocument(documentId)
    release()

    expect(written[0]?.parts?.map(part => part.path)).toEqual([
      'mergedimage.png',
      'data/p_x-mask.png',
      'data/m_x.png',
    ])
  })

  // One odd id costs that layer's pixels, never the whole document: `reviveLayer` takes whatever
  // a file holds, and the save must not fail on all of it.
  it('skips a layer whose id could not be a container entry', async () => {
    const written: DocumentDraft[] = []
    installFakeBridge({
      documents: {
        write: (_id, _kind, draft) => {
          written.push(draft)
          return Promise.resolve<DocumentWrite>('written')
        },
      },
    })
    const documentId = await openImage()
    const release = holdCanvas(documentId, () =>
      fakeCanvas({
        pixelSnapshots: () =>
          Promise.resolve([
            { layerId: 'a b', mask: false, data: PIXELS },
            { layerId: 'fine', mask: false, data: PIXELS },
          ]),
      }),
    )

    await saveDocument(documentId)
    release()

    expect(written[0]?.parts?.map(part => part.path)).toEqual([
      'mergedimage.png',
      'data/p_fine.png',
    ])
  })

  it('hands every saved picture back to the engine on the way in', async () => {
    const restoreSnapshot = vi.fn(() => Promise.resolve())
    installFakeBridge({
      documents: {
        read: () =>
          Promise.resolve({
            version: DOCUMENT_VERSION,
            kind: 'image' as DocumentKind,
            title: 'Poster',
            content: oraContent(JSON.stringify(DEFAULT_CANVAS)),
            updatedAt: '2026-08-08T10:00:00.000Z',
            parts: [{ path: 'data/m_layer-1.png', png: PIXELS }],
          }),
      },
    })
    const documentId = 'doc-img'
    useDocuments.setState({
      documents: {
        [documentId]: {
          id: documentId,
          kind: 'image',
          workspace: 'image',
          title: 'Poster',
          path: 'documents/Poster.ora',
        },
      },
      activeId: documentId,
    })
    const release = holdCanvas(documentId, () =>
      fakeCanvas({
        restoreSnapshot,
      }),
    )

    await restoreDocument(documentId)
    release()

    expect(restoreSnapshot).toHaveBeenCalledWith({
      layerId: 'layer-1',
      mask: true,
      data: PIXELS,
    })
  })

  // A container may hold entries this studio never wrote — a preview a foreign editor left.
  it('ignores a surface that names no layer', async () => {
    const restoreSnapshot = vi.fn(() => Promise.resolve())
    installFakeBridge({
      documents: {
        read: () =>
          Promise.resolve({
            version: DOCUMENT_VERSION,
            kind: 'image' as DocumentKind,
            title: 'Poster',
            content: oraContent(JSON.stringify(DEFAULT_CANVAS)),
            updatedAt: '2026-08-08T10:00:00.000Z',
            parts: [{ path: 'data/preview.png', png: PIXELS }],
          }),
      },
    })
    const documentId = 'doc-img-2'
    useDocuments.setState({
      documents: {
        [documentId]: {
          id: documentId,
          kind: 'image',
          workspace: 'image',
          title: 'Poster',
          path: 'documents/Poster.ora',
        },
      },
      activeId: documentId,
    })
    const release = holdCanvas(documentId, () =>
      fakeCanvas({
        restoreSnapshot,
      }),
    )

    await restoreDocument(documentId)
    release()

    expect(restoreSnapshot).not.toHaveBeenCalled()
  })
})

/**
 * The kinds a string holds. What is checked is the whole round trip rather than either half: a
 * serializer and a reader that agree only with themselves would pass two separate tests and
 * still lose the document.
 */
