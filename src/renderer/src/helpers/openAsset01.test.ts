import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PICTURES, type Asset } from '@shared/domain/asset'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { Project } from '@shared/domain/project'
import { installFakeBridge } from '@/services/fakeBridge'
import { installDocument } from '@/stores/document-fixtures'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { sceneOf, useScenes } from '@/stores/scenes'
import { skyboxOf, useSkyboxes } from '@/stores/skyboxes'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { lendPictureMeasure } from '@/features/image/pictureSize'
import { forgetReportedFailures } from '@/services/diagnostics'
import { editPixelsOf, openAsset } from './openAsset'

/** The converter parses with three.js and reads the file; what it ANSWERS is what this measures. */
const convertArrived = vi.hoisted(() => vi.fn())
vi.mock('@/services/meshConversion', () => ({ convertArrivedModels: convertArrived }))

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

/** A model of a project that predates the conversion rule: its tab has to convert it first. */
const FBX: Asset = {
  id: 'mesh-6',
  name: 'knight.fbx',
  type: 'mesh',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  path: 'Modelling/Models/knight.fbx',
}

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

  it('opens a take in the audio editor, in a tab of its own', async () => {
    await openAsset(asset())

    // A block on the montage, selected — which is what the editor below the montage shows.
    const montage = sequenceOf(useSequences.getState(), opened().id)
    expect(montage.tracks.flatMap(track => track.clips).map(clip => clip.assetId)).toEqual([
      'asset-1',
    ])
    expect(montage.selectedId).not.toBeNull()
    expect(useLayouts.getState().activeWorkspace).toBe('audio')
  })

  it('opens a picture as a layer of an image document', async () => {
    await openAsset(picture())

    expect(canvasOf(useCanvases.getState(), opened().id).layers.at(-1)?.name).toBe('dusk.png')
    expect(useLayouts.getState().activeWorkspace).toBe('image')
  })

  it('does not open an OpenEXR as an image tab', async () => {
    const before = openedCount()

    await expect(openAsset(picture({ name: 'height', path: 'World/height.exr' }))).resolves.toBe(
      false,
    )
    expect(openedCount()).toBe(before)
  })

  /**
   * The pixels of a texture, which its own space assembles without ever writing an image back.
   * The two documents coexist on one asset: the channel and the picture are not the same edit.
   */
  it('opens the pixels of a texture in Images, beside the tab its own space opened', async () => {
    const texture = picture({ id: 'asset-tex', map: 'baseColor', name: 'body.png' })
    await openAsset(texture)
    const channel = opened().id

    editPixelsOf(texture)?.run()
    // The run is fire-and-forget, as a press is: the LAYER is what says the picture has landed.
    await vi.waitFor(() =>
      expect(canvasOf(useCanvases.getState(), opened().id).layers.at(-1)?.name).toBe('body.png'),
    )

    expect(opened().id).not.toBe(channel)
    expect(useLayouts.getState().activeWorkspace).toBe('image')
  })

  /**
   * Every picture on this disk, whatever kind the catalogue filed it as: the assembling spaces
   * take all three, and refusing an `image` left them with no way to Images at all.
   */
  it('offers the painting of every local picture, and of nothing else', () => {
    for (const type of PICTURES) {
      expect(editPixelsOf(picture({ type }))?.workspace).toBe('image')
    }

    expect(editPixelsOf(picture({ location: 'cloud' }))).toBeNull()
    expect(editPixelsOf(asset({ type: 'mesh' }))).toBeNull()
    expect(editPixelsOf(null)).toBeNull()
  })

  // A `.gltf` is a document and lands in a scene; an importable mesh opens on its FILE, in a
  // model tab of its own.
  it('opens a `.gltf` in a scene, and a `.glb` on a character tab instead', async () => {
    await openAsset(asset({ id: 'mesh-1', type: 'mesh', name: 'chair.gltf' }))
    const nodes = sceneOf(useScenes.getState(), opened().id).nodes
    expect(nodes.filter(node => node.type === 'model')).toHaveLength(1)
    expect(useLayouts.getState().activeWorkspace).toBe('3d')

    await openAsset(asset({ id: 'mesh-2', type: 'mesh', name: 'knight.glb' }))

    expect(opened().kind).toBe('character')
    expect(opened().sourceAssetId).toBe('mesh-2')
  })

  // Two tabs on one model are two skeletons of it, and the second ⌘S writes over the first.
  it('comes back to the character already open rather than opening a second', async () => {
    const model = asset({ id: 'mesh-5', type: 'mesh', name: 'knight.glb' })
    await openAsset(model)
    const before = openedCount()

    await openAsset(model)

    expect(openedCount()).toBe(before)
  })

  // MEASURED on a real project: a catalogued row is named `tripo-character`, and only the path
  // behind it carries `.glb`. Reading the name alone left the double-click doing nothing at all.
  it('opens the tab for a row whose extension lives on its path alone', async () => {
    await openAsset(
      asset({
        id: 'mesh-4',
        type: 'mesh',
        name: 'tripo-character',
        path: 'Modelling/Models/tripo-character.glb',
      }),
    )

    expect(opened().kind).toBe('character')
    expect(opened().sourceAssetId).toBe('mesh-4')
  })

  // 🛑 ⌘S patches a `.glb` container: a tab opened on an `.fbx` of a project that predates the
  // conversion rule could never be saved, and said nothing.
  it('turns a model that is not a `.glb` into one before opening its tab', async () => {
    useAssets.setState({ items: [FBX] })
    convertArrived.mockResolvedValueOnce([
      asset({ id: 'mesh-7', type: 'mesh', name: 'knight.glb' }),
    ])

    await openAsset(FBX)

    expect(convertArrived).toHaveBeenCalledWith([FBX])
    expect(opened().sourceAssetId).toBe('mesh-7')
  })

  it('opens no tab for a model whose conversion to `.glb` failed', async () => {
    useAssets.setState({ items: [FBX] })
    convertArrived.mockResolvedValueOnce([FBX])

    await openAsset(FBX)

    expect(Object.values(useDocuments.getState().documents).map(one => one.kind)).not.toContain(
      'character',
    )
  })

  // The file behind it is what the tab reads, and a row the cloud holds has none.
  it('opens no character tab for one this disk does not hold', async () => {
    await openAsset(asset({ id: 'mesh-3', type: 'mesh', name: 'knight.glb', location: 'cloud' }))

    expect(Object.values(useDocuments.getState().documents).map(one => one.kind)).not.toContain(
      'character',
    )
  })

  it('opens a sky in the skybox space, not in the image one it also decodes for', async () => {
    await openAsset(picture({ type: 'skybox' }))

    expect(skyboxOf(useSkyboxes.getState(), opened().id).source).toEqual({ assetId: 'asset-sky' })
    expect(useLayouts.getState().activeWorkspace).toBe('skyboxes')
  })

  it('opens a video in a montage of its own', async () => {
    await openAsset(asset({ id: 'clip-1', type: 'video', name: 'rush.mp4' }))

    const tracks = sequenceOf(useSequences.getState(), opened().id).tracks
    expect(tracks.flatMap(track => track.clips)).toHaveLength(1)
  })

  it('names the tab after the asset, and links it back', async () => {
    await openAsset(picture({ name: 'Gemini 3.1' }))

    expect(opened()).toMatchObject({ title: 'Gemini 3.1', sourceAssetId: 'asset-sky' })
  })

  /**
   * The rule with no exception. A skybox tab in front takes a picture perfectly well — that is
   * what the context menu offers — but the double-click is about the asset, not about the tab.
   */
  it('ignores the tab in front, whatever it would have taken', async () => {
    installDocument('doc-sky', 'skyboxes')

    await openAsset(picture())

    expect(skyboxOf(useSkyboxes.getState(), 'doc-sky').source).toBeNull()
    expect(useLayouts.getState().activeWorkspace).toBe('image')
    expect(openedCount()).toBe(2)
  })

  /**
   * Two tabs onto one asset are two histories of it, and the second save writes over the first.
   */
  it('comes back to the tab already editing the asset', async () => {
    await openAsset(picture())
    const first = opened()

    await openAsset(picture())

    expect(openedCount()).toBe(1)
    expect(opened().id).toBe(first.id)
  })

  /**
   * The tab is NOT resized to the asset — it keeps its size and the work done in it — but one
   * that no longer measures its picture writes a smaller file over it on the next ⌘S, and
   * `replaceBytes` deletes what it replaces. A document opened before the sizing existed is
   * exactly that, and it destroyed a 4112 × 2658 photo in silence.
   */
})
