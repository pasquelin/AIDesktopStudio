import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_TRAITS,
  MATERIAL_TRAITS,
  MONTAGE_TRAITS,
  PICTURE_TRAITS,
  SCENE_TRAITS,
  SKY_TRAITS,
  TRAITS_OF_DOMAIN,
  KNOWN_FORMATS,
  capabilityOf,
  carrying,
  formatOfFile,
  lossesFor,
  type CapabilityTrait,
} from './formatCapability'

const STACKED: readonly CapabilityTrait[] = ['layers', 'blendMode', 'layerMask']

describe('what a format would drop for good', () => {
  it('drops every trait of a stacked document into a flat picture', () => {
    expect(lossesFor(STACKED, 'png')).toEqual(['layers', 'blendMode', 'layerMask'])
  })

  it('drops nothing from a document that is already one flat layer', () => {
    // The rule this makes possible: a picture opened, painted on and saved back stays a picture,
    // with no dialog in the way.
    expect(lossesFor([], 'png')).toEqual([])
  })

  it('drops nothing into the open format that carries a stack', () => {
    expect(lossesFor(STACKED, 'ora')).toEqual([])
  })

  // « No answer » must never read as « nothing to lose »: an `.otio` has no field for a layer.
  it('drops everything into a format of another domain', () => {
    expect(lossesFor(STACKED, 'otio')).toEqual(STACKED)
    expect(lossesFor(['tracks', 'clipFade'], 'ora')).toEqual(['tracks', 'clipFade'])
  })

  it('drops nothing of a montage into the format that carries a cut', () => {
    expect(lossesFor(MONTAGE_TRAITS, 'otio')).toEqual([])
  })

  // What the manual promises of a saved scene: the standard part is poorer, the file is not.
  it('drops nothing of a scene into the glTF that IS the scene document', () => {
    expect(lossesFor(SCENE_TRAITS, 'gltf')).toEqual([])
    expect(lossesFor(['cameraPath', 'cameraShot'], 'ora')).toEqual(['cameraPath', 'cameraShot'])
  })

  it('keeps the order the traits were given, so two documents read the same way', () => {
    expect(lossesFor(['liveText', 'layers'], 'jpeg')).toEqual(['liveText', 'layers'])
  })
})

describe('what a file name says its format is', () => {
  it('reads the extension, whatever its case', () => {
    expect(formatOfFile('hero.ORA')).toBe('ora')
    expect(formatOfFile('hero.jpeg')).toBe('jpeg')
    expect(formatOfFile('hero.jpg')).toBe('jpeg')
    expect(formatOfFile('Bande.otio')).toBe('otio')
  })

  /** Not « nothing to lose »: a format this table cannot write has no answer to give at all. */
  it('answers nothing for a format it does not write, and for a name with no extension', () => {
    expect(formatOfFile('scan.tif')).toBeNull()
    expect(formatOfFile('README')).toBeNull()
    // A `.glb` is an export of a selection, never a document saved back over.
    expect(formatOfFile('hero.glb')).toBeNull()
  })

  it('reads a scene document by its own extension', () => {
    expect(formatOfFile('Plateau.gltf')).toBe('gltf')
  })
})

describe('a capability built from what it carries', () => {
  it('drops the rest of its domain rather than taking a second list to keep in step', () => {
    expect(carrying('sky', ['skyImage'], ['skyGrading']).dropped).toEqual([
      'sunAngles',
      'sunIntensity',
      'sunColour',
      'environmentIntensity',
      'backgroundVisible',
      'skyGeneration',
    ])
  })
})

describe('the table itself', () => {
  // Every capability of both tables comes from `carrying` now, so these two cannot fail on what
  // is there today: what they still catch is a capability somebody writes out by hand later.
  it('classes every trait exactly once per format, so a new trait cannot slip in unclassed', () => {
    // The defect this guards is the one the module exists to stop. A trait nobody classed would
    // read as carried — and a trait wrongly read as carried is a trait silently lost, which is
    // the whole failure this table was written against.
    const misclassed = KNOWN_FORMATS.flatMap(format => {
      const { domain, interchange, extended, dropped } = capabilityOf(format)
      const all = [...interchange, ...extended, ...dropped]

      return TRAITS_OF_DOMAIN[domain]
        .filter(trait => all.filter(classed => classed === trait).length !== 1)
        .map(trait => `${format}: ${trait}`)
    })

    expect(misclassed).toEqual([])
  })

  // A format that classed a trait of the other domain would answer « carried » for something it
  // has no field for — an `.otio` claiming to hold a layer mask.
  it('names no trait outside its own domain', () => {
    const foreign = KNOWN_FORMATS.flatMap(format => {
      const { domain, interchange, extended, dropped } = capabilityOf(format)

      return [...interchange, ...extended, ...dropped]
        .filter(trait => !TRAITS_OF_DOMAIN[domain].includes(trait))
        .map(trait => `${format}: ${trait}`)
    })

    expect(foreign).toEqual([])
  })

  /**
   * The two channels `standard_surface` has no input for. They are carried — the studio reads
   * them back — so ⌘S has nothing to warn about; what they are NOT is visible to anyone else.
   */
  it('loses neither occlusion nor cavity into MaterialX, and carries neither into the open', () => {
    expect(lossesFor(['occlusionMap', 'cavityMap'], 'mtlx')).toEqual([])
    expect(capabilityOf('mtlx').interchange).not.toContain('occlusionMap')
    expect(capabilityOf('mtlx').extended).toContain('occlusionMap')
  })

  it('reports a trait of another domain against MaterialX as lost', () => {
    expect(lossesFor(['layers'], 'mtlx')).toEqual(['layers'])
  })

  // That the lists share no value is the COMPILER's to hold — the trait unions have no overlap,
  // so an assertion here would not even type-check.
  it('publishes a union that is exactly its domains', () => {
    expect([...CAPABILITY_TRAITS].sort()).toEqual(
      [
        ...PICTURE_TRAITS,
        ...MONTAGE_TRAITS,
        ...SCENE_TRAITS,
        ...MATERIAL_TRAITS,
        ...SKY_TRAITS,
      ].sort(),
    )
  })

  // The sky has traits and no writable format of its own: only an EXPORT answers about one, and
  // `exportRegistry` is where that answer lives. Read as « nothing to lose » it would be a lie.
  it('answers for every domain a trait belongs to', () => {
    const covered = Object.values(TRAITS_OF_DOMAIN).flatMap(traits => [...traits])
    expect([...covered].sort()).toEqual([...CAPABILITY_TRAITS].sort())
  })
})
