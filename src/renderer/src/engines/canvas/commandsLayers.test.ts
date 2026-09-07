import { describe, expect, it } from 'vitest'
import { emptyHistory, run, undo } from '../core/history'
import type { Command } from '../core/history'
import {
  addLayer,
  cropToRect,
  duplicateLayer,
  flatten,
  groupLayers,
  mergeDown,
  moveLayer,
  removeLayer,
  renameLayer,
  resizeCanvas,
  setPixelCell,
  resizeImage,
  selectLayer,
  setLayerOpacity,
  setLayerVisible,
  ungroupLayer,
} from './commands'
import { layerFixture } from './canvas-fixtures'
import {
  allLayers,
  DEFAULT_CANVAS,
  groupLayer,
  IDENTITY,
  layerById,
  pixelLayer,
  type CanvasState,
} from './canvasState'
import { applyTo, layerMatrix } from './layerSpace'

const second = layerFixture()

const withTwo: CanvasState = addLayer(second).apply(DEFAULT_CANVAS)

describe('addLayer', () => {
  it('stacks the layer on top and makes it active', () => {
    expect(withTwo.layers.at(-1)?.id).toBe('layer-2')
    expect(withTwo.activeLayerId).toBe('layer-2')
  })

  it('reverts to the stack without it', () => {
    const command = addLayer(second)
    expect(command.revert(command.apply(DEFAULT_CANVAS)).layers).toHaveLength(1)
  })
})

describe('removeLayer', () => {
  it('drops the layer', () => {
    expect(removeLayer('layer-2').apply(withTwo).layers).toHaveLength(1)
  })

  it('refuses to remove the last one, because a canvas needs something to paint on', () => {
    expect(removeLayer('layer-1').apply(DEFAULT_CANVAS)).toEqual(DEFAULT_CANVAS)
  })

  /**
   * A group carries its subtree out with it, so counting the document's paintable layers is not
   * the question — what stays is. A folder holding every pixel layer answers "two paintable" and
   * empties the stack, which `deserializeCanvas` reads back as a blank default: the size, the
   * colour mode and the bit depth of the picture go with it.
   */
  it('refuses a group that would take everything paintable with it', () => {
    const folded = groupLayers(['layer-1', 'layer-2'], 'g', 'Group').apply(withTwo)

    expect(removeLayer('g').apply(folded)).toBe(folded)
  })

  it('removes a group the stack can do without', () => {
    const three = addLayer(layerFixture({ id: 'layer-3' })).apply(withTwo)
    const folded = groupLayers(['layer-1'], 'g', 'Group').apply(three)

    expect(allLayers(removeLayer('g').apply(folded).layers).map(layer => layer.id)).toEqual([
      'layer-2',
      'layer-3',
    ])
  })

  it('moves the selection to a neighbour rather than leaving it dangling', () => {
    const state = removeLayer('layer-2').apply(withTwo)
    expect(state.activeLayerId).toBe('layer-1')
  })

  it('puts the layer back at its original index', () => {
    const three = addLayer({ ...second, id: 'layer-3' }).apply(withTwo)
    const command = removeLayer('layer-2')
    const restored = command.revert(command.apply(three))
    expect(restored.layers.map(layer => layer.id)).toEqual(['layer-1', 'layer-2', 'layer-3'])
  })

  it('gives the selection back on undo', () => {
    const command = removeLayer('layer-2')
    expect(command.revert(command.apply(withTwo)).activeLayerId).toBe('layer-2')
  })
})

describe('moveLayer', () => {
  it('moves a layer down the stack', () => {
    const state = moveLayer('layer-2', null, 0).apply(withTwo)
    expect(state.layers.map(layer => layer.id)).toEqual(['layer-2', 'layer-1'])
  })

  it('puts the order back on revert', () => {
    const command = moveLayer('layer-2', null, 0)
    const back = command.revert(command.apply(withTwo))
    expect(back.layers.map(layer => layer.id)).toEqual(['layer-1', 'layer-2'])
  })

  // A negative index is the case that bites: `splice` would count it from the end of the stack.
  it('holds an index outside the stack at its edges', () => {
    const withThree = addLayer(layerFixture({ id: 'layer-3' })).apply(withTwo)

    expect(
      moveLayer('layer-1', null, -1)
        .apply(withThree)
        .layers.map(layer => layer.id),
    ).toEqual(['layer-1', 'layer-2', 'layer-3'])
    expect(
      moveLayer('layer-1', null, 99)
        .apply(withThree)
        .layers.map(layer => layer.id),
    ).toEqual(['layer-2', 'layer-3', 'layer-1'])
  })
})

