import { describe, expect, it } from 'vitest'
import type { GeometryDescriptor } from '@shared/domain/scene'
import { IDENTITY_TRANSFORM, type Transform } from '@shared/domain/transform'
import { groupNode, meshNode } from '@/engines/scene/nodeFactory'
import type { SceneNode } from '@/engines/scene/sceneState'
import { createHierarchy } from './hierarchy'

const BOX: GeometryDescriptor = { kind: 'box', width: 1, height: 1, depth: 1 }

const held = (nodes: readonly SceneNode[]) =>
  createHierarchy(new Map(nodes.map(one => [one.id, one])), () => null)

const at = (x: number, y: number, z: number): Transform => ({
  ...IDENTITY_TRANSFORM,
  position: { x, y, z },
})

const turned = (y: number): Transform => ({ ...IDENTITY_TRANSFORM, rotation: { x: 0, y, z: 0 } })

/** 🛑 The hole the physics carried since it arrived: a body under a group stood where nothing was. */
describe('where a node stands once its parents are composed', () => {
  it('leaves a node with no parent exactly where it is, and asks for no local', () => {
    const node = { ...meshNode(BOX), transform: at(3, 1, -2) }
    const hierarchy = held([node])

    expect(hierarchy.worldOf(node.id, node.transform)).toBe(node.transform)
    expect(hierarchy.localOf(node.id, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 })).toBeNull()
  })

  it('adds the place of a parent to the place of its child', () => {
    const group = { ...groupNode(), transform: at(10, 0, 0) }
    const child: SceneNode = { ...meshNode(BOX), parentId: group.id, transform: at(0, 2, 0) }

    expect(held([group, child]).worldOf(child.id, child.transform).position).toMatchObject({
      x: 10,
      y: 2,
      z: 0,
    })
  })

  /** A quarter turn on a parent puts a child ahead of it somewhere else entirely. */
  it('turns a child with its parent', () => {
    const group = { ...groupNode(), transform: turned(Math.PI / 2) }
    const child: SceneNode = { ...meshNode(BOX), parentId: group.id, transform: at(0, 0, 4) }

    const world = held([group, child]).worldOf(child.id, child.transform).position
    expect(world.x).toBeCloseTo(4, 6)
    expect(world.z).toBeCloseTo(0, 6)
  })

  it('composes a chain of three, however they were declared', () => {
    const outer = { ...groupNode(), transform: at(1, 0, 0) }
    const middle: SceneNode = { ...groupNode(), parentId: outer.id, transform: at(0, 1, 0) }
    const leaf: SceneNode = { ...meshNode(BOX), parentId: middle.id, transform: at(0, 0, 1) }

    expect(held([leaf, middle, outer]).worldOf(leaf.id, leaf.transform).position).toMatchObject({
      x: 1,
      y: 1,
      z: 1,
    })
  })

  /**
   * 🛑 The invariant everything rests on: what the physics is given and what is written back are
   * inverses. Wrong in either direction, a body drifts a little further from its mesh every step.
   */
  it('writes back exactly what it composed, turns and all', () => {
    const group = { ...groupNode(), transform: { ...turned(0.7), position: { x: 3, y: 1, z: -2 } } }
    const child: SceneNode = {
      ...meshNode(BOX),
      parentId: group.id,
      transform: { ...turned(0.2), position: { x: 0, y: 2, z: 5 } },
    }
    const hierarchy = held([group, child])

    const world = hierarchy.worldOf(child.id, child.transform)
    const back = hierarchy.localOf(child.id, world.position, world.rotation)

    expect(back?.position.x).toBeCloseTo(0, 6)
    expect(back?.position.y).toBeCloseTo(2, 6)
    expect(back?.position.z).toBeCloseTo(5, 6)
    expect(back?.rotation.y).toBeCloseTo(0.2, 6)
  })

  /** 🛑 A parent that MOVES: nothing is remembered, so the child follows it the same step. */
  it('follows a parent that moved since the world was built', () => {
    const group = { ...groupNode(), transform: at(0, 0, 0) }
    const child: SceneNode = { ...meshNode(BOX), parentId: group.id, transform: at(0, 2, 0) }
    const hierarchy = held([group, child])

    group.transform.position.x = 7

    expect(hierarchy.worldOf(child.id, child.transform).position.x).toBeCloseTo(7, 6)
  })

  /** A scaled parent stretches its child's place — the SHAPE is another matter, see `shapeOf`. */
  it('scales the place of a child with its parent', () => {
    const group = {
      ...groupNode(),
      transform: { ...IDENTITY_TRANSFORM, scale: { x: 2, y: 2, z: 2 } },
    }
    const child: SceneNode = { ...meshNode(BOX), parentId: group.id, transform: at(0, 3, 0) }

    expect(held([group, child]).worldOf(child.id, child.transform).position.y).toBeCloseTo(6, 6)
  })

  /** A parent the scene has lost: the node stands where its own transform says, not at the origin. */
  it('answers for a node whose parent is not there', () => {
    const orphan: SceneNode = { ...meshNode(BOX), parentId: 'gone', transform: at(1, 2, 3) }

    expect(held([orphan]).worldOf(orphan.id, orphan.transform).position).toMatchObject({
      x: 1,
      y: 2,
      z: 3,
    })
  })

  /** An entity the scene never held — one a script spawned — stands where it says it stands. */
  it('answers for an entity the scene does not hold at all', () => {
    expect(held([]).worldOf('spawned', at(4, 5, 6)).position).toMatchObject({ x: 4, y: 5, z: 6 })
  })
})
