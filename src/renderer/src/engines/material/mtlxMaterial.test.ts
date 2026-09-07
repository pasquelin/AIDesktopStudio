import { describe, expect, it } from 'vitest'
import {
  MTLX_BASE_COLOR,
  MTLX_DISPLACEMENT,
  MTLX_EMISSION,
  MTLX_METALNESS,
  MTLX_NORMAL,
  MTLX_ROUGHNESS,
  MTLX_SRGB,
  type MtlxDocument,
} from '@shared/domain/materialX'
import { materialFromMtlx, mtlxMaterialOf } from './mtlxMaterial'
import { newMaterial, type ChannelMap, type MaterialState } from './materialState'

const map = (assetId: string): ChannelMap => ({ assetId, origin: 'imported', width: 8, height: 8 })

type TextureOver = Partial<Omit<MaterialState, 'material'>> & {
  material?: Partial<MaterialState['material']>
}

function texture({ material, ...over }: TextureOver = {}): MaterialState {
  const base = newMaterial()
  return { ...base, ...over, material: { ...base.material, ...material } }
}

const inputsOf = (document: MtlxDocument): string[] => document.images.map(image => image.input)

describe('a texture written as MaterialX', () => {
  it('writes one image per channel the standard has an input for', () => {
    const written = mtlxMaterialOf(
      texture({ channels: { baseColor: map('a'), roughness: map('b') } }),
      { files: { baseColor: 'Assets/base.png', roughness: 'Assets/rough.png' } },
    )

    expect(inputsOf(written)).toEqual([MTLX_BASE_COLOR, MTLX_ROUGHNESS])
    expect(written.images[0]).toMatchObject({ file: 'Assets/base.png', colorspace: MTLX_SRGB })
    // A data map declares no colour space, which is what the specification's own examples do.
    expect(written.images[1]?.colorspace).toBeUndefined()
  })

  /**
   * The two channels the specification has no slot for. Writing them anyway would mean inventing
   * an input name, which every other reader would ignore — and this studio would then be the only
   * one able to read a file it presented as standard.
   */
  it('writes no image for occlusion or cavity, and keeps them in the studio state', () => {
    const written = mtlxMaterialOf(texture({ channels: { ao: map('a'), edge: map('b') } }), {
      files: { ao: 'Assets/ao.png', edge: 'Assets/edge.png' },
    })

    expect(written.images).toEqual([])
    expect(written.studio).toMatchObject({ channels: { ao: { assetId: 'a' } } })
  })

  it('round-trips a channel-specific UV rotation through studio metadata', () => {
    const baseColor = map('a')
    baseColor.transform = {
      tiling: { x: 2, y: 3 },
      offset: { x: 0.25, y: 0.5 },
      rotation: 0.4,
    }
    const written = mtlxMaterialOf(texture({ channels: { baseColor } }), {
      files: { baseColor: 'Images/base.png' },
    })

    expect(materialFromMtlx(written, () => 'relinked').channels.baseColor?.transform).toEqual(
      baseColor.transform,
    )
  })

  /**
   * What this function does with a path it was not given — NOT a statement that the path may be
   * lost. Finding one is `filesFor`'s job, and `textureDocument.test.ts` is what holds it: the
   * memory of what the file carried is consulted there, before this is ever called.
   */
  it('writes no image for a channel whose picture the window could not resolve', () => {
    const written = mtlxMaterialOf(texture({ channels: { baseColor: map('a') } }), { files: {} })

    expect(written.images).toEqual([])
  })

  /** A dial with no map is a uniform value on the same input, which is where a reader looks. */
  it('writes the dials with no map as uniform values', () => {
    const written = mtlxMaterialOf(texture({ material: { roughness: 0.25, metalness: 0.75 } }), {
      files: {},
    })

    expect(written.values).toContainEqual({ input: MTLX_ROUGHNESS, type: 'float', value: 0.25 })
    expect(written.values).toContainEqual({ input: MTLX_METALNESS, type: 'float', value: 0.75 })
  })

  it('writes no uniform value for an input an image already feeds', () => {
    const written = mtlxMaterialOf(texture({ channels: { roughness: map('a') } }), {
      files: { roughness: 'Assets/rough.png' },
    })

    expect(written.values.map(value => value.input)).not.toContain(MTLX_ROUGHNESS)
  })

  it('carries the tiling and the normal scale onto the nodes that hold them', () => {
    const written = mtlxMaterialOf(
      texture({
        channels: { normal: map('n') },
        material: { normalScale: 0.5, tiling: { x: 2, y: 4 }, offset: { x: 0.1, y: 0.2 } },
      }),
      { files: { normal: 'Assets/normal.png' } },
    )

    expect(written.images[0]).toMatchObject({
      input: MTLX_NORMAL,
      type: 'vector3',
      tiling: [2, 4],
      offset: [0.1, 0.2],
      wrap: { node: 'normalmap', scale: 0.5 },
    })
  })

  it('writes the height map as a displacement rather than a surface input', () => {
    const written = mtlxMaterialOf(
      texture({ channels: { height: map('h') }, material: { heightScale: 0.3 } }),
      { files: { height: 'Assets/height.png' } },
    )

    expect(written.images[0]).toMatchObject({
      input: MTLX_DISPLACEMENT,
      wrap: { node: 'displacement', scale: 0.3 },
    })
  })

  it('writes a base tint as a multiply and not as a value beside the map', () => {
    const written = mtlxMaterialOf(
      texture({ channels: { baseColor: map('a') }, material: { color: '#ff0000' } }),
      { files: { baseColor: 'Assets/base.png' } },
    )

    expect(written.images[0]?.multiply).toBeDefined()
    expect(written.values.map(value => value.input)).not.toContain(MTLX_BASE_COLOR)
  })
})

