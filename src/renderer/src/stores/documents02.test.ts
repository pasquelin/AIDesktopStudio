import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DocumentDescriptor } from '@shared/domain/document'
import { installFakeBridge } from '@/services/fakeBridge'
import { panelIds, useDocumentIsInFront, useDocuments } from './documents'
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

describe('panelIds', () => {
  it('names what the arrangement shows', () => {
    expect(panelIds({ panels: { a: {}, b: {} } })).toEqual(new Set(['a', 'b']))
  })

  // A project whose centre has never reported an arrangement, which is every launch before the
  // first one lands: an empty set is the honest answer, and a throw here would be at mount.
  it('survives having no arrangement at all', () => {
    expect(panelIds(null)).toEqual(new Set())
  })
})

/**
 * `relist` reads the folder and settles nothing else. That separation is the whole point: a
 * panel that wants a listing must not decide which tabs are open, because `create` posts a
 * descriptor without writing a file and a reconciliation would evict it mid-session.
 */
describe('relist', () => {
  beforeEach(() => {
    localStorage.clear()
    useDocuments.setState({ documents: {}, stored: [], activeId: null, recent: {} })
    useLayouts.setState({ layout: null, projectPath: null })
  })

  it('reads what the folder holds, open or not', async () => {
    installFakeBridge({ documents: { list: () => Promise.resolve([POSTER]) } })

    await useDocuments.getState().relist()
    expect(useDocuments.getState().stored).toEqual([POSTER])
  })

  it('leaves the open documents exactly as they were', async () => {
    const unwritten: DocumentDescriptor = {
      id: 'unwritten',
      kind: 'scene',
      title: 'Untitled 1',
      workspace: '3d',
      path: 'documents/Untitled 1.gltf',
    }
    useDocuments.setState({ documents: { unwritten } })
    installFakeBridge({ documents: { list: () => Promise.resolve([POSTER]) } })

    await useDocuments.getState().relist()
    expect(useDocuments.getState().documents).toEqual({ unwritten })
  })

  // A list that reshuffles between two reads is a list nobody can point at.
  it('sorts by title', async () => {
    const zulu: DocumentDescriptor = {
      id: 'z',
      kind: 'scene',
      title: 'Zulu',
      workspace: '3d',
      path: 'documents/Zulu.gltf',
    }
    const alpha: DocumentDescriptor = {
      id: 'a',
      kind: 'scene',
      title: 'Alpha',
      workspace: '3d',
      path: 'documents/Alpha.gltf',
    }
    installFakeBridge({ documents: { list: () => Promise.resolve([zulu, alpha]) } })

    await useDocuments.getState().relist()
    expect(useDocuments.getState().stored.map(document => document.title)).toEqual([
      'Alpha',
      'Zulu',
    ])
  })

  /**
   * The two questions have their own counter. Sharing one looked harmless and was not: the
   * Explorer relists from a mount effect while `followProject` is still awaiting its own read,
   * and the relist made the refresh abandon — leaving every restored tab without its descriptor.
   */
  it('does not make a refresh in flight abandon', async () => {
    // The refresh's own read is the slow one; the relist that overtakes it answers at once.
    let answerRefresh = (documents: DocumentDescriptor[]): void => void documents
    let reads = 0
    installFakeBridge({
      documents: {
        list: () => {
          reads += 1
          if (reads > 1) return Promise.resolve([POSTER])
          return new Promise<DocumentDescriptor[]>(resolve => (answerRefresh = resolve))
        },
      },
    })
    showing(POSTER.id)

    const refreshing = useDocuments.getState().refresh()
    await useDocuments.getState().relist()
    answerRefresh([POSTER])
    await refreshing

    expect(Object.keys(useDocuments.getState().documents)).toEqual([POSTER.id])
  })

  it('answers an empty list when no project is open', async () => {
    installFakeBridge({ documents: { list: () => Promise.reject(new Error('no project')) } })

    await useDocuments.getState().relist()
    expect(useDocuments.getState().stored).toEqual([])
  })
})

describe('adopt', () => {
  beforeEach(() => {
    useDocuments.setState({ documents: {}, stored: [], activeId: null })
  })

  it('takes in a document no tab was showing', () => {
    useDocuments.getState().adopt(POSTER)
    expect(useDocuments.getState().documents[POSTER.id]).toBe(POSTER)
  })

  // The open descriptor is the one the tab has been renaming; the listing it came from is a
  // snapshot, and overwriting would hand back the name the file had when it was last read.
  it('never overwrites the descriptor a tab is already holding', () => {
    const renamed: DocumentDescriptor = { ...POSTER, title: 'Renamed' }
    useDocuments.setState({ documents: { [POSTER.id]: renamed } })

    useDocuments.getState().adopt(POSTER)
    expect(useDocuments.getState().documents[POSTER.id]).toBe(renamed)
  })
})

