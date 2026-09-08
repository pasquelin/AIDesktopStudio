import { localizedError } from '@shared/localizedError'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { startAssetDrag } from '@/helpers/assetDrag'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { useAssets } from '@/stores/assets'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { installDocument } from '@/stores/document-fixtures'
import type { FolderExportRequest, SkyboxExportCommand } from '@shared/ipc'
import { skyboxOf, useSkyboxes } from '@/stores/skyboxes'
import { useSkyboxViews, skyboxViewOf } from '@/stores/skyboxViews'
import { SKYBOX_VIEWS, type SkyboxView } from '@shared/domain/skybox'
import { setSunAngles } from '@/engines/skybox/commands'
import { SkyboxDocument } from './SkyboxDocument'

/** Read off the French bundle, like every other label a test looks a control up by. */
const LABELS: Record<SkyboxView, string> = {
  immersive: '360°',
  equirect: 'Équirect',
  cross: 'Croix',
  faces: '6 faces',
}

// jsdom has no WebGL context: what the engine draws is exercised by hand, not here. This
// covers the document handing it the right state — same reason as `SceneDocument.test`.
vi.mock('@/engines/skybox/SkyboxRenderer', () => ({
  SkyboxRenderer: class {
    mount = vi.fn()
    apply = vi.fn()
    dispose = vi.fn()
    setFieldOfView = vi.fn()
    setProbesVisible = vi.fn()
    setView = vi.fn()
    refreshSource = vi.fn()
  },
}))

const panorama: Asset = {
  id: 'asset-dusk',
  name: 'dusk',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
}

function dragging(assetId: string): DataTransfer {
  const dataTransfer = dragTransfer()
  startAssetDrag({ dataTransfer }, { id: assetId, type: 'image' })
  return dataTransfer
}

const sourceOf = (documentId: string): { assetId: string } | null =>
  skyboxOf(useSkyboxes.getState(), documentId).source

/** The element the drop lands on: the engine's host fills it and swallows nothing. */
function viewport(): Element {
  const { container } = render(<SkyboxDocument documentId="doc-1" />)
  const root = container.firstElementChild
  if (!root) throw new Error('the skybox document renders nothing')
  return root
}

describe('SkyboxDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSkyboxViews.setState({ views: {} })
    useAssets.setState({ items: [panorama] })
    installDocument('doc-1', 'skyboxes')
  })

  it('hangs a picture dropped from the shelf', async () => {
    fireEvent.drop(viewport(), { dataTransfer: dragging('asset-dusk') })

    // Settled first: a drop resolves through `droppedAsset`, which may fetch a library asset
    // before handing it over, so the answer lands a microtask later even when nothing was fetched.
    await Promise.resolve()

    expect(sourceOf('doc-1')).toEqual({ assetId: 'asset-dusk' })
  })

  // The drag carries an id, never the asset: one the catalogue no longer holds has no file
  // behind it, and the engine would load a 404 into a sky it cannot tell from a black one.
  it('ignores an id the catalogue does not hold', async () => {
    fireEvent.drop(viewport(), { dataTransfer: dragging('asset-gone') })

    // Settled first: a drop resolves through `droppedAsset`, which may fetch a library asset
    // before handing it over, so the answer lands a microtask later even when nothing was fetched.
    await Promise.resolve()

    expect(sourceOf('doc-1')).toBeNull()
  })

  it('leaves a file dragged in from the desktop alone', () => {
    const dataTransfer = dragTransfer()
    dataTransfer.setData('text/plain', 'asset-dusk')

    fireEvent.drop(viewport(), { dataTransfer })

    expect(sourceOf('doc-1')).toBeNull()
  })

  /**
   * A canvas React owns is reused across StrictMode's mount / unmount / mount, and the first
   * engine's `dispose` purges the one WebGL context the second draws into. Same rule as the
   * scene editor: the engine makes its own canvas inside a plain host.
   */
  it('hands the renderer a host to fill, never a canvas of its own', () => {
    const { container } = render(<SkyboxDocument documentId="doc-1" />)
    expect(container.querySelector('canvas')).toBeNull()
  })
})

/**
 * The menu row that hands a sky to an engine. What the six faces look like needs a GPU and is
 * not here; what is, is who answers the row — the event reaches the window, not a document.
 */
