import { describe, expect, it } from 'vitest'
import { gltfProposesScene, materialDefOf, textureSlotsOf } from './gltf'

describe('the textures a glTF material asks to wear', () => {
  it('finds the slots of the core specification, however deep they sit', () => {
    const material = {
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicRoughnessTexture: { index: 1 },
      },
      normalTexture: { index: 2, scale: 1 },
      occlusionTexture: { index: 3 },
      emissiveTexture: { index: 4 },
    }

    expect(textureSlotsOf(material)).toEqual([
      { slot: 'baseColorTexture', index: 0 },
      { slot: 'metallicRoughnessTexture', index: 1 },
      { slot: 'normalTexture', index: 2 },
      { slot: 'occlusionTexture', index: 3 },
      { slot: 'emissiveTexture', index: 4 },
    ])
  })

  /**
   * Matched by shape rather than against a list of names, which is the whole point: an extension
   * spells its slots the same way, and a hand-written list would silently miss every one of them.
   */
  it("finds an extension's slots without having heard of the extension", () => {
    const material = {
      extensions: {
        KHR_materials_clearcoat: { clearcoatTexture: { index: 7 } },
        KHR_materials_sheen: { sheenColorTexture: { index: 8 } },
      },
    }

    expect(textureSlotsOf(material)).toEqual([
      { slot: 'clearcoatTexture', index: 7 },
      { slot: 'sheenColorTexture', index: 8 },
    ])
  })

  // A definition comes from a file: nothing about its shape is owed to the reader.
  it('reads anything at all without throwing', () => {
    expect(textureSlotsOf(null)).toEqual([])
    expect(textureSlotsOf('not a material')).toEqual([])
    expect(textureSlotsOf({ normalTexture: 'not an object' })).toEqual([])
    expect(textureSlotsOf({ normalTexture: { index: 'not a number' } })).toEqual([])
  })

  // A key that merely ends in the word is not a slot unless it carries an index.
  it('takes nothing from a slot with no index in it', () => {
    expect(textureSlotsOf({ baseColorTexture: { texCoord: 1 } })).toEqual([])
  })
})

describe('the material a glTF document holds at an index', () => {
  it('hands it back', () => {
    const json = { materials: [{ name: 'first' }, { name: 'second' }] }

    expect(materialDefOf(json, 1)).toEqual({ name: 'second' })
  })

  it('hands back nothing rather than throwing on a document that has none', () => {
    expect(materialDefOf({}, 0)).toBeUndefined()
    expect(materialDefOf({ materials: 'not an array' }, 0)).toBeUndefined()
    expect(materialDefOf(null, 0)).toBeUndefined()
    expect(materialDefOf({ materials: [] }, 3)).toBeUndefined()
  })
})

describe('what a glTF proposes to be opened as', () => {
  // §2.6, case 2: a mesh alone, framed and lit by nothing, is a model.
  it('proposes a model for a bare mesh', () => {
    expect(gltfProposesScene(JSON.stringify({ asset: { version: '2.0' }, meshes: [] }))).toBe(false)
  })

  it('proposes a scene for a file that frames itself', () => {
    const head = JSON.stringify({ asset: { version: '2.0' }, cameras: [{ type: 'perspective' }] })

    expect(gltfProposesScene(head)).toBe(true)
  })

  it('proposes a scene for a file that lights itself', () => {
    const head = JSON.stringify({
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_lights_punctual'],
    })

    expect(gltfProposesScene(head)).toBe(true)
  })

  // An indented file is the same file: an exporter that pretty-prints must not change the answer.
  it('reads an indented file as it reads a compact one', () => {
    const head = JSON.stringify({ asset: { version: '2.0' }, cameras: [{}] }, null, 2)

    expect(gltfProposesScene(head)).toBe(true)
  })

  // The empty list is what an exporter writes when it carried none: it frames nothing.
  it('takes an empty camera list for what it is', () => {
    expect(gltfProposesScene(JSON.stringify({ asset: { version: '2.0' }, cameras: [] }))).toBe(
      false,
    )
  })
})
