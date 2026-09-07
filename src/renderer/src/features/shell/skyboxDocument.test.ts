import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TRANSLATIONS } from '@shared/i18n'
import { createSkyboxContent, type SkyboxContent } from '@shared/domain/skybox'
import { KHR_LIGHTS_PUNCTUAL } from '@shared/domain/gltf'
import { isRecord } from '@shared/guards'
import type { Asset } from '@shared/domain/asset'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import {
  forgetCarriedSky,
  skyboxFromPayload,
  skyboxPayload,
  skyRefusesToSave,
} from './skyboxDocument'

const DOCUMENT = 'doc-sky'

const dusk = (): Asset => ({
  id: 'asset-dusk',
  name: 'dusk',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-18T10:00:00.000Z',
})

/** A sky filed two folders deep, so the link it writes has somewhere to climb out of. */
function openSky(path = 'Ciels/Nuit/Crépuscule.gltf'): void {
  useDocuments.setState({
    documents: {
      [DOCUMENT]: {
        id: DOCUMENT,
        kind: 'skybox',
        title: 'Crépuscule',
        workspace: 'skyboxes',
        path,
      },
    },
    activeId: DOCUMENT,
  })
}

const sky = (over: Partial<SkyboxContent> = {}): SkyboxContent => ({
  ...createSkyboxContent(),
  source: { assetId: 'asset-dusk' },
  ...over,
})

/** Where the file names its picture: on the node it turns with, never in `images`. */
const uriOf = (payload: unknown): string => {
  const nodes = isRecord(payload) && Array.isArray(payload.nodes) ? payload.nodes : []
  const horizon = nodes.filter(isRecord).find(node => node.name === 'Horizon')
  const extras = isRecord(horizon?.extras) ? horizon.extras.aidesktopstudio : null
  return isRecord(extras) && typeof extras.source === 'string' ? extras.source : ''
}

/**
 * The refusal is a SENTENCE, so the bundles have to be loaded for it to be one. Straight into
 * i18next rather than through `initI18n`, which reads `localStorage` and writes on the document —
 * neither of which a suite outside a browser has.
 */
beforeAll(async () => {
  await i18next.init({
    lng: 'fr',
    defaultNS: 'studio',
    resources: { fr: { studio: TRANSLATIONS.fr } },
    interpolation: { escapeValue: false },
  })
})

beforeEach(() => {
  useAssets.setState({ items: [{ ...dusk(), path: 'Assets/dusk.hdr' }] })
})

