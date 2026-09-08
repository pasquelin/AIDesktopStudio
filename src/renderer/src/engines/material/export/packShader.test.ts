import { localizedError } from '@shared/localizedError'
import { Texture } from 'three'
import { describe, expect, it } from 'vitest'
import {
  assetsOf,
  resolvePictures,
  type ExportChannels,
  type ResolvedPicture,
} from '@shared/domain/materialExport'
import { createPackPass } from './packShader'

/** Every channel filled, so a recipe that drops one drops it for a reason of its own. */
const CHANNELS_WITH_EVERYTHING: ExportChannels = {
  baseColor: { assetId: 'a-base' },
  normal: { assetId: 'a-normal' },
  roughness: { assetId: 'a-roughness' },
  metalness: { assetId: 'a-metalness' },
  ao: { assetId: 'a-ao' },
  height: { assetId: 'a-height' },
  emissive: { assetId: 'a-emissive' },
  edge: { assetId: 'a-edge' },
}

function pictureNamed(target: 'unreal' | 'unity' | 'roblox', suffix: string): ResolvedPicture {
  const found = resolvePictures(target, CHANNELS_WITH_EVERYTHING, 'mat').find(
    p => p.name === `mat${suffix}`,
  )
  if (!found) throw new Error(`no picture named mat${suffix}`)
  return found
}

/** Every asset decodes, which is what a run that reached the pass would have handed over. */
function decoded(picture: ResolvedPicture): Texture[] {
  return assetsOf(picture).map(() => new Texture())
}

function shaderOf(picture: ResolvedPicture): string {
  return createPackPass(picture, decoded(picture)).material.fragmentShader
}

/**
 * The four arguments of the `vec4`, in order. Read as a list rather than searched for: a
 * `toContain('1.0,')` passes on every recipe, because alpha is 1 on every recipe — it said
 * nothing about which component carried what.
 */
function componentsOf(picture: ResolvedPicture): string[] {
  const shader = shaderOf(picture)
  return shader
    .slice(shader.indexOf('vec4('), shader.indexOf('\n  );'))
    .split('\n')
    .slice(1)
    .map(line => line.trim().replace(/,$/, ''))
}

