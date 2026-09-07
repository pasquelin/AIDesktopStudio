import { describe, expect, it } from 'vitest'
import { emptyHistory, run, undo } from '../core/history'
import {
  addNodes,
  copiesOf,
  groupNodes,
  moveNodes,
  reparentNode,
  reorderNodes,
  rootedIn,
  setCameraOn,
  setLightOn,
  setSpriteOn,
  setTransform,
} from './commands'
import {
  cameraNodeFixture as camera,
  lightNodeFixture as light,
  meshNode as mesh,
  spriteNodeFixture,
} from './scene-fixtures'

const sprite = (id: string) => spriteNodeFixture(id, 'pic-1')
import { EMPTY_SCENE, IDENTITY_TRANSFORM, nodeById, type SceneState } from './sceneState'

describe('copiesOf', () => {
  it('keeps the picked order, so the copy of the anchor is the anchor', () => {
    const nodes = [mesh('a'), mesh('b')]
    const picked = [nodes[1], nodes[0]].filter(node => node !== undefined)

    expect(copiesOf(nodes, picked).map(copy => copy.name)).toEqual(['b', 'a'])
  })
})

describe('moveNodes', () => {
  it('carries one drag of several nodes as one entry', () => {
    const start: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a'), mesh('b')],
      selectedIds: ['a', 'b'],
    }
    const moved = { ...IDENTITY_TRANSFORM, position: { x: 1, y: 2, z: 3 } }
    const command = moveNodes([
      { id: 'a', transform: moved },
      { id: 'b', transform: moved },
    ])

    const applied = command.apply(start)
    expect(applied.nodes.map(node => node.transform.position.x)).toEqual([1, 1])
    expect(command.revert(applied).nodes.map(node => node.transform.position.x)).toEqual([0, 0])
  })

  it('keeps the id a single move would have had, so a gesture still coalesces', () => {
    expect(moveNodes([{ id: 'a', transform: IDENTITY_TRANSFORM }]).id).toBe(
      setTransform('a', IDENTITY_TRANSFORM).id,
    )
  })
})

describe('setCameraOn', () => {
  const start: SceneState = {
    ...EMPTY_SCENE,
    nodes: [camera('a'), camera('b', { fov: 20 }), mesh('box')],
    selectedIds: ['a', 'b'],
  }

  it('writes the lens onto every selected camera, and undoes each one', () => {
    const command = setCameraOn(start.nodes, 'fov', 90)
    const applied = command.apply(start)

    const lenses = applied.nodes.map(node => (node.type === 'camera' ? node.camera.fov : null))
    expect(lenses).toEqual([90, 90, null])
    expect(command.revert(applied)).toEqual(start)
  })

  it('leaves a node of another type alone', () => {
    const applied = setCameraOn(start.nodes, 'fov', 90).apply(start)
    expect(applied.nodes[2]).toBe(start.nodes[2])
  })
})

describe('setLightOn', () => {
  const spot = (id: string, target: { x: number; y: number; z: number }): SceneState['nodes'][0] =>
    light(id, {
      kind: 'spot',
      color: '#ffffff',
      intensity: 1,
      distance: 0,
      angle: 0.3,
      penumbra: 0,
      decay: 2,
      target,
    })

  // A vector field reports all three axes though the user moved one.
  it('carries only the axis that moved onto the other lights', () => {
    const anchor = spot('a', { x: 0, y: 0, z: 0 })
    const other = spot('b', { x: 5, y: 6, z: 7 })
    const start: SceneState = { ...EMPTY_SCENE, nodes: [anchor, other], selectedIds: ['b', 'a'] }
    if (anchor.type !== 'light') throw new Error('fixture is not a light')

    const applied = setLightOn(start.nodes, anchor.light, 'target', { x: 0, y: 9, z: 0 }).apply(
      start,
    )

    const moved = applied.nodes[1]
    expect(moved?.type === 'light' && moved.light.kind === 'spot' && moved.light.target).toEqual({
      x: 5,
      y: 9,
      z: 7,
    })
  })

  it('leaves a light of another kind alone', () => {
    const anchor = spot('a', { x: 0, y: 0, z: 0 })
    const ambient = light('b')
    const start: SceneState = { ...EMPTY_SCENE, nodes: [anchor, ambient], selectedIds: ['b', 'a'] }
    if (anchor.type !== 'light') throw new Error('fixture is not a light')

    expect(setLightOn(start.nodes, anchor.light, 'intensity', 4).apply(start).nodes[1]).toBe(
      ambient,
    )
  })
})

