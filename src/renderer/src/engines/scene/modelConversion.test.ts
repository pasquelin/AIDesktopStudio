// @vitest-environment jsdom
// The binary writer reads its blob through `FileReader`, which only a DOM has.
import { describe, expect, it } from 'vitest'
import { glbChunksOf } from '@shared/domain/glbContainer'
import { convertModelToGlb, type ConversionPorts } from './modelConversion'

type GltfFile = {
  meshes?: { name?: string }[]
  materials?: {
    name?: string
    pbrMetallicRoughness?: { baseColorFactor?: number[] }
  }[]
  animations?: { channels?: unknown[] }[]
  nodes?: { name?: string }[]
}

/** The JSON half of the container, which is the only half a structure test reads. */
function fileOf(glb: Uint8Array): GltfFile {
  const chunks = glbChunksOf(glb)
  if (!chunks) throw new Error('not a binary glTF')
  // `as`: the two fields read here are the ones a reader would look at.
  return JSON.parse(new TextDecoder().decode(chunks.json)) as GltfFile
}

function bytesOf(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text)
  const copy = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(copy).set(encoded)
  return copy
}

const CUBE_OBJ = [
  'mtllib robot.mtl',
  'v 0 0 0',
  'v 1 0 0',
  'v 0 1 0',
  'usemtl skin',
  'f 1 2 3',
].join('\n')

const SKIN_MTL = 'newmtl skin\nKd 0.8 0.1 0.1\n'

const WALK_BVH = [
  'HIERARCHY',
  'ROOT Hips',
  '{',
  '  OFFSET 0 0 0',
  '  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation',
  '  JOINT Spine',
  '  {',
  '    OFFSET 0 1 0',
  '    CHANNELS 3 Zrotation Xrotation Yrotation',
  '    End Site',
  '    {',
  '      OFFSET 0 1 0',
  '    }',
  '  }',
  '}',
  'MOTION',
  'Frames: 2',
  'Frame Time: 0.033333',
  '0 0 0 0 0 0 0 0 0',
  '0 1 0 10 0 0 5 0 0',
].join('\n')

const ports = (neighbours: Record<string, string> = {}): ConversionPorts => ({
  readText: async url => neighbours[url] ?? null,
  textureTimeoutMs: 200,
})

describe('convertModelToGlb', () => {
  it('folds an OBJ and the material library beside it into one binary glTF', async () => {
    const converted = await convertModelToGlb(
      bytesOf(CUBE_OBJ),
      'ia-studio://file/models/robot/.sources/',
      'mesh',
      'obj',
      ports({ 'ia-studio://file/models/robot/.sources/robot.mtl': SKIN_MTL }),
    )

    const file = fileOf(converted.glb)
    expect(file.meshes).toHaveLength(1)
    expect(file.materials?.map(material => material.name)).toEqual(['skin'])
    expect(converted.type).toBe('mesh')
    // An MTL material is Phong: carried, as an approximation the row says.
    expect(converted.losses).toEqual(['shading'])
  })

  it('says what an OBJ lost when its library is nowhere to be read', async () => {
    const converted = await convertModelToGlb(
      bytesOf(CUBE_OBJ),
      'ia-studio://file/x/',
      'mesh',
      'obj',
      ports(),
    )

    expect(converted.losses).toEqual(['materials'])
    expect(fileOf(converted.glb).meshes).toHaveLength(1)
  })

  it('parses an OBJ whose first directive follows a long comment header', async () => {
    const converted = await convertModelToGlb(
      bytesOf(`${'# licence\n'.repeat(200)}${CUBE_OBJ}`),
      'ia-studio://file/x/',
      'mesh',
      'obj',
      ports(),
    )

    expect(fileOf(converted.glb).meshes).toHaveLength(1)
  })

  it('converts an OBJ made of lines even though it contains no triangle mesh', async () => {
    const converted = await convertModelToGlb(
      bytesOf('v 0 0 0\nv 1 0 0\nl 1 2'),
      'ia-studio://file/x/',
      'mesh',
      'obj',
      ports(),
    )

    expect(fileOf(converted.glb).meshes).toHaveLength(1)
    expect(converted.type).toBe('mesh')
  })

  it('folds every material library declared on one OBJ line into the glb', async () => {
    const converted = await convertModelToGlb(
      bytesOf(
        [
          'mtllib body.mtl clothes.mtl',
          'v 0 0 0',
          'v 1 0 0',
          'v 0 1 0',
          'usemtl clothes',
          'f 1 2 3',
        ].join('\n'),
      ),
      'ia-studio://file/x/',
      'mesh',
      'obj',
      ports({
        'ia-studio://file/x/body.mtl': 'newmtl body\nKd 1 0 0\n',
        'ia-studio://file/x/clothes.mtl': 'newmtl clothes\nKd 0 1 0\n',
      }),
    )

    expect(fileOf(converted.glb).materials).toMatchObject([
      {
        name: 'clothes',
        pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] },
      },
    ])
    expect(converted.losses).toEqual(['shading'])
  })

  it('turns a BVH capture into a motion: bones and one clip, no mesh at all', async () => {
    const converted = await convertModelToGlb(
      bytesOf(WALK_BVH),
      'ia-studio://file/x/',
      'mesh',
      'bvh',
      ports(),
    )

    const file = fileOf(converted.glb)
    expect(file.meshes ?? []).toHaveLength(0)
    expect(file.animations).toHaveLength(1)
    expect(file.animations?.[0]?.channels?.length).toBeGreaterThan(0)
    expect(file.nodes?.map(node => node.name)).toEqual(expect.arrayContaining(['Hips', 'Spine']))
    expect(converted.type).toBe('animation')
    expect(converted.losses).toEqual([])
  })

  it('makes a model of a file filed as a motion that holds no clip', async () => {
    const converted = await convertModelToGlb(
      bytesOf(CUBE_OBJ),
      'ia-studio://file/x/',
      'animation',
      'obj',
      ports(),
    )

    expect(converted.type).toBe('mesh')
  })

  it('refuses what is not a 3D file, rather than writing an empty glb', async () => {
    await expect(
      convertModelToGlb(bytesOf('hello'), 'ia-studio://file/x/', 'mesh', 'obj', ports()),
    ).rejects.toThrow('not a 3D file')
  })

  it('folds a glTF JSON file into one binary container', async () => {
    const converted = await convertModelToGlb(
      bytesOf(
        JSON.stringify({
          asset: { version: '2.0' },
          scene: 0,
          scenes: [{ nodes: [0] }],
          nodes: [{ name: 'Empty' }],
        }),
      ),
      'ia-studio://file/x/',
      'mesh',
      'gltf',
      ports(),
    )

    expect(fileOf(converted.glb).nodes?.map(node => node.name)).toEqual(
      expect.arrayContaining(['Empty']),
    )
    expect(converted.type).toBe('mesh')
    expect(converted.losses).toEqual([])
  })
})