describe('the export menu row', () => {
  const listen = (): {
    listeners: () => number
    unsubscribed: () => number
    fire: (size: number) => void
    exported: () => FolderExportRequest[]
  } => {
    const callbacks: ((command: SkyboxExportCommand) => void)[] = []
    const exported: FolderExportRequest[] = []
    let released = 0

    installFakeBridge({
      menu: {
        onSkyboxExport: callback => {
          callbacks.push(callback)
          return () => {
            released += 1
          }
        },
      },
      skybox: {
        export: request => {
          exported.push(request)
          return Promise.resolve(request.folder)
        },
      },
    })

    return {
      listeners: () => callbacks.length,
      unsubscribed: () => released,
      fire: size => {
        for (const callback of callbacks) callback({ kind: 'faces', size })
      },
      exported: () => exported,
    }
  }

  it('is listened to while the tab is in front, and not while it is behind', () => {
    const menu = listen()

    useDocuments.setState({ activeId: 'doc-1' })
    render(<SkyboxDocument documentId="doc-1" />)
    expect(menu.listeners()).toBe(1)

    useDocuments.setState({ activeId: 'doc-2' })
    render(<SkyboxDocument documentId="doc-1" />)
    // Still one: a second sky answering the same row would open a second folder dialog.
    expect(menu.listeners()).toBe(1)
  })

  it('lets go of the row when the tab closes', () => {
    const menu = listen()
    useDocuments.setState({ activeId: 'doc-1' })

    render(<SkyboxDocument documentId="doc-1" />).unmount()

    expect(menu.unsubscribed()).toBe(1)
  })

  it('refuses a sky with no picture, and says which refusal it was', async () => {
    const callbacks: ((command: SkyboxExportCommand) => void)[] = []
    const exported: FolderExportRequest[] = []
    const { entries } = bridgeWatchingLogs({
      menu: {
        onSkyboxExport: callback => {
          callbacks.push(callback)
          return () => {}
        },
      },
      skybox: {
        export: request => {
          exported.push(request)
          return Promise.resolve(request.folder)
        },
      },
    })

    useDocuments.setState({ activeId: 'doc-1' })
    render(<SkyboxDocument documentId="doc-1" />)
    for (const callback of callbacks) callback({ kind: 'faces', size: 1024 })

    // The message, not merely the silence: jsdom has no WebGL, so an export that got past the
    // guard would fail too — and a test that only checked for no dialog would pass either way.
    await vi.waitFor(() =>
      expect(entries()).toEqual([
        {
          level: 'error',
          scope: 'skybox.export',
          message: `1024: ${localizedError('skyboxSourceMissing').message}`,
        },
      ]),
    )

    // A folder chooser asking where to write six files of nothing is a dialog nobody can answer.
    expect(exported).toEqual([])
  })
})

describe('the keyboard of a sky', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSkyboxViews.setState({ views: {} })
    useAssets.setState({ items: [panorama] })
    installDocument('doc-1', 'skyboxes')
  })

  /**
   * The history was there and worked — moving the sun is a command — but nothing listened, so
   * ⌘Z fell through to the platform and undid nothing at all.
   */
  it('undoes the sun the keyboard just moved', () => {
    render(<SkyboxDocument documentId="doc-1" />)
    const before = skyboxOf(useSkyboxes.getState(), 'doc-1').sun

    useSkyboxes.getState().runCommand('doc-1', setSunAngles({ azimuth: 1.2, elevation: 0.4 }))
    expect(skyboxOf(useSkyboxes.getState(), 'doc-1').sun).not.toEqual(before)

    fireEvent.keyDown(window, { code: 'KeyZ', metaKey: true })

    expect(skyboxOf(useSkyboxes.getState(), 'doc-1').sun).toEqual(before)
  })

  it('puts back what it just undid', () => {
    render(<SkyboxDocument documentId="doc-1" />)
    const moved = { azimuth: 1.2, elevation: 0.4 }

    useSkyboxes.getState().runCommand('doc-1', setSunAngles(moved))
    fireEvent.keyDown(window, { code: 'KeyZ', metaKey: true })
    fireEvent.keyDown(window, { code: 'KeyZ', metaKey: true, shiftKey: true })

    expect(skyboxOf(useSkyboxes.getState(), 'doc-1').sun).toMatchObject(moved)
  })

  /**
   * Four views and one key: a letter each would spend four of them on a space that has two
   * other things to offer.
   *
   * Read off the store rather than off a button: the controls moved to the View panel, and the
   * centre carries the toolbar and the rulers only. What the document still owns is the key.
   */
  it('cycles through the views and comes back round', () => {
    render(<SkyboxDocument documentId="doc-1" />)
    const shown = (): SkyboxView => skyboxViewOf(useSkyboxViews.getState(), 'doc-1').view

    expect(shown()).toBe('immersive')
    fireEvent.keyDown(window, { code: 'KeyV' })
    expect(shown()).toBe(SKYBOX_VIEWS[1])

    for (let step = 1; step < SKYBOX_VIEWS.length; step += 1) {
      fireEvent.keyDown(window, { code: 'KeyV' })
    }
    expect(shown()).toBe('immersive')
  })

  it('toggles the test objects from the keyboard, and hands it to the engine', () => {
    render(<SkyboxDocument documentId="doc-1" />)

    fireEvent.keyDown(window, { code: 'KeyP' })

    expect(skyboxViewOf(useSkyboxViews.getState(), 'doc-1').probes).toBe(false)
  })

  /**
   * The floating MENU that covered the picture is still gone. The View panel offers these same
   * two controls and goes on doing so; the bar is what one reaches WHILE looking, with no panel
   * to open first. Everything a slider drives stays there.
   */
  it('lays no slider over the viewport, which the panel drives', () => {
    const { queryByRole } = render(<SkyboxDocument documentId="doc-1" />)

    expect(queryByRole('slider')).toBeNull()
  })

  it('changes the projection from the bar, with no panel to open first', async () => {
    render(<SkyboxDocument documentId="doc-1" />)

    await userEvent.hover(screen.getByRole('button', { name: LABELS.immersive }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: LABELS.cross }))

    expect(skyboxViewOf(useSkyboxViews.getState(), 'doc-1').view).toBe('cross')
  })

  it('toggles the test objects from the bar, the panel keeping its own switch', async () => {
    render(<SkyboxDocument documentId="doc-1" />)

    // The name carries the key the button answers to, read off the registry: `Objets de test (P)`.
    await userEvent.click(screen.getByRole('button', { name: /^Objets de test/ }))

    expect(skyboxViewOf(useSkyboxViews.getState(), 'doc-1').probes).toBe(false)
  })
})
