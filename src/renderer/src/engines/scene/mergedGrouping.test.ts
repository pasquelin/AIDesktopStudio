import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { meshNode, modelNodeFixture } from './scene-fixtures'
import { createMergedGroups } from './mergedGrouping'
import type { RuntimeRenderArtifact } from './grouping'
import type { SceneNode } from './sceneState'

it('merges nearby static shapes while resolving a picked face to its source UUID', () => {
  const host = new Object3D()
  const material = new MeshStandardMaterial()
  const nodes: SceneNode[] = [meshNode('first'), meshNode('second')]
  const objects = new Map<string, Mesh>([
    ['first', new Mesh(new BoxGeometry(), material)],
    ['second', new Mesh(new BoxGeometry(2, 1, 1), material)],
  ])
  objects.get('second')?.position.set(3, 0, 0)
  host.position.set(10, 0, 0)
  for (const object of objects.values()) host.add(object)
  host.updateMatrixWorld(true)
  const groups = createMergedGroups(host)

  expect(
    groups.rebuild(nodes, id => objects.get(id), undefined, [
      { key: 'props', strategy: 'merge', sourceIds: ['first', 'second'], signature: 'props' },
    ]),
  ).toBe(2)
  expect(groups.drawn()).toHaveLength(1)
  expect(groups.editorSourceCount()).toBe(0)
  host.updateMatrixWorld(true)
  const merged = groups.drawn()[0]
  if (!merged) throw new Error('missing merged mesh')
  const ray = new Raycaster()
  ray.set(new Vector3(10, 0, 10), new Vector3(0, 0, -1))
  const first = ray.intersectObject(merged)[0]
  if (!first) throw new Error('missing first hit')
  expect(groups.nodeIdOf(first)).toBe('first')
  ray.set(new Vector3(13, 0, 10), new Vector3(0, 0, -1))
  const second = ray.intersectObject(merged)[0]
  if (!second) throw new Error('missing second hit')
  expect(groups.nodeIdOf(second)).toBe('second')

  objects.get('second')?.position.set(5, 0, 0)
  objects.get('second')?.updateWorldMatrix(true, false)
  expect(groups.moved(['second'], id => objects.get(id))).toBe(true)
  host.updateMatrixWorld(true)
  ray.set(new Vector3(15, 0, 10), new Vector3(0, 0, -1))
  const moved = groups.editorPickable().flatMap(object => ray.intersectObject(object))[0]
  if (!moved) throw new Error('missing moved hit')
  expect(groups.nodeIdOf(moved)).toBe('second')
})

it('regroups a material mutated in place between two rebuilds', () => {
  const host = new Object3D()
  const first = new MeshStandardMaterial({ color: '#ffffff' })
  const second = new MeshStandardMaterial({ color: '#ffffff' })
  const nodes: SceneNode[] = [modelNodeFixture('first'), modelNodeFixture('second')]
  const objects = new Map<string, Mesh>([
    ['first', new Mesh(new BoxGeometry(), first)],
    ['second', new Mesh(new BoxGeometry(), second)],
  ])
  for (const object of objects.values()) host.add(object)
  host.updateMatrixWorld(true)
  const artifacts: readonly RuntimeRenderArtifact[] = [
    { key: 'props', strategy: 'merge', sourceIds: ['first', 'second'], signature: 'props' },
  ]
  const groups = createMergedGroups(host)

  expect(groups.rebuild(nodes, id => objects.get(id), undefined, artifacts)).toBe(2)
  second.color.set('#ff0000')

  expect(groups.rebuild(nodes, id => objects.get(id), undefined, artifacts)).toBe(0)
})
