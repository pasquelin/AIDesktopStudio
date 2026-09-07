import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { SceneRenderer } from './SceneRenderer'
import { directionalLight, gltfNodesOf, meshNode } from './scene-fixtures'
import { EMPTY_SCENE, type SceneNode, type SceneState } from './sceneState'

/**
 * A file lists the nodes in the order the DOCUMENT holds them, whatever order the engine built
 * its objects in. A node removed and restored is the newest object of the engine, and the export
 * used to list it last — `b0 b1 b2 b4 b3` where a scene never edited gave `b0 b1 b2 b3 b4`, a
 * noisy diff on every undo for whoever versions their scenes. Found by the floor report of the
 * instancing chantier, older than both the floor and the dirty sets.
 */

const rendererOf = (): SceneRenderer =>
  new SceneRenderer({
    onSelect: () => {},
    onTransform: () => {},
    loadModel: async () => new Group(),
  })

const sceneOf = (nodes: SceneNode[]): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [directionalLight('sun'), ...nodes],
})

const namesOf = async (renderer: SceneRenderer): Promise<string[]> =>
  (await gltfNodesOf(renderer)).flatMap(node => node.name ?? [])

/** The children of the named node, by name, in the order the file lists them. */
const childrenOf = async (renderer: SceneRenderer, name: string): Promise<string[]> => {
  const nodes = await gltfNodesOf(renderer)
  const parent = nodes.find(node => node.name === name)
  return (parent?.children ?? []).flatMap(index => nodes[index]?.name ?? [])
}

const restored = (settled: SceneState, id: string): SceneRenderer => {
  const renderer = rendererOf()
  renderer.apply(settled)
  renderer.apply({ ...settled, nodes: settled.nodes.filter(node => node.id !== id) })
  renderer.apply(settled)
  return renderer
}

describe('the order an export lists the nodes in', () => {
  it('is the document order, even for a body removed and restored', async () => {
    const settled = sceneOf(['b0', 'b1', 'b2', 'b3', 'b4'].map(id => meshNode(id)))

    const straight = rendererOf()
    straight.apply(settled)

    expect(await namesOf(restored(settled, 'b3'))).toEqual(await namesOf(straight))
  })

  it('holds under a parent too, for a child removed and restored', async () => {
    const settled = sceneOf([
      meshNode('parent'),
      ...['c0', 'c1', 'c2', 'c3'].map(id => meshNode(id, 'parent')),
    ])

    expect(await childrenOf(restored(settled, 'c1'), 'parent')).toEqual(['c0', 'c1', 'c2', 'c3'])
  })

  it('is the document order for a selection too, not the order it was clicked in', async () => {
    const nodes = ['b0', 'b1', 'b2', 'b3'].map(id => meshNode(id))
    const renderer = rendererOf()
    // Clicked back to front: what a file lists is what the document holds, never what a hand did.
    renderer.apply({ ...sceneOf(nodes), selectedIds: ['b3', 'b1'] })

    const file = new TextDecoder().decode(await renderer.exportTo('gltf', 'selection'))
    // `as`: a `.gltf` file holds glTF, and `nodes` is the field this reads.
    const listed = (JSON.parse(file) as { nodes?: { name?: string }[] }).nodes ?? []

    expect(listed.flatMap(node => node.name ?? [])).toEqual(['b1', 'b3'])
  })
})
