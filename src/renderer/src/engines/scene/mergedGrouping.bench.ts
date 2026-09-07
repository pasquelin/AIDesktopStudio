import { bench } from '@shared/vitestBench'
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three'
import { describe } from 'vitest'
import { createMergedGroups } from './mergedGrouping'
import { meshNode } from './scene-fixtures'
import type { RuntimeRenderArtifact } from './grouping'
import type { SceneNode } from './sceneState'

const COUNT = 8
const material = new MeshStandardMaterial()
const nodes: SceneNode[] = Array.from({ length: COUNT }, (_unused, index) => ({
  ...meshNode(`node-${index}`),
  geometry: { kind: 'box', width: index + 1, height: 1, depth: 1 },
}))
const sources = nodes.map((node, index) => {
  const mesh = new Mesh(new BoxGeometry(index + 1, 1, 1), material)
  mesh.position.set(index * 12, 0, 0)
  mesh.updateMatrixWorld(true)
  return [node.id, mesh] satisfies [string, Mesh]
})
const objects = new Map(sources)
const artifact: RuntimeRenderArtifact = {
  key: 'props',
  strategy: 'merge',
  sourceIds: nodes.map(node => node.id),
  signature: 'props',
}
const groups = createMergedGroups(new Object3D())
groups.rebuild(nodes, id => objects.get(id), undefined, [artifact])
const raycaster = new Raycaster(new Vector3(0, 0, 10), new Vector3(0, 0, -1))

describe('picking among eight nearby static meshes', () => {
  bench('individual source representation', () => {
    void raycaster.intersectObjects([...objects.values()], false)[0]?.object.name
  })

  bench('merged runtime representation', () => {
    const hit = raycaster.intersectObjects([...groups.pickable()], false)[0]
    if (hit) void groups.nodeIdOf(hit)
  })
})
