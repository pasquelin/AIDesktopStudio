import { describe, expect, it } from 'vitest'
import { emptyHistory, run, undo } from '../core/history'
import {
  addNode,
  multi,
  removeNode,
  removeNodes,
  attachNode,
  renameNode,
  setGeometry,
  setLight,
  setMeshMaterial,
  setNodeVisible,
  setNodesOptimization,
  setSelection,
  setTransform,
} from './commands'
import { lightNodeFixture as light, meshNode as mesh, spriteNodeFixture } from './scene-fixtures'

const sprite = (id: string) => spriteNodeFixture(id, 'pic-1')
import {
  DEFAULT_MATERIAL,
  EMPTY_SCENE,
  IDENTITY_TRANSFORM,
  nodeById,
  type SceneState,
} from './sceneState'
import type { Transform } from '@shared/domain/scene'

describe('addNode', () => {
  it('appends the node and selects it', () => {
    const state = addNode(mesh('a')).apply(EMPTY_SCENE)
    expect(state.nodes.map(node => node.id)).toEqual(['a'])
    expect(state.selectedIds).toEqual(['a'])
  })

  it('drops the node and its selection on revert', () => {
    const command = addNode(mesh('a'))
    expect(command.revert(command.apply(EMPTY_SCENE))).toEqual(EMPTY_SCENE)
  })
})
describe('setNodesOptimization', () => {
  it('writes one runtime override and restores the authoring node on undo', () => {
    const original = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: ['a'] }
    const command = setNodesOptimization(original.nodes, { mode: 'exclude' })
    const changed = command.apply(original)

    expect(nodeById(changed, 'a')?.optimization).toEqual({ mode: 'exclude' })
    expect(command.revert(changed)).toEqual(original)
  })
})

describe('removeNode', () => {
  it('restores the node at its original index', () => {
    const start: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a'), mesh('b'), mesh('c')],
      selectedIds: [],
    }
    const command = removeNode('b')
    const removed = command.apply(start)
    expect(removed.nodes.map(node => node.id)).toEqual(['a', 'c'])
    expect(command.revert(removed).nodes.map(node => node.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops the removed node from the selection and leaves the rest of it standing', () => {
    const start: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a'), mesh('b')],
      selectedIds: ['a', 'b'],
    }
    expect(removeNode('a').apply(start).selectedIds).toEqual(['b'])
  })

  it('hands the anchor back to the previous node when it removes the anchor', () => {
    const start: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a'), mesh('b')],
      selectedIds: ['a', 'b'],
    }
    expect(removeNode('b').apply(start).selectedIds.at(-1)).toBe('a')
  })

  it('leaves an unknown id alone', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }
    expect(removeNode('ghost').apply(start)).toEqual(start)
  })
})

describe('setNodeVisible', () => {
  it('toggles visibility and comes back', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }
    const command = setNodeVisible('a', false)
    const hidden = command.apply(start)
    expect(hidden.nodes[0]?.visible).toBe(false)
    expect(command.revert(hidden).nodes[0]?.visible).toBe(true)
  })
})

describe('renameNode', () => {
  it('renames and comes back', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }
    const command = renameNode('a', 'Cube')
    const renamed = command.apply(start)
    expect(renamed.nodes[0]?.name).toBe('Cube')
    expect(command.revert(renamed).nodes[0]?.name).toBe('a')
  })
})

/**
 * A socket REFINES the parent, it does not replace it: the node still hangs from the character,
 * and this says which of its points to follow.
 */
describe('attachNode', () => {
  it('hangs a node on a socket, and takes it off again', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }

    const hung = attachNode('a', 'socket-hand').apply(start)

    expect(nodeById(hung, 'a')?.attach).toEqual({ socket: 'socket-hand' })
    expect(nodeById(attachNode('a', null).apply(hung), 'a')?.attach).toBeUndefined()
  })

  it('leaves the parent alone: what a socket says is WHERE on it, never on what', () => {
    const child = { ...mesh('b'), parentId: 'a' }
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a'), child], selectedIds: [] }

    const hung = attachNode('b', 'socket-hand').apply(start)

    expect(nodeById(hung, 'b')?.parentId).toBe('a')
  })
})

