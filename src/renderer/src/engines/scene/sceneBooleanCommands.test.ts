import { describe, expect, it } from 'vitest'
import { carveNodes, separateNode, invertCarve, negateNodes } from './commands'
import { meshNode as mesh } from './scene-fixtures'
import { DEFAULT_MATERIAL, EMPTY_SCENE, IDENTITY_TRANSFORM, type SceneState } from './sceneState'
import type { GeometryDescriptor } from '@shared/domain/scene'
import type { CsgOperation } from '@shared/domain/csg'
import { carvedNode, groupNode } from './nodeFactory'
import { csgPartOf } from '@shared/domain/csg'
import { csgGraphOf } from '../csg/csg-fixtures'

const CUBE_SHAPE: GeometryDescriptor = { kind: 'box', width: 1, height: 1, depth: 1 }

describe('carveNodes', () => {
  // 2.4 of matter against the cube's 1, and a bounding box twelve times bigger: the shape the
  // election has to get right, and the one it would get wrong on the box alone.
  const wall = () => ({
    ...mesh('wall'),
    name: 'Wall',
    geometry: { kind: 'box', width: 4, height: 3, depth: 0.2 } satisfies GeometryDescriptor,
  })
  const cube = (x: number) => ({
    ...mesh('cube'),
    transform: { ...IDENTITY_TRANSFORM, position: { x, y: 0, z: 0 } },
  })

  const carved = (picked: SceneState['nodes'], operation: CsgOperation = 'subtract') => {
    const command = carveNodes(picked, operation, picked)
    if (!command) throw new Error('the cut was refused')
    return command.apply({ ...EMPTY_SCENE, nodes: picked })
  }

  const solidOf = (picked: SceneState['nodes'], operation: CsgOperation = 'subtract') => {
    const solid = carved(picked, operation).nodes[0]
    if (solid?.type !== 'carved') throw new Error('the cut produced no solid')
    return solid
  }

  it('leaves one solid where the two shapes were', () => {
    const next = carved([wall(), cube(1)])

    expect(next.nodes).toHaveLength(1)
    expect(next.nodes[0]?.type).toBe('carved')
  })

  it('keeps the matter name and placement, so a wall gains a window', () => {
    const matter = {
      ...wall(),
      transform: { ...IDENTITY_TRANSFORM, position: { x: 7, y: 0, z: 0 } },
    }
    const solid = carved([matter, cube(7)]).nodes[0]

    expect(solid?.name).toBe('Wall')
    expect(solid?.transform.position.x).toBe(7)
  })

  it('refuses a selection nothing can be cut out of', () => {
    expect(carveNodes([wall()], 'subtract', [wall()])).toBeNull()
  })

  // The reason `CsgPart` carries a material at all: welding a red cube to a blue sphere and
  // separating them must not hand both back in one colour.
  it('gives each shape back the colour it wore before the fold', () => {
    const red = { ...wall(), material: { ...DEFAULT_MATERIAL, color: '#ff0000' } }
    const blue = { ...cube(1), material: { ...DEFAULT_MATERIAL, color: '#0000ff' } }
    const solid = carved([red, blue]).nodes[0]
    if (solid?.type !== 'carved') throw new Error('the cut produced no solid')

    const back = separateNode(solid).apply({ ...EMPTY_SCENE, nodes: [solid] })
    const colours = back.nodes.map(node => (node.type === 'mesh' ? node.material.color : null))

    expect(colours).toEqual(['#ff0000', '#0000ff'])
  })

  it('gives back the very shapes it folded in, still where they stood', () => {
    const solid = solidOf([wall(), cube(1)])
    const back = separateNode(solid).apply({ ...EMPTY_SCENE, nodes: [solid] })

    expect(back.nodes).toHaveLength(2)
    expect(back.nodes.map(node => node.type)).toEqual(['mesh', 'mesh'])
    expect(back.nodes[1]?.transform.position.x).toBeCloseTo(1)
  })

  /** Two shapes, one union, and the order of the clicks says nothing about which is which. */
  it('folds to the same solid whichever shape was clicked first', () => {
    const [big, small] = [wall(), cube(1)]

    expect(solidOf([small, big]).carved).toEqual(solidOf([big, small]).carved)
    expect(solidOf([small, big]).name).toBe('Wall')
  })

  /** Roblox's Negate: what is marked is a tool, whatever else is picked and whatever its size. */
  it('carves the marked shape out, even when the marked one is the bigger', () => {
    const solid = solidOf([{ ...wall(), negative: true }, cube(1)])

    expect(solid.name).toBe('cube')
    expect(solid.carved.steps[0]?.part.name).toBe('Wall')
  })

  /** A union holding a negative IS a piercing — how Roblox spells a subtraction, and the same
   * result: no Percer button is needed for the gesture to run the right way. */
  it('pierces rather than welds when the selection holds a marked shape', () => {
    const solid = solidOf([wall(), { ...cube(1), negative: true }], 'unite')

    expect(solid.name).toBe('Wall')
    expect(solid.carved.steps[0]?.operation).toBe('subtract')
  })

  /**
   * What makes the round trip idle: separate a solid, fold the same selection again, and the same
   * solid comes back — whichever button is pressed, because the marks travelled with the brushes.
   */
  it('gives a subtracted brush back marked, so folding it again cuts the same way', () => {
    const solid = solidOf([wall(), cube(1)])
    const back = separateNode(solid).apply({ ...EMPTY_SCENE, nodes: [solid] })

    expect(back.nodes.map(node => (node.type === 'mesh' ? node.negative === true : null))).toEqual([
      false,
      true,
    ])
    expect(carveNodes(back.nodes, 'unite', back.nodes)).not.toBeNull()
  })
})

