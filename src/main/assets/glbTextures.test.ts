import { describe, expect, it } from 'vitest'
import { glbChunksOf, glbFrom, glbJson } from '@shared/domain/glbContainer'
import { glbFile as glb, glbWearing as fileWith } from './glb-fixtures'
import { embeddedTextures, withoutEmbeddedTextures } from './glbTextures'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9])

describe('the pictures a glb carries', () => {
  it('hands back the bytes exactly as the file holds them', () => {
    const found = embeddedTextures(fileWith('baseColorTexture', JPEG))

    expect(found).toHaveLength(1)
    // Copied, never re-encoded: a round trip through a codec would soften what was painted.
    expect(found[0]?.bytes).toEqual(JPEG)
    expect(found[0]?.mimeType).toBe('image/jpeg')
  })

  it('names the channel when the slot means exactly one', () => {
    const slots: [string, string][] = [
      ['baseColorTexture', 'baseColor'],
      ['normalTexture', 'normal'],
      ['occlusionTexture', 'ao'],
      ['emissiveTexture', 'emissive'],
    ]

    for (const [slot, channel] of slots) {
      expect(embeddedTextures(fileWith(slot, JPEG))[0]?.channel).toBe(channel)
    }
  })

  /**
   * glTF packs roughness in green and metalness in blue of ONE picture, and the studio stores
   * those as two channels. Claiming either would label the pixels wrongly, so it comes out
   * unlabelled — the picture is still there to look at and to edit.
   */
  it('claims no channel for the one that packs two', () => {
    const found = embeddedTextures(fileWith('metallicRoughnessTexture', PNG, 'image/png'))

    expect(found).toHaveLength(1)
    expect(found[0]?.channel).toBeUndefined()
    expect(found[0]?.slot).toBe('metallicRoughnessTexture')
  })

  // An extension's slot is spelt the same way, so its picture comes out — unlabelled rather
  // than forced into a channel it is not.
  it('takes an extension slot without inventing a channel for it', () => {
    const file = glb(
      {
        materials: [
          { extensions: { KHR_materials_clearcoat: { clearcoatTexture: { index: 0 } } } },
        ],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/png' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: PNG.byteLength }],
      },
      PNG,
    )

    expect(embeddedTextures(file)).toMatchObject([{ slot: 'clearcoatTexture' }])
  })

  // Two slots wearing one picture is ordinary — a mask reused. One asset, not two copies.
  it('hands one picture back once, however many slots wear it', () => {
    const file = glb(
      {
        materials: [
          {
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
            occlusionTexture: { index: 0 },
          },
        ],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength }],
      },
      JPEG,
    )

    expect(embeddedTextures(file)).toHaveLength(1)
  })

  /**
   * A compressed `.glb` moves `source` inside the extension that replaced it, and such files are
   * not exotic here: the studio wires a KTX2 decoder because it loads them. Read only at the top
   * level, every one of them answered "carries no picture of its own".
   */
  it('follows a source an extension took over', () => {
    const file = glb(
      {
        materials: [{ normalTexture: { index: 0 } }],
        textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
        images: [{ bufferView: 0, mimeType: 'image/ktx2' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: PNG.byteLength }],
      },
      PNG,
    )

    expect(embeddedTextures(file)).toMatchObject([{ mimeType: 'image/ktx2', channel: 'normal' }])
  })

  /**
   * An ORM export: one picture read as occlusion by one slot and as metal-roughness by another.
   * Labelled from whichever slot the JSON spells first, a packed map would be filed under `ao`.
   */
  it('claims no channel for a picture two slots disagree about', () => {
    const file = glb(
      {
        materials: [
          {
            occlusionTexture: { index: 0 },
            pbrMetallicRoughness: { metallicRoughnessTexture: { index: 0 } },
          },
        ],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/png' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: PNG.byteLength }],
      },
      PNG,
    )

    const found = embeddedTextures(file)
    expect(found).toHaveLength(1)
    expect(found[0]?.channel).toBeUndefined()
  })

  it('keeps the channel when every slot wearing it says the same thing', () => {
    const file = glb(
      {
        materials: [
          { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
          { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
        ],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength }],
      },
      JPEG,
    )

    expect(embeddedTextures(file)).toMatchObject([{ channel: 'baseColor' }])
  })
})

