import { describe, expect, it } from 'vitest'
import { clipLane, embeddedClip, wornMaterials } from '@shared/domain/scene'
import { type Command } from '../core/history'
import {
  batch,
  reparentNode,
  reorderNodes,
  removeNode,
  renameNode,
  setGeometry,
  setGeometryOn,
  setLight,
  setMeshMaterial,
  setMaterialOn,
  setModelLanes,
  dressModel,
  wearMaterialAt,
  setWorld,
  setShadowOn,
  setSprite,
} from './commands'
import {
  lightNodeFixture as light,
  meshNode as mesh,
  modelNodeFixture,
  spriteNodeFixture,
} from './scene-fixtures'

const sprite = (id: string) => spriteNodeFixture(id, 'pic-1')
import {
  DEFAULT_MATERIAL,
  DEFAULT_SPRITE,
  EMPTY_SCENE,
  nodeById,
  type SceneState,
} from './sceneState'
import type { EnvironmentRef } from '@shared/domain/scene'

describe('setWorld', () => {
  const sky: EnvironmentRef = { kind: 'skybox', assetId: 'sky-1' }

  it('swaps what lights the scene, and comes back', () => {
    const command = setWorld({ environment: sky })
    const lit = command.apply(EMPTY_SCENE)

    expect(lit.world.environment).toEqual(sky)
    expect(command.revert(lit).world.environment).toEqual({ kind: 'studio' })
  })

  // A patch, so a preset writing five fields and a slider writing one are the same call — and a
  // field this build does not know is left exactly as the file spelled it.
  it('leaves the fields it was not given alone', () => {
    const lit = setWorld({ exposure: 1.4 }).apply({
      ...EMPTY_SCENE,
      world: { ...EMPTY_SCENE.world, environment: sky },
    })

    expect(lit.world.exposure).toBe(1.4)
    expect(lit.world.environment).toEqual(sky)
  })

  // Choosing a sky is a decision about the document, not a way of looking at it.
  it('leaves the nodes and the selection alone', () => {
    const start = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: ['a'] }
    const lit = setWorld({ environment: sky }).apply(start)

    expect(lit.nodes).toBe(start.nodes)
    expect(lit.selectedIds).toBe(start.selectedIds)
  })
})

describe('batch', () => {
  const start: SceneState = {
    ...EMPTY_SCENE,
    nodes: [mesh('a'), mesh('b'), light('c')],
    selectedIds: [],
  }

  it('edits every node of a selection as one entry in the history', () => {
    const command = batch('rename', start.nodes, node => renameNode(node.id, 'same'))
    const applied = command.apply(start)

    expect(applied.nodes.map(node => node.name)).toEqual(['same', 'same', 'same'])
    expect(command.revert(applied).nodes.map(node => node.name)).toEqual(
      start.nodes.map(node => node.name),
    )
  })

  it('skips the nodes the edit does not apply to', () => {
    const meshes = start.nodes.filter(node => node.type === 'mesh')
    const command = batch('rename', start.nodes, node =>
      node.type === 'mesh' ? renameNode(node.id, 'mesh') : null,
    )

    expect(command.apply(start).nodes.map(node => node.name)).toEqual([
      'mesh',
      'mesh',
      start.nodes[2]?.name,
    ])
    expect(meshes).toHaveLength(2)
  })

  it('names the nodes it touched, so an edit of another selection is another entry', () => {
    const one = batch('transform', [start.nodes[0] ?? mesh('a')], () => null)
    const two = batch('transform', start.nodes, () => null)
    expect(one.id).not.toBe(two.id)
  })

  it('refuses only when every target refuses, so one node still worth moving makes an entry', () => {
    const same = batch('rename', start.nodes, node => renameNode(node.id, node.name))
    const one = batch('rename', start.nodes, node =>
      renameNode(node.id, node.id === 'a' ? 'other' : node.name),
    )

    expect(same.refuses?.(start)).toBe(true)
    expect(one.refuses?.(start)).toBe(false)
  })

  it('refuses a batch that reaches nothing, rather than pushing an entry doing nothing', () => {
    expect(batch('rename', start.nodes, () => null).refuses?.(start)).toBe(true)
  })

  it('never refuses an edit that has no opinion, however many nodes it covers', () => {
    const command = batch('material', start.nodes, node =>
      setMeshMaterial(node.id, DEFAULT_MATERIAL),
    )
    expect(command.refuses?.(start)).toBe(false)
  })

  it('writes in scene order, whatever order the targets came in', () => {
    const applied = batch('rename', [...start.nodes].reverse(), node =>
      renameNode(node.id, `${node.id}!`),
    ).apply(start)

    expect(applied.nodes.map(node => node.id)).toEqual(['a', 'b', 'c'])
    expect(applied.nodes.map(node => node.name)).toEqual(['a!', 'b!', 'c!'])
  })

  it('hands back the state itself when nothing was written', () => {
    expect(batch('rename', start.nodes, () => null).apply(start)).toBe(start)
  })

  it('leaves the scene alone for a target it does not hold, forwards and back', () => {
    const command = batch('rename', [{ id: 'ghost' }], target => renameNode(target.id, 'x'))
    expect(command.apply(start)).toBe(start)
    expect(command.revert(start)).toBe(start)
  })

  it('hands back the same selection, so nothing watching it re-renders', () => {
    const picked: SceneState = { ...start, selectedIds: ['a'] }
    const applied = batch('rename', picked.nodes, node => renameNode(node.id, 'x')).apply(picked)
    expect(applied.selectedIds).toBe(picked.selectedIds)
  })

  it('recaptures as it is replayed, so a redo undoes to where the redo started', () => {
    const command = batch('rename', start.nodes, node => renameNode(node.id, 'once'))
    const again = command.apply(command.revert(command.apply(start)))
    expect(command.revert(again).nodes.map(node => node.name)).toEqual(['a', 'b', 'c'])
  })
})

