import { describe, expect, it } from 'vitest'
import type { Command } from '../core/history'
import {
  addGuide,
  clearGuides,
  cropToRect,
  duplicateLayer,
  groupLayers,
  mergeDown,
  moveGuide,
  moveLayer,
  removeGuide,
  removeLayer,
  resizeCanvas,
  resizeImage,
  translateLayer,
  paintPixels,
  ungroupLayer,
} from './commands'
import {
  allLayers,
  DEFAULT_CANVAS,
  isGroup,
  layerById,
  pixelLayer,
  type CanvasState,
} from './canvasState'

const stack = (...names: string[]): CanvasState => ({
  ...DEFAULT_CANVAS,
  layers: names.map(name => pixelLayer(name, name)),
  activeLayerId: names[0] ?? null,
})

const namesOf = (state: CanvasState): string[] => state.layers.map(layer => layer.id)

const childrenOf = (state: CanvasState, id: string): string[] => {
  const group = layerById(state, id)
  return group && isGroup(group) ? group.children.map(child => child.id) : []
}

/** Counted rather than random, so a duplicated subtree reads the same on every run. */
function ids(): () => string {
  let next = 0
  return () => `copy-${(next += 1)}`
}

/** Runs a command and gives back both sides, so every test can check the undo too. */
function roundTrip(state: CanvasState, command: Command<CanvasState>): [CanvasState, CanvasState] {
  const applied = command.apply(state)
  return [applied, command.revert(applied)]
}

describe('operating inside a group', () => {
  const nested = (): CanvasState =>
    groupLayers(['a', 'b'], 'g', 'Group').apply(stack('a', 'b', 'c'))

  it('removes a layer that sits inside a group', () => {
    const [after] = roundTrip(nested(), removeLayer('a'))

    expect(allLayers(after.layers).map(layer => layer.id)).toEqual(['g', 'b', 'c'])
  })

  it('duplicates a layer that sits inside a group, beside it', () => {
    const [after] = roundTrip(nested(), duplicateLayer('a', 'a-copy', 'a copy', ids()))

    expect(allLayers(after.layers).map(layer => layer.id)).toEqual(['g', 'a', 'a-copy', 'b', 'c'])
  })

  it('merges within the group rather than through its wall', () => {
    const [after] = roundTrip(nested(), mergeDown('b'))

    expect(allLayers(after.layers).map(layer => layer.id)).toEqual(['g', 'a', 'c'])
    expect(after.activeLayerId).toBe('a')
  })

  it('reorders within the group', () => {
    const [after] = roundTrip(nested(), moveLayer('a', 'g', 1))

    expect(childrenOf(after, 'g')).toEqual(['b', 'a'])
  })

  it('takes a layer into a group', () => {
    const [after, back] = roundTrip(nested(), moveLayer('c', 'g', 0))

    expect(namesOf(after)).toEqual(['g'])
    expect(childrenOf(after, 'g')).toEqual(['c', 'a', 'b'])
    expect(namesOf(back)).toEqual(['g', 'c'])
  })

  it('takes a layer out of a group, above it', () => {
    const [after] = roundTrip(nested(), moveLayer('a', null, 1))

    expect(namesOf(after)).toEqual(['g', 'a', 'c'])
    expect(childrenOf(after, 'g')).toEqual(['b'])
  })

  /**
   * The drop would carry the receiving group along with the moved one, and every layer under it
   * would leave the document with no way back.
   */
  it('refuses a group dropped into its own subtree', () => {
    const outer = groupLayers(['g', 'c'], 'outer', 'Outer').apply(nested())

    expect(moveLayer('outer', 'g', 0).apply(outer)).toBe(outer)
  })

  it('refuses a layer dropped into something that is not a group', () => {
    const before = nested()

    expect(moveLayer('c', 'a', 0).apply(before)).toBe(before)
  })

  it('dissolves a group nested in another one', () => {
    const outer = groupLayers(['g', 'c'], 'outer', 'Outer').apply(nested())
    const [after] = roundTrip(outer, ungroupLayer('g'))

    expect(allLayers(after.layers).map(layer => layer.id)).toEqual(['outer', 'a', 'b', 'c'])
  })

  // A group carries its children, so walking into it shifts a nested layer once per level.
  it('moves a nested layer exactly as much as a top-level one', () => {
    const [after] = roundTrip(nested(), resizeCanvas(400, 300, { x: 10, y: 20 }))

    expect(layerById(after, 'a')?.transform.x).toBe(0)
    expect(layerById(after, 'g')?.transform.x).toBe(10)
    expect(layerById(after, 'c')?.transform.x).toBe(10)
  })

  it('scales a nested layer exactly as much as a top-level one', () => {
    const [after] = roundTrip({ ...nested(), width: 100, height: 100 }, resizeImage(200, 200))

    expect(layerById(after, 'a')?.transform.scaleX).toBe(1)
    expect(layerById(after, 'g')?.transform.scaleX).toBe(2)
  })

  it('gives every copied child an id of its own', () => {
    const [after] = roundTrip(nested(), duplicateLayer('g', 'g-copy', 'Group copy', ids()))
    const all = allLayers(after.layers).map(layer => layer.id)

    expect(new Set(all).size).toBe(all.length)
  })

  // The armed layer went with the group; leaving it pointing at nothing swallows every stroke.
  it('rearms a survivor when the removed group held what was armed', () => {
    const before = { ...nested(), activeLayerId: 'a' }
    const [after] = roundTrip(before, removeLayer('g'))

    expect(layerById(after, after.activeLayerId)).not.toBeNull()
  })

  // Counted across the tree: a root holding one group still holds every layer inside it.
  it('still deletes when the root is a single group', () => {
    const rooted = groupLayers(['a', 'b', 'c'], 'g', 'Group').apply(stack('a', 'b', 'c'))
    const [after] = roundTrip(rooted, removeLayer('a'))

    expect(allLayers(after.layers).map(layer => layer.id)).toEqual(['g', 'b', 'c'])
  })

  it('still refuses to take the last paintable layer', () => {
    const before = stack('a')
    const [after] = roundTrip(before, removeLayer('a'))

    expect(after.layers).toHaveLength(1)
  })
})