describe('single-field edits', () => {
  it('sets and reverts opacity', () => {
    const command = setLayerOpacity('layer-2', 0.25)
    const applied = command.apply(withTwo)
    expect(layerById(applied, 'layer-2')?.opacity).toBe(0.25)
    expect(layerById(command.revert(applied), 'layer-2')?.opacity).toBe(1)
  })

  it('bounds an opacity out of range', () => {
    expect(layerById(setLayerOpacity('layer-2', 5).apply(withTwo), 'layer-2')?.opacity).toBe(1)
  })

  it('toggles visibility', () => {
    expect(layerById(setLayerVisible('layer-2', false).apply(withTwo), 'layer-2')?.visible).toBe(
      false,
    )
  })

  it('renames', () => {
    expect(layerById(renameLayer('layer-2', 'Sky').apply(withTwo), 'layer-2')?.name).toBe('Sky')
  })
})

describe('selectLayer', () => {
  it('selects without touching the stack', () => {
    expect(selectLayer(withTwo, 'layer-1').layers).toEqual(withTwo.layers)
    expect(selectLayer(withTwo, 'layer-1').activeLayerId).toBe('layer-1')
  })
})

describe('through the shared history', () => {
  it('undoes a rename back to the previous name', () => {
    const [applied, history] = run(withTwo, emptyHistory(), renameLayer('layer-2', 'Sky'))
    const [back] = undo(applied, history)
    expect(layerById(back, 'layer-2')?.name).toBe('Paint')
  })
})

const stack = (...names: string[]): CanvasState => ({
  ...DEFAULT_CANVAS,
  layers: names.map(name => pixelLayer(name, name)),
  activeLayerId: names[0] ?? null,
})

const namesOf = (state: CanvasState): string[] => state.layers.map(layer => layer.id)

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

describe('groupLayers', () => {
  it('wraps the chosen layers where the topmost of them stood', () => {
    const [after] = roundTrip(stack('a', 'b', 'c'), groupLayers(['a', 'b'], 'g', 'Group'))

    expect(namesOf(after)).toEqual(['g', 'c'])
    expect(allLayers(after.layers).map(layer => layer.id)).toEqual(['g', 'a', 'b', 'c'])
  })

  it('keeps the group under what already covered it', () => {
    const [after] = roundTrip(stack('a', 'b', 'c'), groupLayers(['b', 'c'], 'g', 'Group'))

    expect(namesOf(after)).toEqual(['a', 'g'])
  })

  /**
   * A group holds no pixels, so `paintTarget` refuses it: arming one left the brush drawing
   * nothing at all, silently, which is the state `deserializeCanvas` refuses to even load.
   */
  it('arms the topmost layer it wrapped rather than the group itself', () => {
    const [after] = roundTrip(stack('a', 'b'), groupLayers(['a'], 'g', 'Group'))

    expect(after.activeLayerId).toBe('a')
  })

  it('reaches into a nested group for something to arm', () => {
    const nested = groupLayer('inner', 'Inner', [pixelLayer('deep', 'Deep')])
    const before: CanvasState = { ...DEFAULT_CANVAS, layers: [nested], activeLayerId: 'deep' }
    const [after] = roundTrip(before, groupLayers(['inner'], 'g', 'Group'))

    expect(after.activeLayerId).toBe('deep')
  })

  it('does nothing when no named layer is there', () => {
    const before = stack('a')
    const [after] = roundTrip(before, groupLayers(['missing'], 'g', 'Group'))

    expect(after).toBe(before)
  })

  it('puts the stack back on undo', () => {
    const before = stack('a', 'b', 'c')
    const [, reverted] = roundTrip(before, groupLayers(['a', 'b'], 'g', 'Group'))

    expect(reverted.layers).toEqual(before.layers)
    expect(reverted.activeLayerId).toBe(before.activeLayerId)
  })
})

