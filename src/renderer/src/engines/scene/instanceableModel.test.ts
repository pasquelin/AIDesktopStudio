import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  VectorKeyframeTrack,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { instanceableOf, isInstanceable } from './instanceableModel'
import { SceneRenderer } from './SceneRenderer'
import { meshNode, modelNodeFixture } from './scene-fixtures'
import type { RigStatus } from './rigState'
import { EMPTY_SCENE, type ModelNode } from './sceneState'

function staticTree(): Object3D {
  const root = new Object3D()
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  return root
}

function skinnedTree(): Object3D {
  const bone = new Bone()
  bone.name = 'chassis'
  const mesh = new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial())
  mesh.add(bone)
  mesh.bind(new Skeleton([bone]))
  const root = new Object3D()
  root.add(mesh)
  return root
}

const STATIC: { status: RigStatus } = { status: 'staticMesh' }
const SKINNED: { status: RigStatus } = { status: 'skinnedMesh' }

function dressed(node: ModelNode): ModelNode {
  return { ...node, model: { ...node.model, dress: { kind: 'image', assetId: 'pic-1' } } }
}

/** `as`: the engine keeps the scene private, and the marker lives on the holder it hung. */
const holderOf = (renderer: SceneRenderer, id: string): Object3D => {
  const scene = (renderer as unknown as { viewport: { scene: Object3D } }).viewport.scene
  const holder = scene.getObjectByName(id)
  if (!holder) throw new Error(`no holder named ${id}`)
  return holder
}

describe('instanceableOf', () => {
  const node = modelNodeFixture('tree')

  it('accepts a static mesh with no dress and no clips', () => {
    expect(instanceableOf(node, STATIC, [])).toBe(true)
  })

  it('refuses a static mesh that wears a dress', () => {
    expect(instanceableOf(dressed(node), STATIC, [])).toBe(false)
  })

  it('refuses a skinned mesh, dress or not', () => {
    expect(instanceableOf(node, SKINNED, [])).toBe(false)
    expect(instanceableOf(dressed(node), SKINNED, [])).toBe(false)
  })

  it('refuses a static mesh whose file already carries a clip', () => {
    const clip = new AnimationClip('spin', 1, [
      new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ])
    expect(instanceableOf(node, STATIC, [clip])).toBe(false)
  })

  it('refuses a node that is not a model', () => {
    expect(instanceableOf(meshNode('box'), STATIC, [])).toBe(false)
  })
})

describe('the marker buildModel leaves on a holder', () => {
  const rendererOf = (load: () => Object3D, node: ModelNode) => {
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: async () => load(),
    })
    renderer.apply({ ...EMPTY_SCENE, nodes: [node] })
    return renderer
  }

  it('marks a static mesh with no dress as instanceable', async () => {
    const renderer = rendererOf(staticTree, modelNodeFixture('tree'))
    await vi.waitFor(() => expect(isInstanceable(holderOf(renderer, 'tree'))).toBe(true))
    renderer.dispose()
  })

  it('does not mark a static mesh that wears a dress', async () => {
    const renderer = rendererOf(staticTree, dressed(modelNodeFixture('tree')))
    await vi.waitFor(() => expect(holderOf(renderer, 'tree').children.length).toBeGreaterThan(0))
    expect(isInstanceable(holderOf(renderer, 'tree'))).toBe(false)
    renderer.dispose()
  })

  it('does not mark a skinned mesh', async () => {
    const renderer = rendererOf(skinnedTree, modelNodeFixture('creature'))
    await vi.waitFor(() =>
      expect(holderOf(renderer, 'creature').children.length).toBeGreaterThan(0),
    )
    expect(isInstanceable(holderOf(renderer, 'creature'))).toBe(false)
    renderer.dispose()
  })
})