/**
 * The one gesture that repairs a fold which ran backwards — no undo, and nothing to understand.
 * The election weighs matter, and a generous tool can out-weigh the thin wall it pierces.
 */
describe('invertCarve', () => {
  const wall = () => ({
    ...mesh('wall'),
    name: 'Wall',
    geometry: { kind: 'box', width: 4, height: 3, depth: 0.2 } satisfies GeometryDescriptor,
  })
  const cube = () => ({ ...mesh('cube'), name: 'Cube' })

  const folded = () => {
    const picked = [wall(), cube()]
    const command = carveNodes(picked, 'subtract', picked)
    if (!command) throw new Error('the cut was refused')
    const state = command.apply({ ...EMPTY_SCENE, nodes: picked })
    const solid = state.nodes[0]
    if (solid?.type !== 'carved') throw new Error('the cut produced no solid')
    return { solid, state }
  }

  it('swaps the matter and the tool, in one command', () => {
    const { solid, state } = folded()
    expect(solid.name).toBe('Wall')

    const flipped = invertCarve(solid, state.nodes)
    if (!flipped) throw new Error('the solid carries a tool')
    const after = flipped.apply(state)
    const made = after.nodes.find(node => node.type === 'carved')

    expect(after.nodes).toHaveLength(1)
    expect(made?.name).toBe('Cube')
    expect(made?.type === 'carved' && made.carved.steps[0]?.part.name).toBe('Wall')
  })

  /** Pressed twice, a hand has to land back where it started — or the button is a trap. */
  it('gives the first solid back when it is run again', () => {
    const { solid, state } = folded()
    const once = invertCarve(solid, state.nodes)?.apply(state)
    const flipped = once?.nodes.find(node => node.type === 'carved')
    if (flipped?.type !== 'carved' || !once) throw new Error('the first flip was refused')

    const twice = invertCarve(flipped, once.nodes)?.apply(once)
    expect(twice?.nodes.find(node => node.type === 'carved')?.name).toBe('Wall')
  })

  it('is taken back by one undo', () => {
    const { solid, state } = folded()
    const flipped = invertCarve(solid, state.nodes)
    if (!flipped) throw new Error('the solid carries a tool')

    expect(flipped.revert(flipped.apply(state)).nodes.map(node => node.id)).toEqual(
      state.nodes.map(node => node.id),
    )
  })

  it('refuses a solid of one brush, which has no other way to run', () => {
    const only = carvedNode(csgGraphOf(csgPartOf('Alone', CUBE_SHAPE, DEFAULT_MATERIAL)))
    if (only.type !== 'carved') throw new Error('a solid')
    expect(invertCarve(only, [only])).toBeNull()
  })
})

describe('negateNodes', () => {
  const shapes = () => [mesh('a'), mesh('b')]
  const marked = (state: SceneState) =>
    state.nodes.map(node => (node.type === 'mesh' ? node.negative === true : null))

  const run = (nodes: SceneState['nodes']) => negateNodes(nodes).apply({ ...EMPTY_SCENE, nodes })

  it('marks a selection nothing of which is marked', () => {
    expect(marked(run(shapes()))).toEqual([true, true])
  })

  /** One button for both, which is what Roblox's Negate is — and the way back out of a mark. */
  it('takes the mark off a selection wholly marked', () => {
    const already = shapes().map(node => ({ ...node, negative: true }))
    expect(marked(run(already))).toEqual([false, false])
  })

  it('marks the rest rather than unmarking, when only part of the selection is marked', () => {
    const [one, other] = shapes()
    if (!one || !other) throw new Error('two shapes')
    expect(marked(run([{ ...one, negative: true }, other]))).toEqual([true, true])
  })

  it('leaves a node carrying no shape alone', () => {
    const nodes = [mesh('a'), groupNode()]
    const next = negateNodes(nodes).apply({ ...EMPTY_SCENE, nodes })

    expect(next.nodes[1]).toEqual(nodes[1])
  })

  it('refuses a selection carrying no shape at all, rather than costing an empty undo', () => {
    expect(negateNodes([groupNode()]).refuses?.(EMPTY_SCENE)).toBe(true)
  })

  /**
   * Each node back to ITS OWN mark, not to a shared default: one sweep writes the whole selection
   * now — 3.9 ms for 500 shapes in a 40 000-node scene against 219 ms one command per node — and
   * a revert that forgot which of them was already marked would be the price of that sweep.
   */
  it('gives every shape back the mark it wore, and not a shared one', () => {
    const [one, other] = shapes()
    if (!one || !other) throw new Error('two shapes')
    const nodes = [{ ...one, negative: true }, other]
    const command = negateNodes(nodes)
    const state = { ...EMPTY_SCENE, nodes }

    expect(marked(command.apply(state))).toEqual([true, true])
    expect(marked(command.revert(command.apply(state)))).toEqual([true, false])
  })
})
