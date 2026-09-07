import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { glbFile } from './glb-fixtures'
import type { WriteRequest } from './localBackend'
import { createTextureExtraction } from './textureExtraction'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const folders: string[] = []

afterEach(async () => {
  await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true })))
})

describe('resuming model texture extraction', () => {
  it('retains every material use after the model has already lost its embedded images', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-extraction-'))
    folders.push(folder)
    const path = join(folder, 'model.glb')
    await writeFile(path, modelFile())
    const pictures: Asset[] = []
    const source: Asset = {
      id: 'model',
      name: 'Model',
      type: 'mesh',
      location: 'local',
      tags: [],
      createdAt: '2026-09-04',
    }
    const write = async (request: WriteRequest): Promise<Asset> => {
      const picture: Asset = {
        id: request.id,
        name: request.name,
        type: request.type,
        location: 'local',
        tags: [],
        createdAt: '2026-09-04',
        derivedFrom: request.derivedFrom,
        outputIndex: request.outputIndex,
        map: request.map,
        packedSlot: request.packedSlot,
        modelTextureUses: request.modelTextureUses,
      }
      pictures.push(picture)
      return picture
    }
    const deps = {
      fileOf: () => path,
      search: async () => pictures,
      write: async (request: WriteRequest, _bytes: Uint8Array) => write(request),
      replaceModel: async (_asset: Asset, bytes: Uint8Array) => writeFile(path, bytes),
      newAssetId: () => `picture-${pictures.length}`,
      record: () => {},
    }
    const extraction = createTextureExtraction({ ...deps, write })

    await extraction(source)
    expect((await readFile(path)).byteLength).toBe(modelFile().byteLength)
    const finalized = { ...source, modelMaterialIds: ['material-a', 'material-b'] }
    const resumed = await createTextureExtraction({ ...deps, write })(finalized)

    expect((await readFile(path)).byteLength).toBeLessThan(modelFile().byteLength)
    expect(resumed).toHaveLength(2)
    expect(resumed[0]?.modelTextureUses?.[0]).toMatchObject({
      materialIndex: 0,
      materialName: 'Shell',
      channel: 'baseColor',
    })
    expect(resumed[1]?.modelTextureUses?.[0]).toMatchObject({
      materialIndex: 1,
      materialName: 'Joints',
      channel: 'normal',
    })
  })
})

function modelFile(): Uint8Array {
  return glbFile(
    {
      materials: [
        { name: 'Shell', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
        { name: 'Joints', normalTexture: { index: 1 } },
      ],
      textures: [{ source: 0 }, { source: 1 }],
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
