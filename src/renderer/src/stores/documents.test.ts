import { beforeEach, describe, expect, it } from 'vitest'
import {
  documentFolderOf,
  type DocumentDescriptor,
  type DocumentWrite,
} from '@shared/domain/document'
import { workshopIdOf } from '@shared/domain/character'
import { installFakeBridge } from '@/services/fakeBridge'
import { documentForAsset, documentForFile } from './documentIdentity'
import { activeSceneOrWorkshopId, documentsIn, useDocuments } from './documents'
import { showPanels } from './layout-fixtures'
import { useLayouts } from './layouts'

const POSTER: DocumentDescriptor = {
  id: 'from-disk',
  kind: 'image',
  title: 'Poster',
  workspace: 'image',
  path: 'documents/Poster.ora',
}

const showing = (...ids: readonly string[]): void => showPanels(...ids)

describe('documents store', () => {
  beforeEach(() => {
    localStorage.clear()
    useDocuments.setState({ documents: {}, activeId: null, recent: {} })
    useLayouts.setState({ layout: null, projectPath: null })
    installFakeBridge()
  })

  // The bug this store was rewritten for: `localStorage` belongs to the application, not to the
  // project, so opening another one showed the previous project's tabs — pointing at files that
  // are not there, or at a file of the same id in another project entirely.
  it('keeps nothing in local storage, the project folder being what says a document exists', async () => {
    await useDocuments.getState().create('3d')

    expect(localStorage.getItem('ai-desktop-studio:documents')).toBeNull()
  })

  // A file per tab opened and never typed in would litter the project with empty documents
  // that only a hand could remove. A document reaches the folder when it holds something.
  it('writes nothing until the document holds something', async () => {
    const written: string[] = []
    installFakeBridge({
      documents: {
        write: id => {
          written.push(id)
          return Promise.resolve<DocumentWrite>('written')
        },
      },
    })

    await useDocuments.getState().create('3d')
    expect(written).toEqual([])
  })

  // Counting the open tabs alone handed the same name twice: a document saved under « Scène 1 »
  // and closed is still called that, and the folder is what remembers it.
  it('numbers a new document against the folder as much as against the tabs', async () => {
    installFakeBridge({
      documents: {
        list: () =>
          Promise.resolve([
            {
              id: 'saved-then-closed',
              kind: 'scene',
              title: 'Scène 1',
              workspace: '3d',
              path: `${documentFolderOf('scene')}/Scène 1.gltf`,
            },
          ]),
      },
    })

    const created = await useDocuments.getState().create('3d')
    // The NEXT number, not merely a different name: a title the studio would never propose leaves
    // this green with the listing dropped entirely — measured, that is what it used to assert.
    expect(created?.title).toBe('Scène 2')
  })

  describe('refresh', () => {
    it('replaces what it holds with what the project answers', async () => {
      await useDocuments.getState().create('3d')
      showing(POSTER.id)
      installFakeBridge({ documents: { list: () => Promise.resolve([POSTER]) } })

      await useDocuments.getState().refresh()

      expect(Object.keys(useDocuments.getState().documents)).toEqual([POSTER.id])
    })

    it('keeps only the documents a layout still shows', async () => {
      showing('other')
      installFakeBridge({ documents: { list: () => Promise.resolve([POSTER]) } })

      await useDocuments.getState().refresh()

      expect(useDocuments.getState().documents[POSTER.id]).toBeUndefined()
    })

    /**
     * The folder answers what the FILE says, and three fields are in no file: which asset the tab
     * edits, where it sits, and how faithfully it was read. Overwritten wholesale, a relist turned
     * a picture's tab into a document with no destination — and the next ⌘S wrote an `.ora` beside
     * the picture rather than into it.
     */
    it('keeps the links a tab holds that no file carries', async () => {
      showing(POSTER.id)
      useDocuments.setState({
        documents: {
          [POSTER.id]: {
            ...POSTER,
            sourceAssetId: 'asset_42',
            sourcePath: 'Images/Planche.png',
            sourceFidelity: 'reduced',
          },
        },
      })
      installFakeBridge({ documents: { list: () => Promise.resolve([POSTER]) } })

      await useDocuments.getState().refresh()

      expect(useDocuments.getState().documents[POSTER.id]).toMatchObject({
        sourceAssetId: 'asset_42',
        sourcePath: 'Images/Planche.png',
        sourceFidelity: 'reduced',
      })
    })

    // A tab of the project being left cannot stay in front of the one being opened.
    it('puts nothing in front', async () => {
      useDocuments.setState({ activeId: 'from-the-other-project' })
      await useDocuments.getState().refresh()

      expect(useDocuments.getState().activeId).toBeNull()
    })

    // The main process opens the last project on launch, which broadcasts a change while the
    // first listing is still in flight: the last answer to arrive is not the one asked for last.
    it('ignores a listing that comes back after another was asked for', async () => {
      showing(POSTER.id, 'second')
      const second: DocumentDescriptor = { ...POSTER, id: 'second', title: 'Later' }
      let release = (): void => {}
      const slow = new Promise<DocumentDescriptor[]>(resolve => {
        release = () => resolve([POSTER])
      })

      installFakeBridge({ documents: { list: () => slow } })
      const first = useDocuments.getState().refresh()

      installFakeBridge({ documents: { list: () => Promise.resolve([second]) } })
      await useDocuments.getState().refresh()

      release()
      await first

      expect(Object.keys(useDocuments.getState().documents)).toEqual(['second'])
    })

    // No project open, or a folder that went away while it was: an empty centre beats a throw
    // nobody catches.
    it('empties the centre rather than throwing when the project cannot answer', async () => {
      installFakeBridge({ documents: { list: () => Promise.reject(new Error('no project')) } })

      await expect(useDocuments.getState().refresh()).resolves.toBe(false)
      expect(Object.keys(useDocuments.getState().documents)).toHaveLength(0)
    })

    // An empty centre is honest about a folder that went away and says nothing about which
    // tabs deserve to survive it: whoever settles those has to tell the two apart.
    it('says the folder answered when it did, empty or not', async () => {
      installFakeBridge({ documents: { list: () => Promise.resolve([]) } })

      await expect(useDocuments.getState().refresh()).resolves.toBe(true)
    })

    it('says nothing of a listing another refresh overtook', async () => {
      let release = (): void => {}
      const slow = new Promise<DocumentDescriptor[]>(resolve => {
        release = () => resolve([])
      })
      installFakeBridge({ documents: { list: () => slow } })

      const overtaken = useDocuments.getState().refresh()
      installFakeBridge({ documents: { list: () => Promise.resolve([]) } })
      await useDocuments.getState().refresh()
      release()

      await expect(overtaken).resolves.toBe(false)
    })
  })

  it('creates a scene document in the 3d workspace', async () => {
    const created = await useDocuments.getState().create('3d')
    expect(created?.kind).toBe('scene')
    expect(created?.workspace).toBe('3d')
  })

  it('creates a material document in the materials workspace', async () => {
    const created = await useDocuments.getState().create('materials')
    expect(created?.kind).toBe('material')
  })

  /**
   * 🛑 The names the STUDIO engenders — an OTIO import, a copy — are freed rather than refused:
   * importing one montage twice, or copying one document twice, stood two tabs on one file and
   * each save overwrote the other (2026-09-09). A name a person TYPED is refused instead, at the
   * naming field and before the assistant's own creation.
   */
  it('frees a name a document of that folder already holds', async () => {
    const { create } = useDocuments.getState()
    const first = await create('image', { title: 'Montage' })

    expect((await create('image', { title: 'Montage' }))?.path).not.toBe(first?.path)
  })

  /**
   * The numbering counts blank documents, and an asset-opened one carries the asset's name. Left
   * in the tally, three pictures opened from the shelf made the FIRST untitled document of the
   * space « Sans titre 4 ».
   */
  it('does not count asset-opened documents when numbering a blank one', async () => {
    const { create } = useDocuments.getState()
    const first = await create('image')
    await create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset_1' })
    await create('image', { title: 'Gemini 3.2', sourceAssetId: 'asset_2' })

    const second = await create('image')
    expect(second?.title).not.toBe(first?.title)
    // The third blank one, had the two assets counted, would have been numbered 5.
    expect((await create('image'))?.title).toContain('3')
  })

  /**
   * Both creations await the same in-flight listing, so a state read BEFORE that await hands
   * them the same number — two tabs called « Sans titre 1 », indistinguishable everywhere.
   */
  it('numbers two creations in flight apart', async () => {
    const { create } = useDocuments.getState()
    const [one, other] = await Promise.all([create('image'), create('image')])

    expect(one?.title).not.toBe(other?.title)
  })

  it('numbers untitled documents per workspace, under the name of what they are', async () => {
    const { create } = useDocuments.getState()
    const first = await create('3d')
    const second = await create('3d')
    const other = await create('image')

    expect(first?.title).toBe('Scène 1')
    expect(second?.title).toBe('Scène 2')
    // Numbering restarts per workspace, and the WORD changes with it: the two used to share
    // « Sans titre 1 », two files a folder is happy to hold and a glyph alone told apart.
    expect(other?.title).toBe('Image 1')
  })

  it('names a document after the asset it was opened for, rather than numbering it', async () => {
    const created = await useDocuments
      .getState()
      .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset_42' })

    expect(created?.title).toBe('Gemini 3.1')
    expect(created?.sourceAssetId).toBe('asset_42')
  })

  // Two assets may share a name, and the numbering is not the answer: it counts untitled
  // documents. What tells the two tabs apart is the link, which is what comes back to one.
  it('leaves two documents opened for homonymous assets under the same title', async () => {
    const { create } = useDocuments.getState()
    const first = await create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset_1' })
    const second = await create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset_2' })

    expect(second?.title).toBe(first?.title)
    expect(second?.id).not.toBe(first?.id)
  })

  it('gives every document its own id', async () => {
    const { create } = useDocuments.getState()
    expect((await create('3d'))?.id).not.toBe((await create('3d'))?.id)
  })

  it('forgets a closed document', async () => {
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')

    useDocuments.getState().close(created.id)
    expect(useDocuments.getState().documents[created.id]).toBeUndefined()
  })

  it('lists only the documents of the asked workspace', async () => {
    const { create } = useDocuments.getState()
    await create('3d')
    await create('image')

    expect(documentsIn(useDocuments.getState(), '3d')).toHaveLength(1)
  })
})

