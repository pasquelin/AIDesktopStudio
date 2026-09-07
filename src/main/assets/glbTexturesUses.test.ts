import { describe, expect, it } from 'vitest'
import { glbFile } from './glb-fixtures'
import { embeddedTextures } from './glbTextures'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

describe('extracted glb material uses', () => {
  it('keeps each image tied to its source material and PBR factors', () => {
    const found = embeddedTextures(fileWithMaterialUses())
    expect(found[0]?.uses).toMatchObject([
      {
        materialIndex: 0,
        materialName: 'Shell',
        channel: 'baseColor',
        sampling: {
          channel: 1,
          wrapS: 33648,
          wrapT: 33071,
          minFilter: 9728,
          magFilter: 9728,
        },
        settings: {
          color: '#808080',
          metalness: 0.25,
          roughness: 0.75,
          tiling: { x: 2, y: 3 },
          offset: { x: 0.25, y: 0.5 },
          rotation: 0.4,
        },
      },
    ])
    expect(found[1]?.uses).toMatchObject([{ materialIndex: 1, materialName: 'Joints' }])
  })
})

function fileWithMaterialUses(): Uint8Array {
  return glbFile(
    {
      materials: [
        {
          name: 'Shell',
          pbrMetallicRoughness: {
            baseColorTexture: {
              index: 0,
              texCoord: 0,
              extensions: {
                KHR_texture_transform: {
                  offset: [0.25, 0.5],
                  scale: [2, 3],
                  rotation: 0.4,
                  texCoord: 1,
                },
              },
            },
            baseColorFactor: [0.21586, 0.21586, 0.21586, 1],
            metallicFactor: 0.25,
            roughnessFactor: 0.75,
          },
        },
        {
          name: 'Joints',
          pbrMetallicRoughness: { baseColorTexture: { index: 1 }, metallicFactor: 1 },
        },
      ],
      textures: [{ source: 0, sampler: 0 }, { source: 1 }],
      samplers: [{ wrapS: 33648, wrapT: 33071, minFilter: 9728, magFilter: 9728 }],
      images: [
        { bufferView: 0, mimeType: 'image/jpeg' },
        { bufferView: 1, mimeType: 'image/jpeg' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength },
        { buffer: 0, byteOffset: JPEG.byteLength, byteLength: JPEG.byteLength },
      ],
    },
    new Uint8Array([...JPEG, ...JPEG]),
  )
}
