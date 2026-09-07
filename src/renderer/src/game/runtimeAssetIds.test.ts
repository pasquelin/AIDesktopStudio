import { describe, expect, it } from 'vitest'
import {
  reliefLayer,
  scatterLayer,
  type GeometryDescriptor,
  type OptimizationSettings,
} from '@shared/domain/scene'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'
import { meshNode, modelNode, spriteNode } from '@/engines/scene/nodeFactory'
import { assetClip, clipLane } from '@shared/domain/scene'
import { runtimeAssetIds, runtimeModelAssetIds, runtimeTextureAssetIds } from './runtimeAssetIds'

describe('assets reachable from an exported runtime', () => {
  it('keeps only assets the standalone runtime reads, once in first-use order', () => {
    const box: GeometryDescriptor = { kind: 'box', width: 1, height: 1, depth: 1 }
    const textured = meshNode(box)
    if (textured.type !== 'mesh') throw new Error('expected a mesh')
    const material = {
      ...textured.material,
      map: { assetId: 'shared' },
      normalMap: { assetId: 'normal' },
    }
    const model = modelNode('model', 'Model')
    const plainSprite = spriteNode()
    if (plainSprite.type !== 'sprite') throw new Error('expected a sprite')
    const sprite = { ...plainSprite, sprite: { ...plainSprite.sprite, map: { assetId: 'shared' } } }

    const state: SceneState = {
      ...EMPTY_SCENE,
      nodes: [{ ...textured, material }, model, sprite],
      world: {
        ...EMPTY_SCENE.world,
        environment: { kind: 'skybox', assetId: 'unused-sky' },
        layers: [reliefLayer({ assetId: 'height' }, { id: 'terrain' })],
      },
      animation: {
        ...EMPTY_TIMELINE,
        audio: [{ id: 'audio', assetId: 'sound', start: 0, duration: 1 }],
        video: [{ id: 'video', assetId: 'movie', start: 0, duration: 1 }],
      },
    }

    expect(runtimeAssetIds(state)).toEqual([
      'shared',
      'normal',
      'model',
      'height',
      'sound',
      'movie',
    ])
  })

  it('packages scatter prop assets the same way it packages a heightmap', () => {
    const state: SceneState = {
      ...EMPTY_SCENE,
      world: {
        ...EMPTY_SCENE.world,
        layers: [
          reliefLayer({ assetId: 'height' }, { id: 'terrain' }),
          scatterLayer({
            id: 'trees',
            assets: [
              { assetId: 'pine', weight: 2 },
              { assetId: 'oak', weight: 1 },
            ],
          }),
        ],
      },
    }

    expect(runtimeAssetIds(state)).toEqual(['height', 'pine', 'oak'])
  })

  it('packages project animation clips and protects a texture used by an excluded node', () => {
    const geometry: GeometryDescriptor = { kind: 'box', width: 1, height: 1, depth: 1 }
    const first = meshNode(geometry)
    const second = meshNode(geometry)
    const model = modelNode('model', 'Model')
    if (first.type !== 'mesh' || second.type !== 'mesh' || model.type !== 'model')
      throw new Error('expected render nodes')
    const material = { ...first.material, map: { assetId: 'shared' } }
    const state = {
      ...EMPTY_SCENE,
      nodes: [
        { ...first, material },
        { ...second, material, optimization: { mode: 'exclude' } satisfies OptimizationSettings },
        {
          ...model,
          model: {
            ...model.model,
            lanes: [clipLane('main', [assetClip('walk', 'animation', 'Walk')])],
          },
        },
      ],
    }

    expect(runtimeAssetIds(state)).toContain('animation')
    expect(runtimeTextureAssetIds(state.nodes)).toEqual([])
  })

  it('protects a model asset one excluded node uses, wherever else it is used', () => {
    const shared = modelNode('model', 'Model')
    const other = modelNode('other', 'Other')
    if (shared.type !== 'model') throw new Error('expected a model')

    expect(
      runtimeModelAssetIds([shared, { ...shared, optimization: { mode: 'exclude' } }, other]),
    ).toEqual(['other'])
  })
})