describe('ungroupLayer', () => {
  it('leaves the children where the group stood', () => {
    const grouped = groupLayers(['a', 'b'], 'g', 'Group').apply(stack('a', 'b', 'c'))
    const [after] = roundTrip(grouped, ungroupLayer('g'))

    expect(namesOf(after)).toEqual(['a', 'b', 'c'])
  })

  it('leaves a layer that is not a group alone', () => {
    const before = stack('a', 'b')
    const [after] = roundTrip(before, ungroupLayer('a'))

    expect(after).toBe(before)
  })
})

describe('mergeDown', () => {
  it('keeps the lower layer, which is the texture the merge is composited into', () => {
    const [after] = roundTrip(stack('a', 'b', 'c'), mergeDown('b'))

    expect(namesOf(after)).toEqual(['a', 'c'])
    expect(after.activeLayerId).toBe('a')
  })

  // Nothing to merge into: the gesture is a no-op rather than a layer quietly lost.
  it('leaves the bottom layer alone', () => {
    const before = stack('a', 'b')
    const [after] = roundTrip(before, mergeDown('a'))

    expect(after).toBe(before)
  })
})

describe('flatten', () => {
  it('leaves one layer, armed', () => {
    const [after, reverted] = roundTrip(stack('a', 'b', 'c'), flatten('flat', 'Background'))

    expect(namesOf(after)).toEqual(['flat'])
    expect(after.activeLayerId).toBe('flat')
    expect(namesOf(reverted)).toEqual(['a', 'b', 'c'])
  })
})

describe('duplicateLayer', () => {
  it('drops the copy directly above its source and arms it', () => {
    const [after] = roundTrip(stack('a', 'b'), duplicateLayer('a', 'a-copy', 'a copy', ids()))

    expect(namesOf(after)).toEqual(['a', 'a-copy', 'b'])
    expect(after.activeLayerId).toBe('a-copy')
  })

  it('copies what the layer looked like, not just its name', () => {
    const before: CanvasState = {
      ...DEFAULT_CANVAS,
      layers: [{ ...pixelLayer('a', 'A'), opacity: 0.25, blend: 'multiply' }],
      activeLayerId: 'a',
    }
    const [after] = roundTrip(before, duplicateLayer('a', 'copy', 'A copy', ids()))
    const copy = layerById(after, 'copy')

    expect(copy?.opacity).toBe(0.25)
    expect(copy?.blend).toBe('multiply')
  })
})

/**
 * The distinction the whole model turns on: the canvas is a window onto layers that may be
 * larger than it. Changing the window is not resampling what is behind it.
 */
describe('setPixelCell', () => {
  it('puts the document on a grid and takes it back off', () => {
    const [onAGrid] = roundTrip(DEFAULT_CANVAS, setPixelCell(16))

    expect(onAGrid.pixelCell).toBe(16)
    expect(setPixelCell(null).apply(onAGrid).pixelCell).toBeNull()
  })

  // A number field writes on every blur, and each of those would be a ⌘Z that does nothing.
  it('costs no undo entry when the grid is already what is asked for', () => {
    const onAGrid = setPixelCell(16).apply(DEFAULT_CANVAS)
    const [, history] = run(onAGrid, emptyHistory(), setPixelCell(16))

    expect(history.past).toEqual([])
  })

  /**
   * `Math.max(1, NaN)` is `NaN`, and `JSON.stringify` writes that as `null`: the session
   * would paint nothing while the file reopened clean, with nothing said anywhere.
   */
  it('reads a cell no document can hold as no grid at all', () => {
    expect(setPixelCell(Number.NaN).apply(DEFAULT_CANVAS).pixelCell).toBeNull()
    expect(setPixelCell(Number.POSITIVE_INFINITY).apply(DEFAULT_CANVAS).pixelCell).toBeNull()
    expect(setPixelCell(0).apply(DEFAULT_CANVAS).pixelCell).toBeNull()
    expect(setPixelCell(1e308).apply(DEFAULT_CANVAS).pixelCell).toBe(8192)
  })
})

