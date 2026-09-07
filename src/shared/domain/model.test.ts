import { describe, expect, it } from 'vitest'
import {
  CAPABILITIES_BY_FAMILY,
  FAMILY_TAGS,
  MODEL_FAMILIES,
  servesStudioCapability,
  STUDIO_CAPABILITIES,
  studioCapability,
  pixelArtFirst,
  suitsPixelArt,
  tagLabel,
  TAGS_BY_FAMILY,
  TAG_LABEL_KEY_LIST,
  TAG_LABEL_KEYS,
  type ModelSummary,
  tagOfFamily,
} from './model'

const OFFERED_TAGS = [...new Set(MODEL_FAMILIES.flatMap(family => TAGS_BY_FAMILY[family]))]

describe('the tags that name a family', () => {
  /**
   * A family may claim SEVERAL tags — the skyboxes do, `SKYBOX_TAG` naming three models and
   * `skybox-upscale` the fourth — but a tag names one family and one only: `familyOf` answers
   * with the first entry it matches, so a tag written twice would file the same model under
   * whichever family happened to come first in this list.
   */
  it('names a family that exists, and never lets one tag name two', () => {
    const families = FAMILY_TAGS.map(entry => entry.family)
    const tags = FAMILY_TAGS.map(entry => entry.tag)

    expect(families.every(family => MODEL_FAMILIES.includes(family))).toBe(true)
    expect(new Set(tags).size).toBe(tags.length)
  })

  /**
   * `image-upscale` sat in the Image facet menu until upscalers became their own family: the
   * listing then dropped every model the facet could have matched, so the menu offered a filter
   * whose only answer was none. Under its own family it would be just as empty a promise —
   * every row already carries it.
   */
  it('offers none of them as a facet, under any family', () => {
    const offered = MODEL_FAMILIES.flatMap(family => TAGS_BY_FAMILY[family])

    expect(FAMILY_TAGS.filter(entry => offered.includes(entry.tag))).toEqual([])
  })

  /**
   * A family claiming several tags can be narrowed by NONE of them — no model carries them all,
   * so the listing would come back missing whichever the others named. The skyboxes are the
   * case: `skybox-upscale` is indexed by the API where `SKYBOX_TAG` is not, so answering it
   * here would quietly cut that space from four models to the one carrying it.
   */
  it('answers the tag of a family that has exactly one, and nothing for the others', () => {
    expect(tagOfFamily('upscale')).toBe('image-upscale')
    expect(tagOfFamily('skybox')).toBeUndefined()
    expect(tagOfFamily('image')).toBeUndefined()
  })
})

/**
 * The facet menu showed these as the publishers wrote them, so a French studio read `Text to
 * Image` in a menu that was French everywhere else. Naming them is what fixed it; these keep the
 * naming honest, because nothing else can: the value doubles as its own fallback, so a tag
 * forgotten here degrades silently back into English rather than failing.
 */
describe('the tags a facet menu offers', () => {
  it('has an answer for every one of them, a name or a deliberate silence', () => {
    expect(OFFERED_TAGS.filter(tag => !(tag in TAG_LABEL_KEYS))).toEqual([])
  })

  // An entry for a tag no menu offers is a translation nobody reads and a bundle line nobody
  // removes: the record answers about the table above, so it does not outlive it.
  it('answers about no tag it does not offer', () => {
    expect(Object.keys(TAG_LABEL_KEYS).filter(tag => !OFFERED_TAGS.includes(tag))).toEqual([])
  })

  it('gives each named tag a key of its own', () => {
    expect(new Set(TAG_LABEL_KEY_LIST).size).toBe(TAG_LABEL_KEY_LIST.length)
  })

  it('shows the publisher word wherever it named nothing, never a key', () => {
    expect(tagLabel('PBR', () => 'unreachable')).toBe('PBR')
    expect(tagLabel('Multiview', key => `<${key}>`)).toBe('<modelTags.multiview>')
    // A tag the table has never heard of still has to read as something.
    expect(tagLabel('Nano Banana Pro', () => 'unreachable')).toBe('Nano Banana Pro')
  })
})

/**
 * The employments the studio names and the API's enum does not hold. A capability is what keys a
 * stored preference, so one nothing can find would read as « no choice made » and never redden.
 */