describe('a texture read back off its file', () => {
  it('comes back as it went in, dials the standard cannot say included', () => {
    const held = texture({
      channels: { ao: map('occlusion'), roughness: map('r') },
      material: { edgeIntensity: 0.4, roughnessRange: { min: 0.2, max: 0.9 }, metalness: 0.6 },
    })
    const written = mtlxMaterialOf(held, { files: { roughness: 'Assets/rough.png' } })

    expect(materialFromMtlx(written, () => '')).toEqual(held)
  })

  /**
   * The PATH first and the id second: a material copied into another project keeps ids that name
   * nothing there, while the pictures beside it are found. A path nothing answers keeps the id,
   * this window holding only the assets it has been shown.
   */
  it('relinks a channel by the path the file spells', () => {
    const written = mtlxMaterialOf(texture({ channels: { roughness: map('old') } }), {
      files: { roughness: 'Assets/rough.png' },
    })

    const read = materialFromMtlx(written, file => (file === 'Assets/rough.png' ? 'new' : ''))
    expect(read.channels.roughness?.assetId).toBe('new')
  })

  it('keeps the id a path nothing answers', () => {
    const written = mtlxMaterialOf(texture({ channels: { roughness: map('old') } }), {
      files: { roughness: 'Assets/rough.png' },
    })

    expect(materialFromMtlx(written, () => '').channels.roughness?.assetId).toBe('old')
  })
})

/**
 * A `.mtlx` carrying no attribute of ours — the file the specification's own examples are. What
 * the standard cannot say is absent rather than guessed.
 */
describe('a MaterialX file this studio did not write', () => {
  const foreign: MtlxDocument = {
    images: [
      {
        input: MTLX_BASE_COLOR,
        type: 'color3',
        file: 'brass_color.jpg',
        colorspace: MTLX_SRGB,
        tiling: [3, 3],
        offset: [0, 0],
      },
      {
        input: MTLX_NORMAL,
        type: 'vector3',
        file: 'brass_normal.jpg',
        tiling: [3, 3],
        offset: [0, 0],
        wrap: { node: 'normalmap', scale: 0.8 },
      },
    ],
    values: [
      { input: MTLX_ROUGHNESS, type: 'float', value: 0.35 },
      { input: MTLX_EMISSION, type: 'float', value: 2 },
    ],
  }

  it('rebuilds the dials the graph states', () => {
    const read = materialFromMtlx(foreign, file => `asset:${file}`)

    expect(read.material).toMatchObject({
      roughness: 0.35,
      normalScale: 0.8,
      emissiveIntensity: 2,
      tiling: { x: 3, y: 3 },
    })
  })

  it('links the pictures it names through the catalogue', () => {
    const read = materialFromMtlx(foreign, file => `asset:${file}`)

    expect(read.channels.baseColor?.assetId).toBe('asset:brass_color.jpg')
    expect(read.channels.normal?.origin).toBe('imported')
  })

  it('leaves the channels the standard cannot carry empty', () => {
    const read = materialFromMtlx(foreign, file => `asset:${file}`)

    expect(read.channels.ao).toBeUndefined()
    expect(read.channels.edge).toBeUndefined()
  })
})
