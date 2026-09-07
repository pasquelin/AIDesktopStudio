import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Asset } from '@shared/domain/asset'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { Project } from '@shared/domain/project'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { lendPictureMeasure } from '@/features/image/pictureSize'
import { forgetReportedFailures } from '@/services/diagnostics'
import { openAsset } from './openAsset'

/** Written out rather than taken from the home's fixture, which pulls in a DOM this never uses. */
const PROJECT: Project = {
  path: '/projects/demo',
  manifest: {
    version: 1,
    createdAt: '2026-08-07T10:00:00.000Z',
    updatedAt: '2026-08-07T10:00:00.000Z',
  },
}

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  name: 'pad.wav',
  type: 'audio',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  ...overrides,
})

const picture = (overrides: Partial<Asset> = {}): Asset =>
  asset({ id: 'asset-sky', name: 'dusk.png', type: 'image', ...overrides })

let giveBackMeasure: () => void

/** The tab the gesture made. Every case here opens exactly one, which is the promise itself. */
function opened(): DocumentDescriptor {
  const documents = Object.values(useDocuments.getState().documents)
  const made = documents.at(-1)
  if (!made) throw new Error('expected a document to have been opened')
  return made
}

const openedCount = (): number => Object.keys(useDocuments.getState().documents).length

/**
 * Opening an asset means editing it: a tab of its own, in the space that edits its kind.
 *
 * The rule has no exception, and that is the point of it. The gesture used to read the tab in
 * front — a picture became a layer over an image tab and a sky over a skybox one — so one
 * double-click meant two things, and neither of them was "open this asset". Placing into the
 * document already open is what the context menu and the drag are for.
 */
describe('opening an asset', () => {
  beforeEach(() => {
    useDocuments.setState({ documents: {}, stored: [], activeId: null })
    // Not the target of any case below: a test watching the workspace change must not start on it.
    useLayouts.setState({ layout: null, activeWorkspace: 'video', home: false })
    useProject.setState({ project: PROJECT, known: true })
    installFakeBridge()
    // jsdom decodes nothing, so an unlent `Image` never settles and every picture would open at
    // the default size — which the studio now says out loud, because a document that is not its
    // picture is one whose ⌘S will not be faithful. Lending one is what makes these cases model
    // a machine that CAN read the file.
    giveBackMeasure = lendPictureMeasure(() => Promise.resolve({ width: 800, height: 600 }))
    forgetReportedFailures()
  })

  afterEach(() => giveBackMeasure())

  it('says so when the tab it comes back to no longer measures its asset', async () => {
    await openAsset(picture())
    const { entries } = bridgeWatchingLogs()
    useCanvases.getState().replace(opened().id, {
      ...canvasOf(useCanvases.getState(), opened().id),
      width: 1024,
      height: 1024,
    })

    await openAsset(picture())

    expect(entries()).toEqual([
      expect.objectContaining({ message: expect.stringContaining('no longer measures') }),
    ])
  })

  it('says nothing when the tab it comes back to is still its asset', async () => {
    await openAsset(picture())
    const { entries } = bridgeWatchingLogs()

    await openAsset(picture())

    expect(entries()).toHaveLength(0)
  })

  /**
   * The half that matters most, and the one open tabs alone cannot answer: a document saved for
   * an asset and then closed lives only in the folder listing. Read from `documents` only, the
   * gesture built a second document beside the very work it was meant to reopen.
   */
  it('reopens the document saved for an asset even once its tab is closed', async () => {
    const saved: DocumentDescriptor = {
      id: 'doc-saved',
      kind: 'image',
      workspace: 'image',
      title: 'dusk.png',
      path: 'documents/dusk.png.ora',
      sourceAssetId: 'asset-sky',
    }
    useDocuments.setState({ documents: {}, stored: [saved], activeId: null })

    await openAsset(picture())

    expect(useDocuments.getState().documents['doc-saved']).toBeDefined()
    expect(openedCount()).toBe(1)
  })

  /**
   * The home covers a centre whose Dockview is unmounted, while the module may still hold the
   * api of the instance it replaced. Adding a panel there paints nothing at all, so leaving the
   * home is what the gesture has to do first — for every asset, and not only for one whose
   * section differs from the one already settled on.
   */
  it('leaves the home, even for an asset of the workspace already settled on', async () => {
    useLayouts.setState({ layout: null, activeWorkspace: 'image', home: true })

    await openAsset(picture())

    expect(useLayouts.getState().home).toBe(false)
  })

  it('leaves the home when it comes back to a tab too', async () => {
    await openAsset(picture())
    useLayouts.setState({ home: true })

    await openAsset(picture())

    expect(useLayouts.getState().home).toBe(false)
  })

  // Same kind, another asset: the tab is not reused, because it is that asset's tab.
  it('opens a second tab for a second asset of the same kind', async () => {
    await openAsset(picture())
    await openAsset(picture({ id: 'asset-2', name: 'dawn.png' }))

    expect(openedCount()).toBe(2)
  })

  /**
   * A document is a file in a project folder, so without one there is nowhere to write it.
   * `create` alone would post a descriptor for a tab that can never be saved.
   */
  it('opens nothing at all with no project, and says why', async () => {
    const { entries } = bridgeWatchingLogs()
    useProject.setState({ project: null, known: true })

    await openAsset(picture())

    expect(openedCount()).toBe(0)
    expect(entries()).toHaveLength(1)
    expect(entries()[0]).toMatchObject({ scope: 'assets.open' })
  })

  /**
   * A cloud asset has no file the engine could load: `assetUrl` resolves an id against the
   * catalogue, and one that is not on disk answers 404 into a black canvas. The refusal has to
   * come BEFORE the tab is made — an empty editor standing where a refusal belonged says less
   * than nothing.
   */
})