describe('rename', () => {
  const renamed: DocumentDescriptor = {
    ...POSTER,
    title: 'Affiche',
    path: 'documents/Affiche.ora',
  }

  beforeEach(() => {
    useDocuments.setState({ documents: {}, stored: [], activeId: null })
  })

  /**
   * Both halves at once. `documents` is what a tab reads and `stored` is what the Explorer and
   * the document list read: writing one leaves the other showing the name the document has just
   * stopped having — the two names this whole change exists to collapse into one.
   */
  it('writes the new name where the tab reads it and where the folder is listed', async () => {
    useDocuments.setState({ documents: { [POSTER.id]: POSTER }, stored: [POSTER] })
    installFakeBridge({ documents: { rename: () => Promise.resolve(renamed) } })

    expect(await useDocuments.getState().rename(POSTER.id, 'Affiche')).toBeNull()

    expect(useDocuments.getState().documents[POSTER.id]).toEqual(renamed)
    expect(useDocuments.getState().stored[0]).toEqual(renamed)
  })

  // The id is what the layout, the recent list and the open tab all hold.
  it('leaves the id where it was, so the open tab does not notice', async () => {
    useDocuments.setState({ documents: { [POSTER.id]: POSTER }, stored: [POSTER] })
    installFakeBridge({ documents: { rename: () => Promise.resolve(renamed) } })

    await useDocuments.getState().rename(POSTER.id, 'Affiche')

    expect(Object.keys(useDocuments.getState().documents)).toEqual([POSTER.id])
  })

  // Asked here as well as in the main process: this is what puts a sentence under the field.
  it('refuses a name the folder already holds without asking the disk', async () => {
    const other: DocumentDescriptor = { ...POSTER, id: 'other', path: 'documents/Affiche.ora' }
    useDocuments.setState({ documents: { [POSTER.id]: POSTER }, stored: [POSTER, other] })
    const rename = vi.fn()
    installFakeBridge({ documents: { rename } })

    expect(await useDocuments.getState().rename(POSTER.id, 'Affiche')).toBe('duplicate')
    expect(rename).not.toHaveBeenCalled()
  })

  it('refuses a title the disk would have to rewrite', async () => {
    useDocuments.setState({ documents: { [POSTER.id]: POSTER }, stored: [POSTER] })
    const rename = vi.fn()
    installFakeBridge({ documents: { rename } })

    expect(await useDocuments.getState().rename(POSTER.id, 'Brique 1/2')).toBe('invalid')
    expect(rename).not.toHaveBeenCalled()
  })

  // The window believed the name was free; the folder is what decides, and it may have changed.
  it('reports the refusal the main process came back with', async () => {
    useDocuments.setState({ documents: { [POSTER.id]: POSTER }, stored: [POSTER] })
    installFakeBridge({
      documents: { rename: () => Promise.reject(new Error('duplicate-name')) },
    })

    expect(await useDocuments.getState().rename(POSTER.id, 'Affiche')).toBe('duplicate')
    expect(useDocuments.getState().documents[POSTER.id]).toEqual(POSTER)
  })

  // Closed while the field was open, or never open at all: there is nothing to rename.
  it('says so when no document of that id is anywhere', async () => {
    expect(await useDocuments.getState().rename('gone', 'Affiche')).toBe('invalid')
  })
})

/**
 * `relist` shares a listing already in flight, which is right for three surfaces asking on the
 * same paint — and wrong for a caller that has just written a file: the shared answer may have
 * been asked for before the write, and would come back without it.
 */
describe('sharing a listing', () => {
  beforeEach(() => {
    useDocuments.setState({ stored: [] })
  })

  it('answers a plain caller from the listing already travelling', async () => {
    const list = vi.fn(() => Promise.resolve([POSTER]))
    installFakeBridge({ documents: { list } })

    await Promise.all([useDocuments.getState().relist(), useDocuments.getState().relist()])

    expect(list).toHaveBeenCalledOnce()
    expect(useDocuments.getState().stored).toHaveLength(1)
  })

  it('reads again for a caller that has just written, so its own file is there', async () => {
    const written: DocumentDescriptor[] = []
    const list = vi.fn(() => Promise.resolve([...written]))
    installFakeBridge({ documents: { list } })

    const shared = useDocuments.getState().relist()
    written.push(POSTER)
    await Promise.all([shared, useDocuments.getState().relist('own-write')])

    expect(list).toHaveBeenCalledTimes(2)
    expect(useDocuments.getState().stored).toHaveLength(1)
  })

  /**
   * What the six document components arm their menus and their shortcut scopes on. A hidden tab
   * stays mounted, so an answer of `true` for anything but the tab in front is two documents
   * answering one press of the same key.
   */
  it('tells the tab in front from every other open one', () => {
    useDocuments.setState({ documents: {}, activeId: 'doc-front', recent: {} })

    const front = renderHook(() => useDocumentIsInFront('doc-front'))
    const behind = renderHook(() => useDocumentIsInFront('doc-behind'))

    expect(front.result.current).toBe(true)
    expect(behind.result.current).toBe(false)

    act(() => useDocuments.getState().activate('doc-behind'))

    expect(front.result.current).toBe(false)
    expect(behind.result.current).toBe(true)
  })
})
// @vitest-environment jsdom
// @vitest-environment jsdom