describe('the capabilities the studio names itself', () => {
  it('names one its family declares, so a role can be composed from it', () => {
    const stray = STUDIO_CAPABILITIES.filter(
      entry => !CAPABILITIES_BY_FAMILY[entry.family].includes(entry.capability),
    )

    expect(stray).toEqual([])
  })

  it('answers the rule that finds a studio capability, and nothing for an API one', () => {
    expect(studioCapability('rig')).toBeDefined()
    expect(studioCapability('img23d')).toBeUndefined()
  })

  /**
   * MEASURED 2026-08-18: `3d23d` covers 19 public models and five of them rig. Without the tag
   * the employment would offer remeshers, unwrappers and segmenters as riggers.
   */
  it('tells a rigger from the rest of what answers 3d23d', () => {
    const rig = studioCapability('rig')
    if (!rig) throw new Error('rig is a studio capability')

    expect(servesStudioCapability(rig, { capabilities: ['3d23d'], tags: ['Rigging'] })).toBe(true)
    expect(servesStudioCapability(rig, { capabilities: ['3d23d'], tags: ['Remesh'] })).toBe(false)
    expect(servesStudioCapability(rig, { capabilities: ['img23d'], tags: ['Rigging'] })).toBe(false)
  })

  /**
   * A rigger carries `Animation` too — `tripo-rigging-v2-5` does — so the motion employment is
   * what a model is offered for only when it does NOT rig. The capability is deliberately not
   * read: the motion models span `txt23d`, `video23d` and `3d23d`.
   */
  it('keeps a rigger out of the motion employment, whatever else it carries', () => {
    const motion = studioCapability('motion')
    if (!motion) throw new Error('motion is a studio capability')

    expect(servesStudioCapability(motion, { capabilities: ['txt23d'], tags: ['Motion'] })).toBe(
      true,
    )
    expect(
      servesStudioCapability(motion, { capabilities: ['3d23d'], tags: ['Animation', 'Rigging'] }),
    ).toBe(false)
  })

  // A family whose whole membership IS the employment narrows nothing: `FAMILY_TAGS` already
  // filed those models, and asking for the capability again would refuse none of them.
  it('lets every model of a single-employment family serve it', () => {
    const upscale = studioCapability('upscale')
    if (!upscale) throw new Error('upscale is a studio capability')

    expect(servesStudioCapability(upscale, { capabilities: ['img2img'], tags: [] })).toBe(true)
  })

  // The author writes the tag; the studio must not depend on how they cased it.
  it('reads an author tag in whatever case it was written', () => {
    const rig = studioCapability('rig')
    if (!rig) throw new Error('rig is a studio capability')

    expect(servesStudioCapability(rig, { capabilities: ['3d23d'], tags: ['RIGGING'] })).toBe(true)
  })
})

describe('the families that have an employment', () => {
  /**
   * `aiRoleId` refuses a capability its family does not declare, so a family with an empty list
   * can be served by nothing at all — which is what kept upscaling, cutout and vectorisation on a
   * second preference table until 2026-08-23.
   */
  it('leaves only `other` with none', () => {
    const empty = MODEL_FAMILIES.filter(family => CAPABILITIES_BY_FAMILY[family].length === 0)

    expect(empty).toEqual(['other'])
  })
})

describe('what suits pixel art', () => {
  const model = (over: Partial<ModelSummary>): ModelSummary => ({
    id: 'm',
    name: 'A model',
    family: 'image',
    runsOn: 'scenario',
    source: 'scenario',
    origin: 'official',
    featured: false,
    capabilities: [],
    tags: [],
    ...over,
  })

  // The name, the description and the tags alike: a person reads all three, and no catalogue
  // count says which one a real pixel-art model wears.
  it('answers to the genre wherever it is written', () => {
    expect(suitsPixelArt(model({ name: 'Pixel Art Sprites' }))).toBe(true)
    expect(suitsPixelArt(model({ description: 'sprites, pixel-art ready' }))).toBe(true)
    expect(suitsPixelArt(model({ tags: ['pixelart'] }))).toBe(true)
    expect(suitsPixelArt(model({ name: 'Photoreal Portraits' }))).toBe(false)
  })

  /**
   * 🛑 A promotion badges the row, so a false one is worse than a miss: these three all read as
   * pixel art on a substring, and two of them are bit depth said in the only place it is said.
   */
  it('is not fooled by a word that merely starts with it, nor by bit depth', () => {
    expect(suitsPixelArt(model({ name: 'Remove Pixel Artifacts' }))).toBe(false)
    expect(suitsPixelArt(model({ description: 'outputs 16-bit colour depth' }))).toBe(false)
    expect(suitsPixelArt(model({ description: '8-bit quantization, smaller files' }))).toBe(false)
    expect(suitsPixelArt(model({ name: '8-bit Diffusion' }))).toBe(true)
  })

  /** The grid only ever reaches an image body — `EXTRAS` holds every other family at `null`. */
  it('promotes nothing outside the family the grid can reach', () => {
    expect(suitsPixelArt(model({ name: 'Pixel Art Sprites', family: 'audio' }))).toBe(false)
  })

  /**
   * 🛑 The promise the picker is given: a SORT, so every model handed in comes back out. Counted
   * rather than asserted per case — a filter that dropped one would still pass an order check.
   */
  it('lifts the suited ones without dropping any, and keeps the order in each half', () => {
    const listed = [
      model({ id: 'a', name: 'Photoreal' }),
      model({ id: 'b', name: 'Pixel Art Sprites' }),
      model({ id: 'c', name: 'Landscapes' }),
      model({ id: 'd', name: 'Pixel Art Tiles' }),
    ]

    expect(pixelArtFirst(listed).map(one => one.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(pixelArtFirst(listed.filter(one => !suitsPixelArt(one)))).toEqual([listed[0], listed[2]])
  })
})