describe('setTransform', () => {
  it('survives being replayed through the history', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }
    const moved = { ...IDENTITY_TRANSFORM, position: { x: 1, y: 2, z: 3 } }
    const [after, history] = run(start, emptyHistory<SceneState>(), setTransform('a', moved))
    expect(after.nodes[0]?.transform.position).toEqual({ x: 1, y: 2, z: 3 })

    const [back] = undo(after, history)
    expect(back.nodes[0]?.transform.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('leaves the discriminated half of the node untouched', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }
    const moved = { ...IDENTITY_TRANSFORM, position: { x: 5, y: 0, z: 0 } }
    const after = setTransform('a', moved).apply(start)
    const node = after.nodes[0]
    expect(node?.type).toBe('mesh')
    expect(node?.type === 'mesh' && node.geometry.kind).toBe('box')
  })

  /**
   * A held axis is refused HERE and not in the panel, which is the whole of what makes it hold:
   * the viewport gizmo and the inspector both write through this command, so anywhere else would
   * have been a padlock the handle walks straight past.
   */
  describe('an axis held still', () => {
    const held: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a')],
      selectedIds: [],
      lockedAxes: [{ nodeId: 'a', channel: 'position', axis: 'y' }],
    }

    it('keeps its value while its neighbours take the move', () => {
      const after = setTransform('a', {
        ...IDENTITY_TRANSFORM,
        position: { x: 1, y: 9, z: 3 },
      }).apply(held)

      expect(after.nodes[0]?.transform.position).toEqual({ x: 1, y: 0, z: 3 })
    })

    it('holds one channel without holding the others', () => {
      const after = setTransform('a', {
        position: { x: 0, y: 9, z: 0 },
        rotation: { x: 0, y: 2, z: 0 },
        scale: { x: 4, y: 4, z: 4 },
      }).apply(held)

      expect(after.nodes[0]?.transform.rotation.y).toBe(2)
      expect(after.nodes[0]?.transform.scale.y).toBe(4)
    })

    it('holds the node it names and no other', () => {
      const two: SceneState = { ...held, nodes: [mesh('a'), mesh('b')] }
      const after = setTransform('b', {
        ...IDENTITY_TRANSFORM,
        position: { x: 0, y: 9, z: 0 },
      }).apply(two)

      expect(after.nodes[1]?.transform.position.y).toBe(9)
    })
  })

  /**
   * The defect: the viewport already refused the handle, but a typed angle still reached the
   * document — an undo entry for a screen that never moved.
   */
  describe('an angle that would show nowhere', () => {
    const turned: Transform = {
      ...IDENTITY_TRANSFORM,
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
    }

    it('is dropped off a lone sprite, and the rest of the move written', () => {
      const start: SceneState = { ...EMPTY_SCENE, nodes: [sprite('s')], selectedIds: [] }
      const after = setTransform('s', turned).apply(start)

      expect(after.nodes[0]?.transform.rotation).toEqual({ x: 0, y: 0, z: 0 })
      expect(after.nodes[0]?.transform.position).toEqual({ x: 5, y: 0, z: 0 })
    })

    it('is written on a sprite others hang from, which turning swings around it', () => {
      const start: SceneState = {
        ...EMPTY_SCENE,
        nodes: [sprite('s'), mesh('m', 's')],
        selectedIds: [],
      }
      const after = setTransform('s', turned).apply(start)

      expect(after.nodes[0]?.transform.rotation.y).toBeCloseTo(Math.PI / 2)
    })

    // The rule is read at every `apply`, never frozen when the command was built: a child added
    // between the two would otherwise keep answering for the scene the command was born in.
    it('is written on redo once a child has arrived', () => {
      const start: SceneState = { ...EMPTY_SCENE, nodes: [sprite('s')], selectedIds: [] }
      const command = setTransform('s', turned)
      command.apply(start)
      const grown = addNode(mesh('m', 's')).apply(start)

      expect(command.apply(grown).nodes[0]?.transform.rotation.y).toBeCloseTo(Math.PI / 2)
    })
  })
})

describe('setGeometry', () => {
  it('replaces the descriptor and comes back', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }
    const command = setGeometry('a', {
      kind: 'sphere',
      radius: 2,
      widthSegments: 8,
      heightSegments: 6,
    })

    const applied = command.apply(start)
    const node = applied.nodes[0]
    expect(node?.type === 'mesh' && node.geometry.kind).toBe('sphere')

    const back = command.revert(applied).nodes[0]
    expect(back?.type === 'mesh' && back.geometry.kind).toBe('box')
  })

  // A light holding a geometry is what the union exists to forbid, and it would be a document
  // that no longer loads.
  it('refuses to give a light a geometry', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [light('a')], selectedIds: [] }
    const command = setGeometry('a', {
      kind: 'sphere',
      radius: 1,
      widthSegments: 8,
      heightSegments: 6,
    })

    expect(command.apply(start)).toEqual(start)
  })
})

describe('setMeshMaterial', () => {
  it('replaces the material and comes back', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }
    const command = setMeshMaterial('a', {
      ...DEFAULT_MATERIAL,
      color: '#ff0000',
      roughness: 0.2,
      metalness: 1,
    })

    const applied = command.apply(start)
    const node = applied.nodes[0]
    expect(node?.type === 'mesh' && node.material.color).toBe('#ff0000')

    const back = command.revert(applied).nodes[0]
    expect(back?.type === 'mesh' && back.material.roughness).toBe(1)
  })

  it('leaves the geometry it did not touch alone', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }
    const command = setMeshMaterial('a', { ...DEFAULT_MATERIAL, roughness: 0.5 })

    const node = command.apply(start).nodes[0]
    expect(node?.type === 'mesh' && node.geometry.kind).toBe('box')
  })
})

