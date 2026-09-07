import { expect, it } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { bakeOptimization } from './bakeOptimization'
import { meshNode } from './scene-fixtures'
import { EMPTY_SCENE, type SceneNode, type SceneState } from './sceneState'

it('replaces compatible authoring meshes with one explicit instance node and restores them', () => {
  const first = meshNode('first')
  const second: SceneNode = {
    ...meshNode('second'),
    transform: { ...IDENTITY_TRANSFORM, position: { x: 3, y: 0, z: 0 } },
  }
  const before = { ...EMPTY_SCENE, nodes: [first, second], selectedIds: [first.id, second.id] }
  const command = bakeOptimization([first, second])

  const after = command.apply(before)
  expect(after.nodes).toHaveLength(1)
  expect(after.nodes[0]).toMatchObject({
    type: 'mesh',
    optimization: { mode: 'exclude' },
    instances: [
      { sourceId: 'first', name: first.name },
      { sourceId: 'second', name: second.name, transform: second.transform },
    ],
  })
  expect(command.revert(after)).toBe(before)
  expect(command.apply(before)).toBe(after)
})

it('refuses incompatible, behavioral, physical, parent, and already baked meshes', () => {
  const parent = meshNode('parent')
  const nodes: SceneNode[] = [
    parent,
    { ...meshNode('child', parent.id) },
    { ...meshNode('behavior'), components: [{ type: 'Spin' }] },
    { ...meshNode('physical'), components: [{ type: 'Collider' }] },
    { ...meshNode('different'), material: { ...parent.material, color: '#000000' } },
    {
      ...meshNode('baked'),
      instances: [{ sourceId: 'old', name: 'Old', transform: IDENTITY_TRANSFORM }],
    },
  ]
  const command = bakeOptimization(nodes)

  expect(command.refuses?.({ ...EMPTY_SCENE, nodes })).toBe(true)
})

it('refuses to bake a transform driven by the timeline', () => {
  const first = meshNode('first')
  const second = meshNode('second')
  const state: SceneState = {
    ...EMPTY_SCENE,
    nodes: [first, second],
    animation: {
      ...EMPTY_SCENE.animation,
      tracks: [
        {
          id: 'track',
          name: 'Move',
          index: 0,
          muted: false,
          solo: false,
          locked: false,
          target: { nodeId: second.id, property: 'position' },
          keys: [],
        },
      ],
    },
  }

  expect(bakeOptimization([first, second]).refuses?.(state)).toBe(true)
})

// The render already leaves `individual` and `exclude` out of every group: a bake that merged
// them anyway would make one document read two opposite ways.
it('leaves out a node whose owner asked for it to stay on its own', () => {
  const first = meshNode('first')
  const spared: SceneNode = { ...meshNode('spared'), optimization: { mode: 'exclude' } }
  const before = { ...EMPTY_SCENE, nodes: [first, spared], selectedIds: ['first', 'spared'] }

  const after = bakeOptimization([first, spared]).apply(before)

  expect(after.nodes.map(node => node.id)).toEqual(['first', 'spared'])
})

it('never merges across two sockets, which would carry one body to the other', () => {
  const left: SceneNode = { ...meshNode('left'), attach: { socket: 'HandL' } }
  const right: SceneNode = { ...meshNode('right'), attach: { socket: 'HandR' } }
  const before = { ...EMPTY_SCENE, nodes: [left, right], selectedIds: ['left', 'right'] }

  const after = bakeOptimization([left, right]).apply(before)

  expect(after.nodes.map(node => node.attach?.socket)).toEqual(['HandL', 'HandR'])
})
