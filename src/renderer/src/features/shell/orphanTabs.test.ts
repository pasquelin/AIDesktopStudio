import type { DocumentDescriptor } from '@shared/domain/document'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDocuments } from '@/stores/documents'
import { showPanels } from '@/stores/layout-fixtures'
import { useLayouts } from '@/stores/layouts'
import { closeOrphanTabs } from './orphanTabs'

const closePanel = vi.hoisted(() => vi.fn())
vi.mock('./components/dockviewApi', async importActual => ({
  ...(await importActual<Record<string, unknown>>()),
  closePanel,
}))

const SAVED: DocumentDescriptor = {
  id: 'saved',
  kind: 'image',
  workspace: 'image',
  title: 'On disk',
  path: 'documents/On disk.ora',
}
const FRESH: DocumentDescriptor = {
  id: 'fresh',
  kind: 'image',
  workspace: 'image',
  title: 'Untitled 1',
  path: 'documents/Untitled 1.ora',
}

function panelsLeft(): string[] {
  return Object.keys(useLayouts.getState().layout?.panels ?? {})
}

describe('closeOrphanTabs', () => {
  beforeEach(() => {
    closePanel.mockClear()
    useLayouts.setState({ layout: null })
    useDocuments.setState({ documents: {}, stored: [], activeId: null })
  })

  // The reported defect: two documents created and never saved, then a reload. The folder holds
  // neither, the layout holds both, and each tab comes back saying it is not open.
  //
  // The stored layout and not the mounted Dockview, and that is the half a `close` cannot reach:
  // the home COVERS the centre, so a launch that starts on it has every tab in this record and
  // nowhere else.
  it('closes a restored tab whose document is in no folder and no store', () => {
    showPanels('ghost')

    closeOrphanTabs()

    expect(closePanel).toHaveBeenCalledWith('ghost')
    expect(useLayouts.getState().layout).toBeNull()
  })

  // A file view is in no folder listing to be missing from, so every sweep read it as a ghost —
  // and `closePanel` takes a tab without the question `closeFileView` asks about its edits.
  it('leaves a file view alone, which no listing was ever going to hold', () => {
    showPanels('file:Entrées/Clavier.input.json')

    closeOrphanTabs()

    expect(closePanel).not.toHaveBeenCalled()
  })

  it('leaves the tab of a document the folder holds', () => {
    showPanels(SAVED.id)
    useDocuments.setState({ documents: { [SAVED.id]: SAVED }, stored: [SAVED] })

    closeOrphanTabs()

    expect(closePanel).not.toHaveBeenCalled()
    expect(panelsLeft()).toEqual([SAVED.id])
  })

  // A document created during the session is absent from the folder too — `create` writes
  // nothing on purpose — and sweeping on that alone would close a tab under the hands.
  it('leaves the tab of a document created during the session', () => {
    showPanels(FRESH.id)
    useDocuments.setState({ documents: { [FRESH.id]: FRESH }, stored: [] })

    closeOrphanTabs()

    expect(closePanel).not.toHaveBeenCalled()
    expect(panelsLeft()).toEqual([FRESH.id])
  })

  // An Explorer row opened while the listing travelled is adopted into the store and nowhere
  // else: the store is read when the answer is settled, not passed in from before it.
  it('leaves the tab of a document adopted from a listing', () => {
    showPanels(SAVED.id)
    useDocuments.setState({ documents: {}, stored: [SAVED] })

    closeOrphanTabs()

    expect(closePanel).not.toHaveBeenCalled()
  })

  it('keeps the tabs of the same layout that have a document', () => {
    showPanels(SAVED.id, 'ghost')
    useDocuments.setState({ documents: { [SAVED.id]: SAVED }, stored: [SAVED] })

    closeOrphanTabs()

    expect(panelsLeft()).toEqual([SAVED.id])
  })

  it('touches nothing when every tab has its document', () => {
    showPanels(SAVED.id)
    useDocuments.setState({ documents: { [SAVED.id]: SAVED }, stored: [SAVED] })
    const before = useLayouts.getState().layout

    closeOrphanTabs()

    expect(useLayouts.getState().layout).toBe(before)
  })
})