describe('the picture a sky points at', () => {
  /**
   * Relative to the document's OWN folder, which is what makes a project movable — an absolute
   * link names the machine it was written on, and an asset id names nothing outside this studio.
   * The id rides in `extras` beside it, as a montage's does: the standard part is the path.
   */
  it('is a path out of the document’s folder', () => {
    openSky()

    expect(uriOf(skyboxPayload(sky(), DOCUMENT))).toBe('../../Assets/dusk.hdr')
  })

  it('is a plain name for a sky filed beside its picture', () => {
    openSky('Assets/Crépuscule.gltf')

    expect(uriOf(skyboxPayload(sky(), DOCUMENT))).toBe('dusk.hdr')
  })

  /** Percent-encoded on the way out, and taken apart segment by segment on the way back. */
  it('survives a folder whose name needs escaping', () => {
    useAssets.setState({ items: [{ ...dusk(), path: 'Été 2026/dusk.hdr' }] })
    openSky('Ciels/Crépuscule.gltf')

    const written = skyboxPayload(sky(), DOCUMENT)
    expect(uriOf(written)).toContain('%C3%89t%C3%A9')
    expect(skyboxFromPayload(written, DOCUMENT)).toMatchObject({
      source: { assetId: 'asset-dusk' },
    })
  })

  /** The gesture the whole format is for: written, read back, and the same sky on both sides. */
  it('comes back as the sky that was written', () => {
    openSky()
    const content = sky({ sun: { elevation: 0.4, azimuth: 2, intensity: 3, color: '#88aaff' } })

    expect(skyboxFromPayload(skyboxPayload(content, DOCUMENT), DOCUMENT)).toEqual(content)
  })

  /**
   * The link is KEPT when the path answers nothing, and that is not laxity: this window's
   * catalogue holds only what it has been SHOWN, so a picture whose row has not been listed yet
   * answers nothing — and dropping the link would lose it for good at the next ⌘S.
   */
  it('keeps the link it was given when nothing here answers the path', () => {
    const written = skyboxPayload(sky(), DOCUMENT)
    useAssets.setState({ items: [] })

    expect(skyboxFromPayload(written, DOCUMENT)).toMatchObject({
      source: { assetId: 'asset-dusk' },
    })
  })

  /**
   * The link survives a ⌘S made while the catalogue has not answered — which is the ordinary state
   * of a window that has not opened the shelf. Without it the picture left the file for every
   * other reader, silently, and only the studio's own id was left to find it by.
   */
  it('writes the link the file already carried when the catalogue answers nothing', () => {
    openSky()
    skyboxFromPayload(skyboxPayload(sky(), DOCUMENT), DOCUMENT)
    useAssets.setState({ items: [] })

    expect(uriOf(skyboxPayload(sky(), DOCUMENT))).toBe('../../Assets/dusk.hdr')
  })

  /** A sky copied into another project finds its picture by the path, not by the stale id. */
  it('prefers the picture the path names over the id the file also carries', () => {
    openSky()
    const written = skyboxPayload(sky(), DOCUMENT)
    useAssets.setState({ items: [{ ...dusk(), id: 'asset-elsewhere', path: 'Assets/dusk.hdr' }] })

    expect(skyboxFromPayload(written, DOCUMENT)).toMatchObject({
      source: { assetId: 'asset-elsewhere' },
    })
  })
})

/**
 * glTF is an INDEX-LINKED graph, and the studio recomposes its nodes from two. A file holding a
 * mesh, a camera or an animation cannot be half rewritten — a `meshes` kept without its
 * `accessors`, or beside two fresh nodes, is a broken file. So the save is refused and the file
 * stays as its author left it, exactly as an incomplete montage is refused.
 */
describe('a sky whose file holds more than the studio composes', () => {
  const withScene = (): unknown => ({
    ...(skyboxPayload(sky(), DOCUMENT) as Record<string, unknown>),
    meshes: [{ primitives: [] }],
    accessors: [],
  })

  it('refuses to be saved, and says what it holds', () => {
    openSky()
    skyboxFromPayload(withScene(), DOCUMENT)

    expect(skyRefusesToSave(DOCUMENT)).toContain('glTF')
  })

  /**
   * The case the refusal was blind to until 18/08, and the one an ordinary user meets: a light
   * added in Blender brings no new root key at all, so a guard reading root keys let it through
   * and the next ⌘S deleted it. `skyHoldsMore` is what decides now — `gltfSky.test.ts` names each
   * member it finds; this one only proves the refusal is wired to it.
   */
  it('refuses to be saved over a file that gained a second light', () => {
    openSky()
    skyboxFromPayload(
      {
        ...(skyboxPayload(sky(), DOCUMENT) as Record<string, unknown>),
        extensions: {
          [KHR_LIGHTS_PUNCTUAL]: { lights: [{ type: 'directional' }, { type: 'point' }] },
        },
      },
      DOCUMENT,
    )

    expect(skyRefusesToSave(DOCUMENT)).toContain('glTF')
  })

  it('opens like any other once the file holds nothing else', () => {
    openSky()
    skyboxFromPayload(withScene(), DOCUMENT)
    skyboxFromPayload(skyboxPayload(sky(), DOCUMENT), DOCUMENT)

    expect(skyRefusesToSave(DOCUMENT)).toBeNull()
  })

  /** Dropped with the document, so a reopened id never inherits another file's refusal. */
  it('forgets its refusal when the document is closed', () => {
    openSky()
    skyboxFromPayload(withScene(), DOCUMENT)
    forgetCarriedSky(DOCUMENT)

    expect(uriOf(skyboxPayload(sky({ source: null }), DOCUMENT))).toBe('')
  })
})