describe('resizeCanvas against resizeImage', () => {
  it('moves the frame without scaling anything', () => {
    const [after] = roundTrip(stack('a'), resizeCanvas(400, 300, { x: 10, y: 20 }))

    expect([after.width, after.height]).toEqual([400, 300])
    expect(layerById(after, 'a')?.transform.scaleX).toBe(1)
    expect(layerById(after, 'a')?.transform.x).toBe(10)
  })

  // A size field commits on every blur, and a scrub that came back is one of those.
  it('refuses the size the document already has, unless the frame moves', () => {
    expect(resizeCanvas(1024, 1024, { x: 0, y: 0 }).refuses?.(DEFAULT_CANVAS)).toBe(true)
    expect(resizeCanvas(1024, 1024, { x: 4, y: 0 }).refuses?.(DEFAULT_CANVAS)).toBe(false)
    expect(resizeImage(1024, 1024).refuses?.(DEFAULT_CANVAS)).toBe(true)
  })

  it('scales the layers with the frame', () => {
    const [after] = roundTrip({ ...stack('a'), width: 100, height: 100 }, resizeImage(200, 50))

    expect([after.width, after.height]).toEqual([200, 50])
    expect(layerById(after, 'a')?.transform.scaleX).toBe(2)
    expect(layerById(after, 'a')?.transform.scaleY).toBe(0.5)
  })

  /**
   * The pixels are carried over unscaled into the bigger surface, so they still occupy the OLD
   * 100 × 100 region of it — and a resample has to land that region on the whole new frame.
   * Scaling `x` alone left it at half the document away, and asserting the factors alone could
   * not see it.
   */
  it('lands the pixels on the frame they were resampled onto', () => {
    const before = { ...stack('a'), width: 100, height: 100 }
    const [after] = roundTrip(before, resizeImage(200, 200))
    const transform = layerById(after, 'a')?.transform
    if (!transform) throw new Error('the fixture has no layer')
    const matrix = layerMatrix(transform, { width: after.width, height: after.height })

    expect(applyTo(matrix, { x: 0, y: 0 })).toMatchObject({
      x: expect.closeTo(0, 6),
      y: expect.closeTo(0, 6),
    })
    expect(applyTo(matrix, { x: 100, y: 100 })).toMatchObject({
      x: expect.closeTo(200, 6),
      y: expect.closeTo(200, 6),
    })
  })

  it('carries a displaced layer to the place the resample sends it', () => {
    const before = {
      ...stack('a'),
      width: 100,
      height: 100,
      layers: [{ ...pixelLayer('a', 'A'), transform: { ...IDENTITY, x: 10, y: 20 } }],
    }
    const [after] = roundTrip(before, resizeImage(200, 200))
    const transform = layerById(after, 'a')?.transform
    if (!transform) throw new Error('the fixture has no layer')

    expect(
      applyTo(layerMatrix(transform, { width: after.width, height: after.height }), {
        x: 0,
        y: 0,
      }),
    ).toMatchObject({ x: expect.closeTo(20, 6), y: expect.closeTo(40, 6) })
  })

  it('refuses a frame with no surface rather than producing one', () => {
    const [after] = roundTrip(stack('a'), resizeCanvas(0, -5, { x: 0, y: 0 }))

    expect([after.width, after.height]).toEqual([1, 1])
  })

  it('gives the frame back on undo', () => {
    const before = { ...stack('a'), width: 100, height: 100 }
    const [, reverted] = roundTrip(before, resizeImage(200, 200))

    expect(reverted.layers).toEqual(before.layers)
  })
})

describe('cropToRect', () => {
  it('brings the frame onto the rectangle', () => {
    const [after] = roundTrip(stack('a'), cropToRect({ x: 30, y: 40, width: 100, height: 80 }))

    expect([after.width, after.height]).toEqual([100, 80])
  })

  /**
   * The pixels move, the layers do not. A surface is document-sized and `CanvasEngine.resurface`
   * recuts it to the kept region, so the picture already starts where the new frame expects it —
   * sliding the transforms as well would displace it twice and empty one side of the document.
   */
  it('leaves the layer transforms where they were, since the surfaces carry the move', () => {
    const before = stack('a')
    const [after] = roundTrip(before, cropToRect({ x: 30, y: 40, width: 100, height: 80 }))

    expect(layerById(after, 'a')?.transform).toEqual(layerById(before, 'a')?.transform)
  })

  it('gives the frame back on undo', () => {
    const before = { ...stack('a'), width: 100, height: 100 }
    const [, reverted] = roundTrip(before, cropToRect({ x: 30, y: 40, width: 50, height: 50 }))

    expect([reverted.width, reverted.height]).toEqual([100, 100])
  })
})

/**
 * Grouping is what turned the stack into a tree, and every operation below used to read only its
 * root. Each of these reproduces a bug that shipped in the first cut of the model.
 */
