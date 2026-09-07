import { bench } from '@shared/vitestBench'
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  SphereGeometry,
  Vector3,
} from 'three'
import { describe } from 'vitest'
import { createBatchedGroups } from './batching'
import { createInstancedGroups } from './instancing'
import { meshNode } from './scene-fixtures'

const COUNT = 10_000
const box = new BoxGeometry()
const sphere = new SphereGeometry(0.5, 8, 6)
const material = new MeshStandardMaterial()
const nodes = Array.from({ length: COUNT }, (_unused, index) => meshNode(`node-${index}`))
const objects = new Map(
  nodes.map((node, index) => {
    const mesh = new Mesh(index % 2 === 0 ? box : sphere, material)
    mesh.name = node.id
    mesh.position.set(index * 2, 0, 0)
    mesh.updateMatrixWorld(true)
    return [node.id, mesh]
  }),
)
const batched = createBatchedGroups(new Object3D())
const instanced = createInstancedGroups(new Object3D())
batched.rebuild(nodes, id => objects.get(id))
instanced.rebuild(nodes, id => objects.get(id))
const raycaster = new Raycaster(new Vector3(COUNT, 10, 0), new Vector3(0, -1, 0))
raycaster.layers.enableAll()
const sources = [...objects.values()]
const instances = [...instanced.pickable()]
const batches = [...batched.pickable()]
// Both shapes are held, so `editorPickable()` answers exactly `objects.values()` — the editor's
// own cost is `individual source representation` below, not a bench of its own.

describe('picking among 10,000 compatible static meshes of two shapes', () => {
  bench('individual source representation', () => {
    void raycaster.intersectObjects(sources, false)[0]?.object.name
  })
  bench('instanced runtime representation', () => {
    const hit = raycaster.intersectObjects(instances, false)[0]
    if (hit) void instanced.nodeIdOf(hit)
  })
  bench('batched runtime representation', () => {
    const hit = raycaster.intersectObjects(batches, false)[0]
    if (hit) void batched.nodeIdOf(hit)
  })
})