describe('setLight', () => {
  it('replaces the descriptor and comes back', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [light('a')], selectedIds: [] }
    const command = setLight('a', { kind: 'ambient', color: '#ffffff', intensity: 0.5 })

    const applied = command.apply(start)
    const node = applied.nodes[0]
    expect(node?.type === 'light' && node.light.intensity).toBe(0.5)

    const back = command.revert(applied).nodes[0]
    expect(back?.type === 'light' && back.light.intensity).toBe(1)
  })

  it('refuses to give a mesh a light', () => {
    const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: [] }

    expect(setLight('a', { kind: 'ambient', color: '#ffffff', intensity: 1 }).apply(start)).toEqual(
      start,
    )
  })
})

describe('multi', () => {
  it('undoes a batch in reverse order, as one entry', () => {
    const batch = multi('batch', [addNode(mesh('a')), addNode(mesh('b'))])
    const applied = batch.apply(EMPTY_SCENE)
    expect(applied.nodes.map(node => node.id)).toEqual(['a', 'b'])
    expect(batch.revert(applied).nodes).toEqual([])
  })
})

describe('setSelection', () => {
  const start: SceneState = {
    ...EMPTY_SCENE,
    nodes: [mesh('a'), mesh('b'), mesh('c')],
    selectedIds: [],
  }

  it('stays out of the history', () => {
    expect(setSelection(start, ['a']).selectedIds).toEqual(['a'])
    expect(setSelection(start, []).selectedIds).toEqual([])
  })

  it('replaces by default', () => {
    const picked = setSelection(start, ['a', 'b'])
    expect(setSelection(picked, ['c']).selectedIds).toEqual(['c'])
  })

  it('toggles an id in and out of what is already selected', () => {
    const picked = setSelection(start, ['a', 'b'])
    expect(setSelection(picked, ['c'], 'toggle').selectedIds).toEqual(['a', 'b', 'c'])
    expect(setSelection(picked, ['b'], 'toggle').selectedIds).toEqual(['a'])
  })

  it('leaves the nodes alone', () => {
    expect(setSelection(start, ['a']).nodes).toBe(start.nodes)
  })
})

describe('removeNodes', () => {
  it('deletes a whole selection as one entry, and puts it back in order', () => {
    const start: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a'), mesh('b'), mesh('c')],
      selectedIds: ['a', 'c'],
    }
    const command = removeNodes(start.nodes, ['a', 'c'])
    const applied = command.apply(start)

    expect(applied.nodes.map(node => node.id)).toEqual(['b'])
    expect(applied.selectedIds).toEqual([])
    expect(command.revert(applied).nodes.map(node => node.id)).toEqual(['a', 'b', 'c'])
  })

  /** One sweep records where each node left from, and putting them back out of ascending order
   * lands every later one a slot off — which only a scattered subtree shows. */
  it('puts a scattered subtree back at the very indices it left', () => {
    const start: SceneState = {
      ...EMPTY_SCENE,
      // The child declared BEFORE the parent it hangs from, which reparenting makes ordinary.
      nodes: [mesh('leaf', 'branch'), mesh('keep'), mesh('branch'), mesh('other')],
      selectedIds: [],
    }
    const command = removeNodes(start.nodes, ['branch'])
    const applied = command.apply(start)

    expect(applied.nodes.map(node => node.id)).toEqual(['keep', 'other'])
    expect(command.revert(applied).nodes.map(node => node.id)).toEqual([
      'leaf',
      'keep',
      'branch',
      'other',
    ])
  })

  /**
   * What `multi` of one command per node gave for free, and the single sweep took away: a delete
   * that reaches nothing must not push an entry. Otherwise ⌘Z gains a step doing nothing, and the
   * redo stack is cleared for an edit that never happened.
   */
  it('refuses a delete that reaches no node at all', () => {
    const nodes = [mesh('a')]

    expect(removeNodes(nodes, []).refuses?.({ ...EMPTY_SCENE, nodes })).toBe(true)
    expect(removeNodes(nodes, ['nowhere']).refuses?.({ ...EMPTY_SCENE, nodes })).toBe(true)
    expect(removeNodes(nodes, ['a']).refuses?.({ ...EMPTY_SCENE, nodes })).toBe(false)
  })

  /** `applySelection` hands the same array back when nothing changed, and everything watching
   * the selection re-renders on a fresh one — see `helpers/selection`. */
  it('leaves the selection untouched, by reference, when nothing selected is deleted', () => {
    const nodes = [mesh('a'), mesh('b')]
    const start: SceneState = { ...EMPTY_SCENE, nodes, selectedIds: ['b'] }

    expect(removeNodes(nodes, ['a']).apply(start).selectedIds).toBe(start.selectedIds)
  })
})