// The revert used to restore the layers and keep the new frame, and the test only read layers.
describe('undoing a frame change', () => {
  it('gives the frame back, not just the layers', () => {
    const before = { ...stack('a'), width: 100, height: 100 }
    const [, reverted] = roundTrip(before, resizeImage(400, 400))

    expect([reverted.width, reverted.height]).toEqual([100, 100])
  })

  it('gives the frame back after a crop too', () => {
    const before = { ...stack('a'), width: 100, height: 100 }
    const [after, reverted] = roundTrip(before, cropToRect({ x: 10, y: 10, width: 50, height: 50 }))

    expect([after.width, after.height]).toEqual([50, 50])
    expect([reverted.width, reverted.height]).toEqual([100, 100])
  })
})

const withGuides: CanvasState = {
  ...DEFAULT_CANVAS,
  guides: [
    { id: 'g1', axis: 'x', position: 100 },
    { id: 'g2', axis: 'y', position: 200 },
  ],
}

describe('guide commands', () => {
  it('lays a guide down and takes it back', () => {
    const [after, reverted] = roundTrip(
      DEFAULT_CANVAS,
      addGuide({ id: 'g1', axis: 'x', position: 40 }),
    )

    expect(after.guides).toHaveLength(1)
    expect(reverted.guides).toEqual([])
  })

  it('moves a guide and restores where it stood', () => {
    const [after, reverted] = roundTrip(withGuides, moveGuide('g1', 350))

    expect(after.guides[0]?.position).toBe(350)
    expect(reverted.guides[0]?.position).toBe(100)
  })

  it('puts a removed guide back at its own index, not on top', () => {
    const [after, reverted] = roundTrip(withGuides, removeGuide('g1'))

    expect(after.guides.map(guide => guide.id)).toEqual(['g2'])
    expect(reverted.guides.map(guide => guide.id)).toEqual(['g1', 'g2'])
  })

  it('clears every guide at once, and gives them all back', () => {
    const [after, reverted] = roundTrip(withGuides, clearGuides())

    expect(after.guides).toEqual([])
    expect(reverted.guides).toHaveLength(2)
  })

  // Two commands of the same drag coalesce, so the second one applies over the first's result.
  it('keeps the original position across a coalesced drag', () => {
    const first = moveGuide('g1', 150)
    const dragged = moveGuide('g1', 320).apply(first.apply(withGuides))

    expect(first.revert(dragged).guides[0]?.position).toBe(100)
  })
})

