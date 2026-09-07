import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { NO_LOSSY_OPTIMIZATION } from '@shared/domain/gameExport'
import { carvedNode, meshNode } from './nodeFactory'
import { compileLossyWorld, compileLossyWorldGeometry } from './lossyWorldCompiler'
import { csgPartOf } from '@shared/domain/csg'
import { DEFAULT_MATERIAL, type SceneNode } from './sceneState'
import type { GeometryDescriptor } from '@shared/domain/geometry'
import type { CsgGraph } from '@shared/domain/csg'
import { analyzeLossyWorld } from './worldAnalyzer'

const SPHERE = {
  kind: 'sphere',
  radius: 1,
  widthSegments: 40,
  heightSegments: 20,
} satisfies GeometryDescriptor

describe('the LOSSY world compiled for an export', () => {
  it('produces no runtime geometry while geometry losses are off', () => {
    const nodes = [meshNode(SPHERE)]
    expect(
      compileLossyWorld({ nodes }, NO_LOSSY_OPTIMIZATION, analyzeLossyWorld(nodes)),
    ).toBeUndefined()
  })

  it('reduces the exported descriptor without touching the authoring node', () => {
    const node = meshNode(SPHERE)
    const compiled = compileLossyWorld(
      { nodes: [node] },
      { ...NO_LOSSY_OPTIMIZATION, geometrySimplification: 'balanced' },
      analyzeLossyWorld([node]),
    )

    expect(compiled?.nodes[0]?.geometry).toEqual({
      ...SPHERE,
      widthSegments: 26,
      heightSegments: 13,
    })
    expect(node.type === 'mesh' && node.geometry).toEqual(SPHERE)
  })

  it('leaves an object explicitly excluded from optimization unchanged', () => {
    const node = { ...meshNode(SPHERE), optimization: { mode: 'exclude' } } satisfies SceneNode

    expect(
      compileLossyWorld(
        { nodes: [node] },
        { ...NO_LOSSY_OPTIMIZATION, geometrySimplification: 'aggressive' },
        analyzeLossyWorld([node]),
      ),
    ).toBeUndefined()
  })

  it('keeps LOD0 exact and lets the chosen level strengthen generated distant LODs', () => {
    const node = meshNode(SPHERE)
    const compiled = compileLossyWorld(
      { nodes: [node] },
      {
        ...NO_LOSSY_OPTIMIZATION,
        generateLods: true,
        geometrySimplification: 'aggressive',
      },
      analyzeLossyWorld([node]),
    )
    const lods = compiled?.nodes[0]?.lodGeometries

    expect(lods?.[0]).toBe(SPHERE)
    expect(lods?.[1]).toMatchObject({ widthSegments: 16, heightSegments: 8 })
    expect(lods?.[2]).toMatchObject({ widthSegments: 14, heightSegments: 7 })
  })

  it('reduces every primitive nested in a carved recipe', () => {
    const graph: CsgGraph = {
      base: csgPartOf('Body', SPHERE, DEFAULT_MATERIAL),
      steps: [
        {
          operation: 'subtract',
          part: csgPartOf('Hole', SPHERE, DEFAULT_MATERIAL),
        },
      ],
      collision: 'hull',
    }
    const node = carvedNode(graph)
    const compiled = compileLossyWorld(
      { nodes: [node] },
      { ...NO_LOSSY_OPTIMIZATION, geometrySimplification: 'conservative' },
      analyzeLossyWorld([node]),
    )

    expect(compiled?.nodes[0]?.carved).toMatchObject({
      base: { geometry: { widthSegments: 34, heightSegments: 17 } },
      steps: [{ part: { geometry: { widthSegments: 34, heightSegments: 17 } } }],
    })
  })

  it('keeps the recipe and stops carving as soon as one level fails', async () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([1, 2, 3]), 3))
    const node = carvedNode({
      base: csgPartOf('Body', SPHERE, DEFAULT_MATERIAL),
      steps: [],
      collision: 'hull',
    })
    let carved = 0
    const carve = async (): Promise<BufferGeometry | null> => {
      carved += 1
      return carved === 1 ? geometry : null
    }

    const compiled = await compileLossyWorldGeometry(
      { nodes: [node] },
      { ...NO_LOSSY_OPTIMIZATION, generateLods: true },
      carve,
      analyzeLossyWorld([node]),
    )

    expect(compiled?.nodes[0]?.lodCarved).toBeDefined()
    expect(compiled?.nodes[0]?.lodMeshes).toBeUndefined()
    expect(carved).toBe(2)
  })

  it('stores evaluated CSG buffers instead of recipes in an exported plan', async () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([1, 2, 3]), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0]), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0]), 2))
    geometry.setIndex(new BufferAttribute(new Uint32Array([0]), 1))
    const node = carvedNode({
      base: csgPartOf('Body', SPHERE, DEFAULT_MATERIAL),
      steps: [],
      collision: 'hull',
    })

    const compiled = await compileLossyWorldGeometry(
      { nodes: [node] },
      { ...NO_LOSSY_OPTIMIZATION, geometrySimplification: 'balanced' },
      async () => geometry,
      analyzeLossyWorld([node]),
    )

    expect(compiled?.nodes).toEqual([
      {
        nodeId: node.id,
        mesh: {
          encoding: 'float32-base64',
          position: 'AACAPwAAAEAAAEBA',
          normal: 'AAAAAAAAgD8AAAAA',
          uv: 'AAAAAAAAAAA=',
          index: 'AAA=',
          indexEncoding: 'uint16-base64',
        },
      },
    ])
  })
})
