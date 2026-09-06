import { describe, expect, it } from 'vitest'
import { glbFrom } from '@shared/domain/glbContainer'
import { gltfDocumentOf } from '@/engines/scene/gltfDocument'
import { playerModuleNodes } from '@/engines/scene/nodeFactory'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { sceneFromModuleFile } from './sceneFromModuleFile'

const ASSET = 'asset_hero'

const glbOf = (gltf: unknown): Uint8Array =>
  glbFrom({ json: new TextEncoder().encode(JSON.stringify(gltf)), bin: new Uint8Array() })

describe('reading a player module from its file', () => {
  it('shows a binary glTF as the character that file is', () => {
    const scene = sceneFromModuleFile(glbOf({ asset: { version: '2.0' } }), ASSET)
    const node = scene.nodes[0]

    expect(scene.nodes).toHaveLength(1)
    expect(node?.type).toBe('model')
    expect(node?.type === 'model' ? node.model.assetId : null).toBe(ASSET)
  })

  it('shows a filed module as the nodes that file holds', () => {
    const written = gltfDocumentOf(
      { ...EMPTY_SCENE, nodes: [...playerModuleNodes()] },
      { documentId: 'doc-1', documentKind: 'scene' },
    )
    const scene = sceneFromModuleFile(new TextEncoder().encode(JSON.stringify(written)), ASSET)

    expect(scene.nodes.map(node => node.name)).toEqual(
      expect.arrayContaining(['Player_Module', 'Capsule', 'SpringArm', 'Camera']),
    )
  })

  it('refuses bytes that are neither a container nor JSON', () => {
    expect(() => sceneFromModuleFile(new TextEncoder().encode('not a module'), ASSET)).toThrow()
  })
})