// The gesture that lays a guide down keeps emitting `addGuide`, which is why it replaces.
describe('addGuide, applied twice', () => {
  it('moves the guide it already laid rather than stacking another', () => {
    const first = addGuide({ id: 'g1', axis: 'x', position: 10 }).apply(DEFAULT_CANVAS)
    const second = addGuide({ id: 'g1', axis: 'x', position: 90 }).apply(first)

    expect(second.guides).toEqual([{ id: 'g1', axis: 'x', position: 90 }])
  })

  // Applied over a guide that already existed, the inverse is a move back — not a removal, which
  // would lose a guide the user had laid in an earlier gesture.
  it('puts the guide it replaced back where it was', () => {
    const laid = addGuide({ id: 'g1', axis: 'x', position: 10 }).apply(DEFAULT_CANVAS)
    const again = addGuide({ id: 'g1', axis: 'x', position: 400 })

    expect(again.revert(again.apply(laid)).guides).toEqual([{ id: 'g1', axis: 'x', position: 10 }])
  })
})

describe('translateLayer', () => {
  it('writes the layer position into the state the engine reads back', () => {
    const moved = translateLayer('layer-1', 40, -12).apply(DEFAULT_CANVAS)

    expect(layerById(moved, 'layer-1')?.transform).toMatchObject({ x: 40, y: -12 })
  })

  it('puts it back exactly where it started', () => {
    const command = translateLayer('layer-1', 40, -12)

    expect(command.revert(command.apply(DEFAULT_CANVAS))).toEqual(DEFAULT_CANVAS)
  })

  /**
   * A drag emits one of these per pointer move, all merged into one entry: the merge keeps the
   * first command's `revert` and the last one's `apply`, so a relative step would rewind a single
   * frame of the gesture instead of the whole of it.
   */
  it('is absolute, so the steps of one drag can be merged', () => {
    const first = translateLayer('layer-1', 10, 0)
    const last = translateLayer('layer-1', 90, 0)
    const dragged = last.apply(first.apply(DEFAULT_CANVAS))

    expect(layerById(dragged, 'layer-1')?.transform.x).toBe(90)
    expect(first.revert(dragged)).toEqual(DEFAULT_CANVAS)
  })

  it('leaves a stack that holds no such layer alone', () => {
    expect(translateLayer('nope', 40, 40).apply(DEFAULT_CANVAS)).toBe(DEFAULT_CANVAS)
  })
})

describe('paintPixels', () => {
  function port(answers = true) {
    const calls: string[] = []
    const lost: string[] = []
    return {
      calls,
      lost: (id: string) => void lost.push(id),
      losses: lost,
      restore: (id: string, side: string) => (calls.push(`${id}:${side}`), answers),
    }
  }

  // A resurface drops every tile without telling the stack, and the entry left behind is a ⌘Z
  // that visibly does nothing. The port is told so it can take the entry off.
  it('reports a replay that found nothing', () => {
    const spy = port(false)
    const command = paintPixels('p1', spy)
    command.revert(DEFAULT_CANVAS)

    expect(spy.losses).toEqual(['p1'])
  })

  it('says nothing when the tiles are still there', () => {
    const spy = port()
    const command = paintPixels('p1', spy)
    command.revert(DEFAULT_CANVAS)

    expect(spy.losses).toEqual([])
  })

  // The layer already holds the "after" pixels when the entry is pushed.
  it('asks for nothing on the apply that pushes it', () => {
    const spy = port()
    paintPixels('p1', spy).apply(DEFAULT_CANVAS)

    expect(spy.calls).toEqual([])
  })

  it('paints the tiles from before the gesture back on undo, and the ones after on redo', () => {
    const spy = port()
    const command = paintPixels('p1', spy)
    command.apply(DEFAULT_CANVAS)
    command.revert(DEFAULT_CANVAS)
    command.apply(DEFAULT_CANVAS)

    expect(spy.calls).toEqual(['p1:before', 'p1:after'])
  })

  // The pixels are the engine's; nothing about a stroke belongs in the serialized document.
  it('leaves the state untouched', () => {
    const command = paintPixels('p1', port())

    expect(command.revert(DEFAULT_CANVAS)).toBe(DEFAULT_CANVAS)
  })
})
