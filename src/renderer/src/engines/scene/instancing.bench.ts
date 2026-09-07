import { bench } from '@shared/vitestBench'
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three'
import { describe } from 'vitest'
import { meshNode } from './scene-fixtures'
import { createInstancedGroups } from './instancing'

const COUNT = 10_000
const geometry = new BoxGeometry()
const material = new MeshStandardMaterial()
const nodes = Array.from({ length: COUNT }, (_unused, index) => meshNode(`node-${index}`))
const objects = new Map(
  nodes.map((node, index) => {
    const mesh = new Mesh(geometry, material)
    mesh.name = node.id
    mesh.position.set(index * 2, 0, 0)
    mesh.updateMatrixWorld(true)
    return [node.id, mesh]
  }),
)
const host = new Object3D()
const groups = createInstancedGroups(host)
groups.rebuild(nodes, id => objects.get(id))
host.updateMatrixWorld(true)
const raycaster = new Raycaster(new Vector3(COUNT, 10, 0), new Vector3(0, -1, 0))
raycaster.layers.enableAll()
// The 10 000 nodes form ONE held group, so `editorPickable()` answers exactly `objects.values()`:
// what the editor casts against is measured by `individual source representation` below.
const sources = [...objects.values()]
const instances = [...groups.pickable()]

describe('picking among 10,000 repeated meshes', () => {
  bench('individual source representation', () => {
    void raycaster.intersectObjects(sources, false)[0]?.object.name
  })
  bench('instanced runtime representation', () => {
    const hit = raycaster.intersectObjects(instances, false)[0]
    if (hit) void groups.nodeIdOf(hit)
  })
})
