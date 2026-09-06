import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Asset } from '@shared/domain/asset'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { Project } from '@shared/domain/project'
import { chainOf, pushEdit } from '@/engines/audio/edits'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { audioEditsOf, useAudioEdits } from '@/stores/audioEdits'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { sceneOf, useScenes } from '@/stores/scenes'
import { skyboxOf, useSkyboxes } from '@/stores/skyboxes'
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

  it('refuses a picture that is not on disk rather than opening an empty tab', async () => {
    const { entries } = bridgeWatchingLogs()

    await openAsset(picture({ location: 'cloud' }))

    expect(openedCount()).toBe(0)
    expect(entries()).toHaveLength(1)
    expect(entries()[0]?.message).toContain('dusk.png')
  })

  /**
   * The picture kinds are refused by their destination's own guard; a take, a mesh and a rush
   * have none, and each would have opened an editor onto a reference resolving to a 404. Every
   * editor loads its subject from the file behind it, so the gesture asks once, for all of them.
   */
  it('refuses every kind the cloud still holds, not only the pictures', async () => {
    const { entries } = bridgeWatchingLogs()

    await openAsset(asset({ location: 'cloud' }))
    await openAsset(asset({ id: 'mesh-1', type: 'mesh', name: 'chair.glb', location: 'cloud' }))
    await openAsset(asset({ id: 'clip-1', type: 'video', name: 'rush.mp4', location: 'cloud' }))

    expect(openedCount()).toBe(0)
    expect(entries()).toHaveLength(3)
  })

  it('keeps quiet when the asset did land somewhere', async () => {
    const { entries } = bridgeWatchingLogs()

    await openAsset(picture())

    expect(entries()).toHaveLength(0)
  })

  /**
   * A tab that has never been on screen holds no state. Writing into it straight away makes
   * `restoreDocument` take it for one already loaded: its file is never read, the editor opens
   * holding nothing but the asset just placed, and the next save writes that over the file.
   */
  it('lets the tab load before writing into it', async () => {
    installFakeBridge({ documents: { read: () => Promise.resolve(null) } })

    await openAsset(asset({ id: 'mesh-1', type: 'mesh', name: 'chair.gltf' }))

    // A new scene is born lit, and a document read from disk brings its own nodes. Writing
    // before either happened left the tab holding nothing but the asset.
    const nodes = sceneOf(useScenes.getState(), opened().id).nodes
    expect(nodes.filter(node => node.type !== 'model').length).toBeGreaterThan(0)
  })

  /**
   * A chain is a length and a region measured against the block it was made on, and it stays
   * with that block. Where a second take used to wipe the first one's work, it now lands beside
   * it — the montage holds both, and each keeps what was asked of it.
   */
  it('leaves the first take its chain when a second is loaded into the same tab', async () => {
    await openAsset(asset())
    const tab = opened().id
    const laid = sequenceOf(useSequences.getState(), tab).selectedId ?? ''
    useAudioEdits.getState().runCommand(tab, pushEdit(laid, { kind: 'gain', db: -3 }))

    // The tab is the asset's, so the second take reaches it the way a drop does. The head has
    // not moved, so it lands over the first block — what any drop at the head does.
    const { loadTake } = await import('@/features/audio/components/TakeEditor/loadTake')
    loadTake(tab, asset({ id: 'asset-2' }))

    const edits = audioEditsOf(useAudioEdits.getState(), tab)
    expect(chainOf(edits, laid).edits).toEqual([{ kind: 'gain', db: -3 }])
    expect(chainOf(edits, sequenceOf(useSequences.getState(), tab).selectedId).edits).toEqual([])
  })

  // The panel shows this field under "what produced this sky". Left in place, it would credit
  // the prompt of a generated sky with the photograph that has just replaced it.
  it('clears the provenance of the sky it replaces', async () => {
    await openAsset(picture({ type: 'skybox' }))
    const tab = opened().id
    useSkyboxes.getState().replace(tab, {
      ...skyboxOf(useSkyboxes.getState(), tab),
      generation: { modelId: 'model_sky', modelLabel: 'Skybox Flux.1', prompt: 'a dusk' },
    })

    const { setSkyboxSource } = await import('@/stores/skyboxes')
    setSkyboxSource(tab, picture({ id: 'asset-2' }))

    expect(skyboxOf(useSkyboxes.getState(), tab).generation).toBeUndefined()
  })
})