describe('embedded glb pictures', () => {
  /**
   * `mimeType` is optional for a `uri` image because the URI carries it. Defaulting to PNG there
   * wrote JPEG bytes into a file named `.png`, served afterwards as a PNG by a name the bytes do
   * not answer to.
   */
  it('believes the data URI about what it carries', () => {
    const file = glb({
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: `data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}` }],
    })

    expect(embeddedTextures(file)).toMatchObject([{ mimeType: 'image/jpeg', bytes: JPEG }])
  })

  it('reads a picture written as a data URI', () => {
    const file = glb({
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}` }],
    })

    expect(embeddedTextures(file)[0]?.bytes).toEqual(PNG)
  })

  /**
   * A path beside the `.glb` is a path the catalogue never vouched for, and reading one would
   * mean following a document into the filesystem.
   */
  it('follows no path to a file beside the model', () => {
    const file = glb({
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: '../../.ssh/id_rsa' }],
    })

    expect(embeddedTextures(file)).toEqual([])
  })

  // Asked for from a menu row: clicking a model whose bytes are not a `.glb` is normal.
  it('yields nothing rather than throwing on what is not a glb', () => {
    expect(embeddedTextures(new Uint8Array([1, 2, 3]))).toEqual([])
    expect(embeddedTextures(new Uint8Array())).toEqual([])
    expect(embeddedTextures(glb({ materials: 'not an array' }))).toEqual([])
  })

  // A download cut short: the chunk claims more than the file holds.
  it('yields nothing for a truncated file', () => {
    const whole = fileWith('baseColorTexture', JPEG)

    expect(embeddedTextures(whole.subarray(0, whole.byteLength - 6))).toEqual([])
  })
})

/**
 * Every one of these is a real shape a file off the network can have, and each has its own
 * way of being wrong. What they share is the answer: nothing extracted, nothing thrown — the
 * gesture is a menu row, and a model the studio cannot read must not take the window with it.
 */
const wrongMagic = new Uint8Array(20)

const invalidFiles: [string, Uint8Array][] = [
  ['four bytes that are not glTF', wrongMagic],
  ['a document that is not an object', glb('just a string')],
  ['a document with no material at all', glb({ textures: [{ source: 0 }] })],
  [
    'a texture pointing at no source',
    glb({ materials: [{ normalTexture: { index: 0 } }], textures: [{}] }),
  ],
  [
    'a texture that is not an object',
    glb({ materials: [{ normalTexture: { index: 0 } }], textures: ['nope'] }),
  ],
  [
    'a source no image answers for',
    glb({ materials: [{ normalTexture: { index: 0 } }], textures: [{ source: 9 }] }),
  ],
  [
    'an image that names neither a view nor a URI',
    glb({
      materials: [{ normalTexture: { index: 0 } }],
      textures: [{ source: 0 }],
      images: [{ mimeType: 'image/png' }],
    }),
  ],
  [
    'a view the document does not hold',
    glb({
      materials: [{ normalTexture: { index: 0 } }],
      textures: [{ source: 0 }],
      images: [{ bufferView: 4 }],
      bufferViews: [],
    }),
  ],
  [
    'a view claiming more bytes than the chunk carries',
    glb(
      {
        materials: [{ normalTexture: { index: 0 } }],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0 }],
        bufferViews: [{ buffer: 0, byteLength: 9_000 }],
      },
      PNG,
    ),
  ],
  [
    'a view that claims no length at all',
    glb(
      {
        materials: [{ normalTexture: { index: 0 } }],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0 }],
        bufferViews: [{ buffer: 0, byteOffset: 0 }],
      },
      PNG,
    ),
  ],
  [
    'a data URI carrying nothing readable',
    glb({
      materials: [{ normalTexture: { index: 0 } }],
      textures: [{ source: 0 }],
      images: [{ uri: 'data:image/png,not-base64-at-all' }],
    }),
  ],
]

describe('a file that is not what it claims', () => {
  for (const [what, file] of invalidFiles) {
    it(`yields nothing for ${what}`, () => {
      expect(embeddedTextures(file)).toEqual([])
    })
  }
})

describe('glb texture defaults', () => {
  // A file whose JSON chunk is missing entirely — there is nothing to read the pictures FROM.
  it('yields nothing when the document itself is absent', () => {
    const binaryOnly = new Uint8Array(20)
    new DataView(binaryOnly.buffer).setUint32(0, 0x46546c67, true)
    new DataView(binaryOnly.buffer).setUint32(12, 0, true)
    new DataView(binaryOnly.buffer).setUint32(16, 0x004e4942, true)

    expect(embeddedTextures(binaryOnly)).toEqual([])
  })

  /**
   * `byteOffset` is optional in glTF and absent means zero — the first picture of a file often
   * has none. `mimeType` is optional too, and a picture with none is written as a PNG.
   */
  it('reads a view that leans on the defaults the format allows', () => {
    const file = glb(
      {
        materials: [{ normalTexture: { index: 0 } }],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0 }],
        bufferViews: [{ buffer: 0, byteLength: PNG.byteLength }],
      },
      PNG,
    )

    expect(embeddedTextures(file)).toMatchObject([{ mimeType: 'image/png', bytes: PNG }])
  })

  it('extracts a picture even when no material wears it', () => {
    const file = glb(
      {
        materials: [{ name: 'bare' }],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/png' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: PNG.byteLength }],
      },
      PNG,
    )

    expect(embeddedTextures(file)).toMatchObject([{ slot: 'image1', bytes: PNG }])
  })
})

describe('a glb after extraction', () => {
  it('keeps geometry while removing material slots and image bytes', () => {
    const geometry = new Uint8Array([1, 2, 3, 4])
    const source = glb(
      {
        buffers: [{ byteLength: JPEG.byteLength + geometry.byteLength }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength },
          { buffer: 0, byteOffset: JPEG.byteLength, byteLength: geometry.byteLength },
        ],
        accessors: [{ bufferView: 1, componentType: 5121, count: 4, type: 'SCALAR' }],
        materials: [
          {
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
            extras: { preferredTexture: 'linen' },
          },
        ],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
      },
      new Uint8Array([...JPEG, ...geometry]),
    )

    const result = withoutEmbeddedTextures(source)
    const chunks = glbChunksOf(result)
    const json = chunks ? glbJson(chunks.json) : null

    expect(embeddedTextures(result)).toEqual([])
    expect(chunks?.bin).toEqual(geometry)
    expect(json).toMatchObject({
      buffers: [{ byteLength: geometry.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: geometry.byteLength }],
      accessors: [{ bufferView: 0 }],
      materials: [{ pbrMetallicRoughness: {}, extras: { preferredTexture: 'linen' } }],
    })
    expect(json).not.toHaveProperty('images')
    expect(json).not.toHaveProperty('textures')
  })

  it('keeps external images and remaps the material slot that uses them', () => {
    const source = glb(
      {
        materials: [
          {
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
            normalTexture: { index: 1 },
          },
        ],
        textures: [{ source: 0 }, { source: 1 }],
        images: [
          { bufferView: 0, mimeType: 'image/jpeg' },
          { uri: 'normal.png', mimeType: 'image/png' },
        ],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength }],
      },
      JPEG,
    )

    const chunks = glbChunksOf(withoutEmbeddedTextures(source))
    const json = chunks ? glbJson(chunks.json) : null

    expect(json).toMatchObject({
      images: [{ uri: 'normal.png' }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: {}, normalTexture: { index: 0 } }],
    })
  })

  it('preserves unknown container chunks byte-for-byte', () => {
    const chunks = glbChunksOf(fileWith('baseColorTexture', JPEG))
    if (!chunks) throw new Error('fixture is not a glb')
    const extra = { kind: 0x12345678, bytes: new Uint8Array([9, 8, 7, 0]) }

    const result = glbChunksOf(withoutEmbeddedTextures(glbFrom({ ...chunks, extra: [extra] })))

    expect(result?.extra).toEqual([extra])
  })

  it('removes image-based lighting references when another external image remains', () => {
    const source = glb(
      {
        materials: [
          { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 1 } },
        ],
        textures: [{ source: 0 }, { source: 1 }],
        images: [
          { bufferView: 0, mimeType: 'image/jpeg' },
          { uri: 'normal.png', mimeType: 'image/png' },
        ],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength }],
        extensions: { EXT_lights_image_based: { lights: [{ specularImages: [[0]] }] } },
        scenes: [{ extensions: { EXT_lights_image_based: { light: 0 } } }],
        extensionsUsed: ['EXT_lights_image_based'],
      },
      JPEG,
    )

    const chunks = glbChunksOf(withoutEmbeddedTextures(source))
    const json = chunks ? glbJson(chunks.json) : null

    expect(embeddedTextures(withoutEmbeddedTextures(source))).toEqual([])
    expect(json).toMatchObject({ images: [{ uri: 'normal.png' }] })
    expect(json).not.toHaveProperty('extensions.EXT_lights_image_based')
    expect(json).not.toHaveProperty('scenes.0.extensions.EXT_lights_image_based')
    expect(json).not.toHaveProperty('extensionsUsed')
  })

  it('does not mistake punctual light numbers for image indexes', () => {
    const source = glb(
      {
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength }],
        extensions: {
          KHR_lights_punctual: { lights: [{ type: 'point', intensity: 1, color: [1, 1, 1] }] },
        },
      },
      JPEG,
    )

    expect(embeddedTextures(withoutEmbeddedTextures(source))).toEqual([])
  })

  it('compacts compressed buffers while removing material images', () => {
    const binary = new Uint8Array([...JPEG, 1, 2, 3, 4])
    const source = glb(
      {
        buffers: [{ byteLength: binary.byteLength }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength },
          {
            buffer: 0,
            byteOffset: JPEG.byteLength,
            byteLength: 4,
            extensions: {
              EXT_meshopt_compression: {
                buffer: 0,
                byteOffset: JPEG.byteLength,
                byteLength: 4,
                byteStride: 1,
                count: 4,
                mode: 'ATTRIBUTES',
                filter: 'NONE',
              },
            },
          },
        ],
        accessors: [{ bufferView: 1, componentType: 5121, count: 4, type: 'SCALAR' }],
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
      },
      binary,
    )

    const chunks = glbChunksOf(withoutEmbeddedTextures(source))
    const json = chunks ? glbJson(chunks.json) : null

    expect(chunks?.bin).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(json).toMatchObject({
      bufferViews: [
        {
          byteOffset: 0,
          extensions: { EXT_meshopt_compression: { byteOffset: 0 } },
        },
      ],
      accessors: [{ bufferView: 0 }],
      buffers: [{ byteLength: 4 }],
    })
    expect(json).not.toHaveProperty('images')
    expect(json).not.toHaveProperty('textures')
  })
})