describe('reorderNodes', () => {
  // The outliner reads a level off the order of `nodes`: `a`, `b`, then `c` inside `b`.
  const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a'), mesh('b'), mesh('c', 'b')] }
  const order = (state: SceneState, parentId: string | null = null): string[] =>
    state.nodes.filter(node => node.parentId === parentId).map(node => node.id)

  it('moves a node down its own level, and puts it back', () => {
    const command = reorderNodes(['a'], null, 1)
    const moved = command.apply(start)

    expect(order(moved)).toEqual(['b', 'a'])
    expect(order(command.revert(moved))).toEqual(['a', 'b'])
  })

  it('moves a node up its own level', () => {
    expect(order(reorderNodes(['b'], null, 0).apply(start))).toEqual(['b', 'a'])
  })

  // The other half of the gesture: a row dropped between two rows of ANOTHER level changes both
  // where it hangs and where it sits.
  it('lands in another level at the place asked for', () => {
    const moved = reorderNodes(['a'], 'b', 0).apply(start)

    expect(order(moved, 'b')).toEqual(['a', 'c'])
    expect(order(moved)).toEqual(['b'])
  })

  it('takes a node back out of the group holding it', () => {
    const moved = reorderNodes(['c'], null, 0).apply(start)

    expect(order(moved)).toEqual(['c', 'a', 'b'])
    expect(order(moved, 'b')).toEqual([])
  })

  // Applied, it would close the tree on itself and every walk of it would run forever.
  it('refuses a move under its own descendant, and leaves the scene untouched', () => {
    expect(reorderNodes(['b'], 'c', 0).apply(start)).toBe(start)
  })

  it('leaves an unknown node alone', () => {
    expect(reorderNodes(['ghost'], null, 0).apply(start)).toBe(start)
  })

  /**
   * A parent ahead of its own children is the one property the rest of the engine reads the flat
   * array for. The case that breaks it is a GROUP dragged past its own children, which needs a
   * fourth node to be aimed at — `b` holds `c`, and `d` is the row it lands after.
   */
  it('carries what hangs from a group when the group moves past it', () => {
    const held: SceneState = { ...start, nodes: [...start.nodes, mesh('d')] }
    const moved = reorderNodes(['b'], null, 2).apply(held)
    const ids = moved.nodes.map(node => node.id)

    expect(order(moved)).toEqual(['a', 'd', 'b'])
    expect(order(moved, 'b')).toEqual(['c'])
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'))
  })

  /**
   * 🛑 The case a command PER MEMBER gets wrong, and it is the everyday one: two rows already in
   * the receiving level, dragged past a row that sits between them. `index` counts the level once
   * BOTH have left it, so a member still in place must not be counted as a sibling by the other —
   * measured before this was one command: they landed two apart.
   */
  it('lands a batch contiguous, even at the end of the level it came from', () => {
    const five: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a'), mesh('b'), mesh('c'), mesh('d'), mesh('e')],
    }
    const command = reorderNodes(['a', 'c'], null, 3)
    const moved = command.apply(five)

    expect(order(moved)).toEqual(['b', 'd', 'e', 'a', 'c'])
    expect(order(command.revert(moved))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('carries the whole batch into another level, in the order given', () => {
    const moved = reorderNodes(['a', 'c'], 'b', 0).apply(start)

    expect(order(moved, 'b')).toEqual(['a', 'c'])
    expect(order(moved)).toEqual(['b'])
  })

  // It already travels inside the member carrying it, and taking it twice would put it in the
  // flat array twice.
  it('takes a member nested inside another member only once', () => {
    const moved = reorderNodes(['b', 'c'], null, 0).apply(start)

    expect(moved.nodes.map(node => node.id)).toEqual(['b', 'c', 'a'])
    expect(order(moved, 'b')).toEqual(['c'])
  })

  // The place it came from is only known once the move runs — a redo has to capture it again.
  it('captures where it came from again when it is replayed', () => {
    const command = reorderNodes(['a'], null, 1)
    const moved = command.apply(start)
    const back = command.revert(moved)

    expect(order(command.apply(back))).toEqual(['b', 'a'])
  })
})

describe('reparentNode', () => {
  const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a'), mesh('b'), mesh('c', 'b')] }

  it('hangs a node from another, and puts it back where it was', () => {
    const command = reparentNode('a', 'b')
    const moved = command.apply(start)

    expect(nodeById(moved, 'a')?.parentId).toBe('b')
    expect(nodeById(command.revert(moved), 'a')?.parentId).toBeNull()
  })

  it('brings a node back out to the scene', () => {
    const command = reparentNode('c', null)
    expect(nodeById(command.apply(start), 'c')?.parentId).toBeNull()
  })

  // Applied, it would close the tree on itself and every walk of it would run forever.
  it('refuses a move under its own descendant, and leaves the scene untouched', () => {
    expect(reparentNode('b', 'c').apply(start)).toBe(start)
  })

  it('leaves an unknown node and a move that changes nothing alone', () => {
    expect(reparentNode('ghost', 'b').apply(start)).toBe(start)
    expect(reparentNode('c', 'b').apply(start)).toBe(start)
  })

  // The old parent is only known once the move runs — a redo has to capture it again.
  it('survives being replayed through the history', () => {
    const command = reparentNode('c', null)
    const [out, history] = run(start, emptyHistory<SceneState>(), command)
    const [back] = undo(out, history)

    expect(nodeById(back, 'c')?.parentId).toBe('b')
  })
})

describe('groupNodes', () => {
  const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a'), mesh('b'), mesh('c', 'b')] }

  it('puts one group over the selection, and hangs it from nothing', () => {
    const grouped = groupNodes([mesh('a'), mesh('b')]).apply(start)
    const group = grouped.nodes.find(node => node.type === 'group')

    expect(group?.parentId).toBeNull()
    expect(grouped.nodes.filter(node => node.parentId === group?.id).map(node => node.id)).toEqual([
      'a',
      'b',
    ])
  })

  // A node whose own parent is selected too is already carried along by it.
  it('moves only the roots of the selection, so a subtree stays a subtree', () => {
    const chosen = [mesh('b'), mesh('c', 'b')]
    const grouped = groupNodes(chosen).apply(start)

    expect(nodeById(grouped, 'c')?.parentId).toBe('b')
  })

  it('is one entry in the history, whatever it moved', () => {
    const command = groupNodes([mesh('a'), mesh('b')])
    expect(command.revert(command.apply(start)).nodes).toEqual(start.nodes)
  })

  // Grouping nothing is reachable from the keyboard: the group must land at the scene rather
  // than hang from `undefined`.
  it('puts the group at the scene when nothing is selected', () => {
    const applied = groupNodes([]).apply(EMPTY_SCENE)

    expect(applied.nodes.find(node => node.type === 'group')?.parentId).toBeNull()
  })
})

describe('copiesOf', () => {
  // a > b, and c beside them
  const nodes = [mesh('a'), mesh('b', 'a'), mesh('c')]

  it('gives every copy an id of its own', () => {
    const copies = copiesOf(nodes, [mesh('c')])

    expect(copies).toHaveLength(1)
    expect(copies[0]?.id).not.toBe('c')
  })

  // A child still naming the original would be shared between the two: moving one would move
  // the other's child.
  it('carries a subtree whole, with its parents rewritten to the copies', () => {
    const copies = copiesOf(nodes, [nodes[0]!])

    expect(copies).toHaveLength(2)
    expect(copies[1]?.parentId).toBe(copies[0]?.id)
  })

  // What falls outside the set keeps its parent, which is what puts a copy beside its original.
  it('leaves a parent outside the copy pointing where it did', () => {
    const copies = copiesOf(nodes, [nodes[1]!])
    expect(copies[0]?.parentId).toBe('a')
  })

  it('copies a node once when both it and its parent are picked', () => {
    expect(copiesOf(nodes, [nodes[0]!, nodes[1]!])).toHaveLength(2)
  })

  it('keeps everything else of the node, so a copy looks like what it came from', () => {
    const dressed = { ...mesh('c'), name: 'Socle', visible: false }
    const [copy] = copiesOf([dressed], [dressed])

    expect(copy).toMatchObject({ name: 'Socle', visible: false, type: 'mesh' })
  })

  it('gives duplicated baked instances fresh source identities', () => {
    const baked = {
      ...mesh('baked'),
      instances: [{ sourceId: 'source', name: 'Source', transform: IDENTITY_TRANSFORM }],
    }
    const copy = copiesOf([baked], [baked])[0]

    expect(copy?.type === 'mesh' ? copy.instances?.[0]?.sourceId : null).not.toBe('source')
  })
})

describe('addNodes', () => {
  const start: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: ['a'] }

  it('puts the copies in and selects them, since that is what the next gesture acts on', () => {
    const copies = copiesOf(start.nodes, start.nodes)
    const pasted = addNodes(copies).apply(start)

    expect(pasted.nodes).toHaveLength(2)
    expect(pasted.selectedIds).toEqual(copies.map(node => node.id))
  })

  it('takes them back out, and the selection with them', () => {
    const command = addNodes(copiesOf(start.nodes, start.nodes))
    const back = command.revert(command.apply(start))

    expect(back.nodes).toEqual(start.nodes)
    expect(back.selectedIds).toEqual([])
  })

  // Nothing to put down clears no selection: an empty add is a no-op, not a deselect.
  it('leaves the scene exactly as it was when given nothing', () => {
    expect(addNodes([]).apply(start)).toBe(start)
  })
})

describe('rootedIn', () => {
  const nodes = [mesh('a'), mesh('b', 'a')]

  it('cuts loose a parent the destination does not hold', () => {
    const [stray] = rootedIn(copiesOf(nodes, [nodes[1]!]), [mesh('elsewhere')])

    expect(stray?.parentId).toBeNull()
  })

  it('leaves a parent the destination does hold alone', () => {
    const [carried] = rootedIn(copiesOf(nodes, [nodes[1]!]), nodes)

    expect(carried?.parentId).toBe('a')
  })

  // The copies name each other: a parent inside the set is held by the paste itself.
  it('keeps a parent that comes along in the same paste', () => {
    const copies = rootedIn(copiesOf(nodes, [nodes[0]!]), [])

    expect(copies[1]?.parentId).toBe(copies[0]?.id)
  })
})

describe('setSpriteOn', () => {
  const start: SceneState = {
    ...EMPTY_SCENE,
    nodes: [sprite('s1'), sprite('s2'), mesh('m1')],
    selectedIds: [],
  }

  it('writes the change onto every sprite of the selection, and comes back', () => {
    const command = setSpriteOn(start.nodes, { opacity: 0.5 })
    const faded = command.apply(start)

    expect(faded.nodes.map(node => (node.type === 'sprite' ? node.sprite.opacity : null))).toEqual([
      0.5,
      0.5,
      null,
    ])
    expect(command.revert(faded)).toEqual(start)
  })

  // A mesh has no sprite to write into: the union is what forbids it, and so does the command.
  it('leaves everything that is not a sprite alone', () => {
    const applied = setSpriteOn(start.nodes, { opacity: 0.5 }).apply(start)

    expect(applied.nodes[2]).toEqual(start.nodes[2])
  })

  it('leaves the fields it was not given alone', () => {
    const applied = setSpriteOn([start.nodes[0]!], { opacity: 0.2 }).apply(start)
    const node = applied.nodes[0]

    expect(node?.type === 'sprite' && node.sprite.map).toEqual({ assetId: 'pic-1' })
  })
})