/**
 * The defensive halves. A command is built before it knows what it will meet: the node may be
 * gone, or be of another type. Each of those must leave the state exactly as it was — an edit
 * written onto a node of the wrong type produces a document that no longer loads.
 */
describe('an edit that meets nothing it can act on', () => {
  const scene = { ...EMPTY_SCENE, nodes: [mesh('a'), light('l'), sprite('s')] }

  const refused: [string, Command<SceneState>][] = [
    ['renameNode on a node that is gone', renameNode('missing', 'x')],
    ['setSprite on a mesh', setSprite('a', DEFAULT_SPRITE)],
  ]

  for (const [name, command] of refused) {
    it(`leaves the scene alone: ${name}`, () => {
      expect(command.apply(scene)).toBe(scene)
    })
  }
})

// Redo replays a command; a revert that never ran must not invent a previous state to go back to.
describe('a revert asked for before its apply', () => {
  const scene = { ...EMPTY_SCENE, nodes: [mesh('a'), light('l'), sprite('s')] }

  const untouched: [string, Command<SceneState>][] = [
    ['removeNode', removeNode('a')],
    ['renameNode', renameNode('a', 'x')],
    [
      'setGeometry',
      setGeometry('a', { kind: 'sphere', radius: 1, widthSegments: 8, heightSegments: 6 }),
    ],
    ['setLight', setLight('l', { kind: 'ambient', color: '#fff', intensity: 2 })],
    ['setSprite', setSprite('s', DEFAULT_SPRITE)],
    ['reparentNode', reparentNode('a', 'l')],
    ['reorderNodes', reorderNodes(['a'], null, 0)],
    ['setWorld', setWorld({ environment: { kind: 'skybox', assetId: 'sky-1' } })],
  ]

  for (const [name, command] of untouched) {
    it(`gives ${name} back the very state it was handed`, () => {
      expect(command.revert(scene)).toBe(scene)
    })
  }
})

describe('setShadowOn', () => {
  const scene = { ...EMPTY_SCENE, nodes: [mesh('a'), light('l'), sprite('s')] }

  // The inspector hides the row; the command must refuse it too, or the flag lands in the
  // document and in the history for a node the renderer will never read it from.
  it('skips what catches no shadow', () => {
    const applied = setShadowOn(scene.nodes, { receiveShadow: true }).apply(scene)

    expect(applied.nodes.map(node => node.receiveShadow)).toEqual([true, false, false])
  })

  it('skips what throws no shadow', () => {
    const applied = setShadowOn(scene.nodes, { castShadow: true }).apply(scene)

    expect(applied.nodes.map(node => node.castShadow)).toEqual([true, false, false])
  })
})

describe('an edit spread over a selection', () => {
  const scene = { ...EMPTY_SCENE, nodes: [mesh('a'), light('l')] }

  it('writes a geometry field only onto the meshes built from the same primitive', () => {
    const sphere = mesh('b')
    sphere.geometry = { kind: 'sphere', radius: 1, widthSegments: 8, heightSegments: 6 }
    const nodes = [...scene.nodes, sphere]

    const applied = setGeometryOn(
      nodes,
      { kind: 'box', width: 1, height: 1, depth: 1 },
      'width',
      4,
    ).apply({ ...EMPTY_SCENE, nodes })

    expect(
      applied.nodes.map(node => (node.type === 'mesh' ? node.geometry.kind : node.type)),
    ).toEqual(['box', 'light', 'sphere'])
    expect(applied.nodes[2]).toEqual(sphere)
  })

  it('writes a material field onto the meshes and nothing else', () => {
    const applied = setMaterialOn(scene.nodes, { color: '#ff0000' }).apply(scene)

    expect(applied.nodes[0]?.type === 'mesh' && applied.nodes[0].material.color).toBe('#ff0000')
    expect(applied.nodes[1]).toBe(scene.nodes[1])
  })
})