describe('documentForAsset', () => {
  beforeEach(() => {
    useDocuments.setState({ documents: {}, activeId: null })
    installFakeBridge()
  })

  it('finds the tab already editing an asset', async () => {
    const created = await useDocuments
      .getState()
      .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset_42' })

    expect(documentForAsset(useDocuments.getState(), 'asset_42')?.id).toBe(created?.id)
  })

  // A document of the right kind is not a document of this asset: answering with one would send
  // the asset into a tab that already edits another, which is the whole confusion this replaces.
  it('answers nothing for an asset no tab is editing', async () => {
    await useDocuments.getState().create('image')

    expect(documentForAsset(useDocuments.getState(), 'asset_42')).toBeNull()
  })

  /**
   * The document saved for an asset and then closed lives only in the folder listing. Reading
   * the open tabs alone made the gesture build a second document beside the work it meant to
   * reopen — one asset, two files, and the first reachable only by hunting for it.
   */
  it('finds the document saved for an asset once its tab is closed', () => {
    const saved: DocumentDescriptor = {
      id: 'from-disk',
      kind: 'image',
      title: 'Poster',
      workspace: 'image',
      path: 'documents/Poster.ora',
      sourceAssetId: 'asset_42',
    }
    useDocuments.setState({ documents: {}, stored: [saved] })

    expect(documentForAsset(useDocuments.getState(), 'asset_42')?.id).toBe('from-disk')
  })

  // The open one wins: it is the descriptor a tab has been renaming, and the listing is a snapshot.
  it('prefers the open tab over the listing it also appears in', async () => {
    const open = await useDocuments
      .getState()
      .create('image', { title: 'Gemini 3.1', sourceAssetId: 'asset_42' })
    useDocuments.setState({
      stored: [
        {
          id: 'stale',
          kind: 'image',
          title: 'Old',
          workspace: 'image',
          path: 'documents/Old.ora',
          sourceAssetId: 'asset_42',
        },
      ],
    })

    expect(documentForAsset(useDocuments.getState(), 'asset_42')?.id).toBe(open?.id)
  })
})
describe('documentForFile', () => {
  beforeEach(() => {
    useDocuments.setState({ documents: {}, stored: [], activeId: null })
    installFakeBridge()
  })

  const asset = { id: 'asset_42', path: 'Images/Planche.ora' }

  /**
   * §2.6 — one identity per file. A catalogue rebuilt from the folder mints new asset ids, so a
   * link resting on the id alone went stale and the next double-click stood a SECOND document on
   * the file a tab was already holding (U-1).
   */
  it('finds the tab editing this file when the asset id has moved on', async () => {
    const created = await useDocuments
      .getState()
      .create('image', { title: 'Planche', sourceAssetId: 'asset_old', sourcePath: asset.path })

    expect(documentForFile(useDocuments.getState(), asset)?.id).toBe(created?.id)
  })

  // A `.ora` IS a document, whichever door asks: the listing answers for one no tab holds.
  it('finds the document the file already is, listed and never opened', () => {
    useDocuments.setState({ stored: [{ ...POSTER, path: asset.path }] })

    expect(documentForFile(useDocuments.getState(), asset)?.id).toBe('from-disk')
  })

  it('answers nothing for a file no document sits on', () => {
    useDocuments.setState({ stored: [POSTER] })

    expect(documentForFile(useDocuments.getState(), asset)).toBeNull()
  })

  // The id is still the exact answer, and it is tried first.
  it('prefers the asset link over the path', async () => {
    const linked = await useDocuments
      .getState()
      .create('image', { title: 'Planche', sourceAssetId: 'asset_42' })
    useDocuments.setState({ stored: [{ ...POSTER, path: asset.path }] })

    expect(documentForFile(useDocuments.getState(), asset)?.id).toBe(linked?.id)
  })
})

describe('activeSceneOrWorkshopId', () => {
  const inFront = (document: DocumentDescriptor): void =>
    useDocuments.setState({ documents: { [document.id]: document }, activeId: document.id })

  it('names the scene in front', () => {
    inFront({
      id: 'scene-1',
      kind: 'scene',
      title: 'Level',
      workspace: '3d',
      path: 'documents/Level.gltf',
    })

    expect(activeSceneOrWorkshopId(useDocuments.getState())).toBe('scene-1')
  })

  it('names the workshop of the character in front', () => {
    inFront({
      id: 'character-1',
      kind: 'character',
      title: 'Hero',
      workspace: '3d',
      path: 'Models/hero.glb',
      sourceAssetId: 'asset-hero',
    })

    expect(activeSceneOrWorkshopId(useDocuments.getState())).toBe(workshopIdOf('asset-hero'))
  })

  it('names nothing for an image in front', () => {
    inFront(POSTER)

    expect(activeSceneOrWorkshopId(useDocuments.getState())).toBeNull()
  })
})
// @vitest-environment jsdom
// @vitest-environment jsdom
