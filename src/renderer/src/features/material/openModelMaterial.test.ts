import { beforeEach, describe, expect, it } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { Project } from '@shared/domain/project'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { forgetReportedFailures } from '@/services/diagnostics'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { materialOf, useMaterials } from '@/stores/materials'
import type { ChannelTexture } from '@shared/domain/channelTexture'
import { openModelMaterial } from './openModelMaterial'

const PROJECT: Project = {
  path: '/projects/demo',
  manifest: {
    version: 1,
    createdAt: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-08-14T10:00:00.000Z',
  },
}

const MODEL = { id: 'asset-model', name: 'Robot' }

const texture = (overrides: Partial<ChannelTexture> = {}): ChannelTexture => ({
  id: 'asset-base',
  name: 'Robot — Couleur de base',
  type: 'image',
  location: 'local',
  derivedFrom: MODEL.id,
  map: 'baseColor',
  tags: [],
  createdAt: '2026-08-14T10:00:00.000Z',
  ...overrides,
})

/** The tab the gesture made. Every case here opens exactly one, which is half the promise. */
function opened(): DocumentDescriptor {
  const made = Object.values(useDocuments.getState().documents).at(-1)
  if (!made) throw new Error('expected a document to have been opened')
  return made
}

const openedCount = (): number => Object.keys(useDocuments.getState().documents).length

/**
 * A model's maps are ONE material, and opening it is what assembles them.
 *
 * Nothing is written at import, deliberately: extraction runs on every `.glb` that lands in the
 * project, so a document per imported model would be a folder full of files nobody opened.
 */
describe('opening the material of a model', () => {
  beforeEach(() => {
    useDocuments.setState({ documents: {}, stored: [], activeId: null })
    useLayouts.setState({ layout: null, activeWorkspace: 'video', home: false })
    useProject.setState({ project: PROJECT, known: true })
    installFakeBridge()
    forgetReportedFailures()
  })

  it('puts every named map into the channel it plays, in one document', async () => {
    await openModelMaterial(MODEL, [
      texture(),
      texture({ id: 'asset-normal', map: 'normal' }),
      texture({ id: 'asset-ao', map: 'ao' }),
    ])

    const channels = materialOf(useMaterials.getState(), opened().id).channels
    expect(channels.baseColor).toMatchObject({ assetId: 'asset-base', origin: 'imported' })
    expect(channels.normal).toMatchObject({ assetId: 'asset-normal' })
    expect(channels.ao).toMatchObject({ assetId: 'asset-ao' })
    expect(useLayouts.getState().activeWorkspace).toBe('materials')
  })

  it('names the tab after the model, and links it back', async () => {
    await openModelMaterial(MODEL, [texture()])

    expect(opened()).toMatchObject({
      title: 'Robot',
      sourceAssetId: 'asset-model',
      kind: 'material',
    })
  })

  /**
   * Two tabs onto one material are two histories of it, and reassembling would undo whatever was
   * picked in between — the whole reason the assembly happens once, on the way in.
   */
  it('comes back to the tab already assembled rather than making a second one', async () => {
    await openModelMaterial(MODEL, [texture()])
    const first = opened().id

    await openModelMaterial(MODEL, [texture({ id: 'asset-other' })])

    expect(openedCount()).toBe(1)
    expect(materialOf(useMaterials.getState(), first).channels.baseColor).toMatchObject({
      assetId: 'asset-base',
    })
  })

  /**
   * The id is what makes the gesture WORTH something: the caller puts it on the slot the press
   * came from, so the model wears the material that was just opened. Answering nothing is what
   * left every edit saved from that tab reaching no model at all.
   */
  it('answers the id of the document it opened', async () => {
    expect(await openModelMaterial(MODEL, [texture()])).toBe(opened().id)
  })

  it('answers the id of the tab it came back to', async () => {
    const first = await openModelMaterial(MODEL, [texture()])

    expect(await openModelMaterial(MODEL, [texture()])).toBe(first)
  })

  it('finishes an existing document after its first assembly was interrupted', async () => {
    const packed = texture({
      id: 'asset-packed',
      map: undefined,
      packedSlot: 'metallicRoughnessTexture',
    })
    const interrupted = async (): Promise<never> => {
      throw new Error('disk full')
    }

    await expect(openModelMaterial(MODEL, [packed], interrupted)).resolves.toBeNull()
    expect(openedCount()).toBe(0)
    installFakeBridge({
      assets: {
        saveTexture: request =>
          Promise.resolve(texture({ id: `asset-${request.map}`, map: request.map })),
      },
    })
    await openModelMaterial(MODEL, [packed], async request => ({
      channel: request.channel,
      png: new Uint8Array([1]),
      width: 1,
      height: 1,
    }))

    expect(openedCount()).toBe(1)
    expect(materialOf(useMaterials.getState(), opened().id).channels).toMatchObject({
      roughness: { assetId: 'asset-roughness' },
      metalness: { assetId: 'asset-metalness' },
    })
  })

  it('answers nothing when there was nothing to assemble', async () => {
    expect(await openModelMaterial(MODEL, [texture({ location: 'cloud' })])).toBeNull()
  })

  /**
   * A `metallicRoughnessTexture` packs two of the studio's channels into one image. The panel
   * used to show it as a problem of its own, with a button to unpack it: the application makes
   * the files, so it splits the picture here and fills both channels.
   */
  it('splits a picture that packs two channels, and fills both', async () => {
    installFakeBridge({
      assets: {
        saveTexture: request =>
          Promise.resolve(texture({ id: `asset-${request.map}`, map: request.map })),
      },
    })

    await openModelMaterial(
      MODEL,
      [
        texture(),
        // No `map`: `channelWornBy` claims nothing when the slots wearing a picture disagree.
        {
          ...texture({ id: 'asset-packed', packedSlot: 'metallicRoughnessTexture' }),
          map: undefined,
        },
      ],
      () => Promise.resolve({ width: 2, height: 2, png: new Uint8Array([1]) }),
    )

    const channels = materialOf(useMaterials.getState(), opened().id).channels
    expect(channels.roughness).toBeDefined()
    expect(channels.metalness).toBeDefined()
  })

  it('keeps the material factors extracted from glTF', async () => {
    const settings = {
      color: '#808080',
      roughness: 0.25,
      metalness: 0.75,
      normalScale: 0.5,
      aoIntensity: 0.6,
      emissive: '#201000',
      emissiveIntensity: 2,
      tiling: { x: 2, y: 3 },
      offset: { x: 0.25, y: 0.5 },
      rotation: 0.4,
    }

    await openModelMaterial({ ...MODEL, settings }, [texture()])

    expect(materialOf(useMaterials.getState(), opened().id).material).toMatchObject({
      color: settings.color,
      roughness: settings.roughness,
      metalness: settings.metalness,
      normalScale: settings.normalScale,
      aoIntensity: settings.aoIntensity,
      emissive: settings.emissive,
      emissiveIntensity: settings.emissiveIntensity,
    })
  })

  /**
   * A picture the cloud still holds has no file to decode. Asked before a tab is made, the way
   * `openAsset` asks it: left to `placeMaterialChannel`, which refuses one by one, the gesture
   * would leave an empty tab standing where a refusal belonged.
   */
  it('opens nothing, and says so, for a material the cloud still holds', async () => {
    const bridge = bridgeWatchingLogs()

    await openModelMaterial(MODEL, [texture({ location: 'cloud' })])

    expect(openedCount()).toBe(0)
    expect(bridge.report).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', scope: 'assets.open' }),
    )
  })
})