describe('the packing shader', () => {
  it('declares one sampler per channel the picture reads, and no more', () => {
    const shader = shaderOf(pictureNamed('unreal', '_ORM'))

    expect(shader).toContain('uniform sampler2D uSource0;')
    expect(shader).toContain('uniform sampler2D uSource1;')
    expect(shader).toContain('uniform sampler2D uSource2;')
    expect(shader).not.toContain('uSource3')
  })

  /**
   * The values, not only the names. Naming three samplers says nothing about which picture each
   * one carries, and the whole pass rests on one invariant — the order of `assetsOf` is the
   * order the textures were decoded in. Bound the wrong way round, an ORM whose three components
   * all read the occlusion would ship in silence.
   */
  it('binds each sampler to the texture of the channel its slot reads', () => {
    const orm = pictureNamed('unreal', '_ORM')
    const textures = decoded(orm)
    const { material } = createPackPass(orm, textures)

    expect(Object.keys(material.uniforms)).toEqual(['uSource0', 'uSource1', 'uSource2'])
    // Distinct instances, so a swap or a shared binding cannot pass: `assetsOf` names occlusion,
    // roughness and metalness in that order, and each sampler must hold its own.
    expect(material.uniforms.uSource0?.value).toBe(textures[0])
    expect(material.uniforms.uSource1?.value).toBe(textures[1])
    expect(material.uniforms.uSource2?.value).toBe(textures[2])
    expect(new Set(textures).size).toBe(3)
  })

  /** A shader missing its preamble or its vertex half does not compile, and said nothing. */
  it('carries the preamble and the vertex shader every pass needs', () => {
    const orm = pictureNamed('unreal', '_ORM')
    const { material } = createPackPass(orm, decoded(orm))

    expect(material.fragmentShader).toContain('varying vec2 vUv;')
    expect(material.fragmentShader).toContain('precision highp float;')
    expect(material.vertexShader).toContain('vUv = uv;')
  })

  it('reads one asset through one sampler, however many components want it', () => {
    const shader = shaderOf(pictureNamed('roblox', '_ColorMap'))

    expect(shader).toContain('uniform sampler2D uSource0;')
    expect(shader).not.toContain('uSource1')
    expect(shader).toContain('texture2D(uSource0, vUv).r')
    expect(shader).toContain('texture2D(uSource0, vUv).g')
    expect(shader).toContain('texture2D(uSource0, vUv).b')
  })

  it('puts each channel of an ORM on the component the format reads it from', () => {
    // Occlusion, roughness, metallic — in that order, each off its own sampler's red.
    expect(componentsOf(pictureNamed('unreal', '_ORM'))).toEqual([
      'texture2D(uSource0, vUv).r',
      'texture2D(uSource1, vUv).r',
      'texture2D(uSource2, vUv).r',
      '1.0',
    ])
  })

  it('inverts only the component whose recipe asked for it', () => {
    expect(componentsOf(pictureNamed('unreal', '_Normal'))).toEqual([
      'texture2D(uSource0, vUv).r',
      '(1.0 - texture2D(uSource0, vUv).g)',
      'texture2D(uSource0, vUv).b',
      '1.0',
    ])
  })

  it('writes a constant as a float, which is the only thing GLSL will read it as', () => {
    // Blue is held at zero on this recipe: `0` alone is an int, and vec4 refuses it.
    expect(componentsOf(pictureNamed('unity', '_MaskMap'))[2]).toBe('0.0')
  })

  it('holds a missing channel at the value the recipe named, on its own component', () => {
    const noOcclusion: ExportChannels = { roughness: { assetId: 'a-roughness' } }
    const orm = resolvePictures('unreal', noOcclusion, 'mat').find(p => p.name === 'mat_ORM')
    if (!orm) throw new Error('no ORM')

    // Not occluded on red, the roughness that is there on green, not metal on blue.
    expect(componentsOf(orm)).toEqual(['1.0', 'texture2D(uSource0, vUv).r', '0.0', '1.0'])
  })

  it('mixes between the two ends of a remapped window', () => {
    const narrowed: ExportChannels = {
      roughness: { assetId: 'a-roughness', range: { min: 0.25, max: 0.75 } },
    }
    const orm = resolvePictures('unreal', narrowed, 'mat').find(p => p.name === 'mat_ORM')
    if (!orm) throw new Error('no ORM')

    expect(componentsOf(orm)[1]).toBe('mix(0.25, 0.75, texture2D(uSource0, vUv).r)')
  })

  it('opens the four components in the order red, green, blue, alpha', () => {
    expect(componentsOf(pictureNamed('unity', '_MaskMap'))).toEqual([
      'texture2D(uSource0, vUv).r',
      'texture2D(uSource1, vUv).r',
      '0.0',
      '(1.0 - texture2D(uSource2, vUv).r)',
    ])
  })

  it('refuses a picture whose channel nobody decoded, rather than sampling black', () => {
    expect(() => createPackPass(pictureNamed('unreal', '_ORM'), [])).toThrow(
      localizedError('packedImageNotDecoded', { name: 'mat_ORM', asset: 'a-ao' }).message,
    )
  })
})

/**
 * The file names the two manuals print in their table of destinations. Pinned as whole lists:
 * every one of them could be renamed with every other test staying green, and a renamed suffix
 * is an engine that silently stops finding its map.
 */
describe('the files each target names', () => {
  const namesFor = (target: 'unity' | 'unreal' | 'roblox' | 'raw' | 'gltf'): string[] =>
    resolvePictures(target, CHANNELS_WITH_EVERYTHING, 'mat').map(picture => picture.name)

  it('names Unity maps as URP looks them up', () => {
    expect(namesFor('unity')).toEqual([
      'mat_BaseMap',
      'mat_BumpMap',
      'mat_MaskMap',
      'mat_EmissionMap',
      'mat_ParallaxMap',
    ])
  })

  it('names Unreal maps as its import expects', () => {
    expect(namesFor('unreal')).toEqual([
      'mat_BaseColor',
      'mat_Normal',
      'mat_ORM',
      'mat_Emissive',
      'mat_Height',
    ])
  })

  it('names the eight raw channels after what they hold', () => {
    expect(namesFor('raw')).toEqual([
      'mat_BaseColor',
      'mat_Normal',
      'mat_Roughness',
      'mat_Metalness',
      'mat_AO',
      'mat_Height',
      'mat_Emissive',
      'mat_Edge',
    ])
  })

  it('keeps the raw normal a colour, which is what a normal is', () => {
    const normal = resolvePictures('raw', CHANNELS_WITH_EVERYTHING, 'mat').find(
      picture => picture.name === 'mat_Normal',
    )
    if (!normal) throw new Error('no normal')

    // Read component by component: flattened to grey, a normal map points nowhere.
    expect(componentsOf(normal)).toEqual([
      'texture2D(uSource0, vUv).r',
      'texture2D(uSource0, vUv).g',
      'texture2D(uSource0, vUv).b',
      '1.0',
    ])
  })
})