describe('dressModel', () => {
  const withModel = (): SceneState => ({ ...EMPTY_SCENE, nodes: [modelNodeFixture('m')] })

  const dressOf = (state: SceneState) => {
    const node = nodeById(state, 'm')
    return node?.type === 'model' ? node.model.dress : undefined
  }

  const wornBy = (state: SceneState, slot = 0) => wornMaterials(dressOf(state))[slot]

  it('writes the reference and gives it back on undo', () => {
    const before = withModel()
    const applied = wearMaterialAt('m', 0, 'mat-1')

    const after = applied.apply(before)
    expect(wornBy(after)).toBe('mat-1')
    expect(dressOf(applied.revert(after))).toBeUndefined()
  })

  it('keeps the remembered image when an assembled material arrives', () => {
    const covered = dressModel('m', { kind: 'image', assetId: 'pic-1' }).apply(withModel())

    expect(dressOf(wearMaterialAt('m', 0, 'mat-1').apply(covered))).toEqual({
      kind: 'materials',
      documentIds: ['mat-1'],
      imageAssetId: 'pic-1',
    })
  })

  // No dress at all is « the file's own maps », which a document should not carry a field to say.
  it('drops the field when the dress is taken off', () => {
    const dressed = wearMaterialAt('m', 0, 'mat-1').apply(withModel())

    expect(dressOf(dressModel('m', null).apply(dressed))).toBeUndefined()
  })

  // The whole point of the union: a model covered by a picture wears no material, and the other
  // way round. Two fields would have let a switch leave the old one behind, worn by nobody.
  it('cannot wear a picture and a material at once', () => {
    const dressed = wearMaterialAt('m', 0, 'mat-1').apply(withModel())
    const covered = dressModel('m', { kind: 'image', assetId: 'pic-1' }).apply(dressed)

    expect(dressOf(covered)).toEqual({ kind: 'image', assetId: 'pic-1' })
    expect(wornMaterials(dressOf(covered))).toEqual([])
  })

  // A car is a body, a glass and a set of tyres: naming the second must not name the first.
  it('names one slot without filling the ones before it', () => {
    const dressed = wearMaterialAt('m', 2, 'mat-3').apply(withModel())

    expect(wornMaterials(dressOf(dressed))).toEqual(['', '', 'mat-3'])
  })

  // Emptying a row is not removing it: the list is what the user built, and a row that vanished
  // under the finger that cleared it is a gesture nobody asked for.
  it('keeps a slot that is emptied', () => {
    const two = wearMaterialAt('m', 1, 'mat-2').apply(
      wearMaterialAt('m', 0, 'mat-1').apply(withModel()),
    )

    expect(wornMaterials(dressOf(wearMaterialAt('m', 1, '').apply(two)))).toEqual(['mat-1', ''])
  })

  // Both edits write the same reference: rebuilding it from `assetId` alone dropped the other.
  it('leaves the lanes of the model alone, and is left alone by them', () => {
    const lane = clipLane('main', [embeddedClip('c1', 'run', { speed: 2 })])
    const blocked = setModelLanes('m', [lane]).apply(withModel())
    const dressed = wearMaterialAt('m', 0, 'mat-1').apply(blocked)

    const node = nodeById(dressed, 'm')
    expect(node?.type === 'model' && node.model.lanes).toEqual([lane])
    expect(wornBy(setModelLanes('m', []).apply(dressed))).toBe('mat-1')
  })

  // One empty lane is exactly what the band shows a model that has never played anything, so
  // writing it says nothing the default does not.
  it('holds a lane the user added even while nothing has been dropped in it', () => {
    const lanes = [clipLane('main'), clipLane('second')]
    const node = nodeById(setModelLanes('m', lanes).apply(withModel()), 'm')

    expect(node?.type === 'model' && node.model.lanes).toEqual(lanes)

    const alone = nodeById(setModelLanes('m', [clipLane('main')]).apply(withModel()), 'm')
    expect(alone?.type === 'model' && 'lanes' in alone.model).toBe(false)
  })

  it('drops the field when the last lane goes, so a rest pose says nothing at all', () => {
    const blocked = setModelLanes('m', [clipLane('main', [embeddedClip('c1', 'run')])]).apply(
      withModel(),
    )
    const stopped = setModelLanes('m', []).apply(blocked)

    const node = nodeById(stopped, 'm')
    expect(node?.type === 'model' && 'lanes' in node.model).toBe(false)
  })
})
