import { describe, expect, it } from 'vitest'
import { NEUTRAL_ADJUSTMENTS } from '@shared/domain/adjustments'
import type { Command } from '../core/history'
import {
  addLayer,
  duplicateLayer,
  flipImage,
  groupLayers,
  moveGuide,
  moveLayer,
  removeGuide,
  removeLayer,
  rotateImage,
  setLayerAdjustment,
  setLayerBlend,
  resizeCaption,
  setLayerText,
  translateLayer,
  ungroupLayer,
} from './commands'
import { layerFixture } from './canvas-fixtures'
import {
  adjustmentLayer,
  DEFAULT_CANVAS,
  groupLayer,
  IDENTITY,
  layerById,
  pixelLayer,
  textLayer,
  type CanvasState,
  type Rect,
  type Transform,
} from './canvasState'
import type { Size } from '../core/geometry'
import { layerMatrix, mapRect } from './layerSpace'

const second = layerFixture()
const withTwo: CanvasState = addLayer(second).apply(DEFAULT_CANVAS)
const withGuides: CanvasState = {
  ...DEFAULT_CANVAS,
  guides: [
    { id: 'g1', axis: 'x', position: 10 },
    { id: 'g2', axis: 'y', position: 20 },
  ],
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

const holding = (transform: Transform): CanvasState => ({
  ...DEFAULT_CANVAS,
  width: 100,
  height: 200,
  layers: [{ ...pixelLayer('a', 'A'), transform }],
  activeLayerId: 'a',
})

const placed = (x: number, y: number): CanvasState => holding({ ...IDENTITY, x, y })

const turnedBy = (rotation: number): CanvasState => holding({ ...IDENTITY, rotation })

const transformOf = (state: CanvasState) => state.layers[0]?.transform

const contentOf = (state: CanvasState, frame?: Size): Rect => {
  const box = { width: state.width, height: state.height }
  const transform = transformOf(state)
  if (!transform) throw new Error('the fixture has no layer')

  return mapRect(layerMatrix(transform, box), { x: 0, y: 0, ...(frame ?? box) })
}

const near = (rect: Rect) => ({
  x: expect.closeTo(rect.x, 6),
  y: expect.closeTo(rect.y, 6),
  width: expect.closeTo(rect.width, 6),
  height: expect.closeTo(rect.height, 6),
})

const captioned = (x: number, y: number): CanvasState => ({
  ...DEFAULT_CANVAS,
  width: 100,
  height: 200,
  layers: [textLayer('t', 'test', { x, y }, { width: 40, height: 10 })],
  activeLayerId: 't',
})

describe('flipping and turning the whole document', () => {
  // A negative scale rather than rewritten pixels: flipping twice is exactly the identity, which
  // resampling twice would not be.
  it('mirrors without touching a single pixel', () => {
    const [after] = roundTrip(placed(10, 20), flipImage('horizontal'))

    expect(transformOf(after)).toMatchObject({ scaleX: -1 })
  })

  // The frame is [0, 100]: a layer that sat at [10, 110] mirrors onto [-10, 90]. Writing
  // `width - x` sent it to [90, 190] — one whole document out, and the screen went blank.
  it('mirrors the pixels onto the other side of the frame', () => {
    const [after] = roundTrip(placed(10, 20), flipImage('horizontal'))

    expect(contentOf(after)).toMatchObject(near({ x: -10, y: 20, width: 100, height: 200 }))
  })

  it('mirrors the other way on the other axis', () => {
    const [after] = roundTrip(placed(10, 20), flipImage('vertical'))

    expect(transformOf(after)).toMatchObject({ scaleY: -1 })
    expect(contentOf(after)).toMatchObject(near({ x: 10, y: -20, width: 100, height: 200 }))
  })

  // The layer covers the frame exactly, so mirroring must leave it covering the frame exactly.
  it('leaves a layer that fills the frame filling it', () => {
    const [after] = roundTrip(placed(0, 0), flipImage('horizontal'))

    expect(contentOf(after)).toMatchObject(near({ x: 0, y: 0, width: 100, height: 200 }))
  })

  // A turned layer sweeps the other way once mirrored: the angles turn with the scale, or the
  // content lands somewhere the mirror never sent it.
  it('mirrors a turned layer onto its own reflection', () => {
    const turned = turnedBy(Math.PI / 6)
    const [after] = roundTrip(turned, flipImage('horizontal'))
    const before = contentOf(turned)

    expect(contentOf(after)).toMatchObject(near({ ...before, x: 100 - before.x - before.width }))
  })

  it('puts everything back on an undo', () => {
    const before = placed(10, 20)
    const [, reverted] = roundTrip(before, flipImage('horizontal'))

    expect(reverted).toEqual(before)
  })

  /** Records which way the engine was told to turn its pixels, and in what order. */
  const turns = () => {
    const asked: boolean[] = []
    return Object.assign({ turn: (clockwise: boolean) => void asked.push(clockwise) }, { asked })
  }

  /**
   * The pixels turn from INSIDE the command, so an undo unturns them. Driven by the caller
   * instead, ⌘Z restored a portrait frame over landscape textures and the recut that followed
   * took half of every layer — the very loss this command exists to avoid.
   */
  it('turns the pixels one way and back on an undo', () => {
    const port = turns()
    const command = rotateImage(true, port)

    const after = command.apply(placed(10, 20))
    command.revert(after)

    expect(port.asked).toEqual([true, false])
  })

  it('turns them the other way on a redo', () => {
    const port = turns()
    const command = rotateImage(true, port)
    const after = command.apply(placed(10, 20))
    command.apply(command.revert(after))

    expect(port.asked).toEqual([true, false, true])
  })

  // The frame turns with the picture: a portrait becomes a landscape.
  it('swaps the sides of the frame a quarter turn', () => {
    const [after] = roundTrip(placed(10, 20), rotateImage(true, turns()))

    expect(after).toMatchObject({ width: 200, height: 100 })
  })

  /**
   * The turn lives in the pixels — `CanvasEngine.turnQuarter` transposes the surfaces first — so
   * the angle is NOT what to assert here. What the eye checks is that a layer filling the frame
   * still fills it once the frame has traded its sides.
   */
  it('leaves a layer that fills the frame filling the turned one', () => {
    const [after] = roundTrip(placed(0, 0), rotateImage(true, turns()))

    expect(contentOf(after)).toMatchObject(near({ x: 0, y: 0, width: 200, height: 100 }))
  })

  // The layer covered [10, 110] × [20, 220]; turning that clockwise in a 100 × 200 frame sends
  // its corners to (180, 10) and (−20, 110).
  it('carries a displaced layer to the place the turn sends it', () => {
    const [after] = roundTrip(placed(10, 20), rotateImage(true, turns()))

    expect(contentOf(after)).toMatchObject(near({ x: -20, y: 10, width: 200, height: 100 }))
  })

  it('turns the other way when asked', () => {
    const [after] = roundTrip(placed(10, 20), rotateImage(false, turns()))

    expect(contentOf(after)).toMatchObject(near({ x: 20, y: -10, width: 200, height: 100 }))
  })

  // Two scales that differ have to trade places with the sides they scale, or a layer stretched
  // across a portrait comes back stretched across the width of a landscape.
  it('trades the two scales of a stretched layer', () => {
    const stretched = holding({ ...IDENTITY, scaleX: 2, scaleY: 0.5 })
    const [after] = roundTrip(stretched, rotateImage(true, turns()))

    expect(transformOf(after)).toMatchObject({ scaleX: 0.5, scaleY: 2 })
  })

  /** What a paragraph's grips describe, which `contentOf` then places for us. */
  const captionBox = (state: CanvasState): Size => {
    const layer = state.layers[0]
    if (layer?.kind !== 'text' || !layer.box) throw new Error('the fixture has no caption')

    return layer.box
  }

  /**
   * The words are redrawn from the state, so a turned surface lasts until the next edit while the
   * box never turned at all. The caption covered [10, 50] × [20, 30], which a clockwise turn in a
   * 100 × 200 frame sends to [170, 180] × [10, 50].
   */
  it('carries a caption to the place the turn sends its box', () => {
    const [after] = roundTrip(captioned(10, 20), rotateImage(true, turns()))

    expect(contentOf(after, captionBox(after))).toMatchObject(
      near({ x: 170, y: 10, width: 10, height: 40 }),
    )
  })

  // Four quarter turns are one full turn, and one full turn is where the document started.
  it('comes back to its own frame after four turns', () => {
    let state = placed(10, 20)
    for (let turn = 0; turn < 4; turn += 1) [state] = roundTrip(state, rotateImage(true, turns()))

    expect(state).toMatchObject({ width: 100, height: 200 })
  })
})

const withAdjustment: CanvasState = addLayer(adjustmentLayer('adj', 'Exposure', 'exposure')).apply(
  DEFAULT_CANVAS,
)

const warmer = { ...NEUTRAL_ADJUSTMENTS, exposure: 1.5, temperature: 0.4 }

describe('setLayerAdjustment', () => {
  it('writes the whole stack onto the adjustment layer', () => {
    const [after] = roundTrip(withAdjustment, setLayerAdjustment('adj', warmer))
    const layer = layerById(after, 'adj')

    expect(layer?.kind === 'adjustment' ? layer.values : null).toEqual(warmer)
  })

  it('gives the grading it found back on undo', () => {
    const [, reverted] = roundTrip(withAdjustment, setLayerAdjustment('adj', warmer))
    const layer = layerById(reverted, 'adj')

    expect(layer?.kind === 'adjustment' ? layer.values : null).toEqual(NEUTRAL_ADJUSTMENTS)
  })

  // Typed apart from `patch` because it is spelled on one kind of layer; a pixel one named by
  // the same id is not an adjustment that lost its values.
  it('leaves a layer of another kind untouched', () => {
    const [after] = roundTrip(withTwo, setLayerAdjustment('layer-2', warmer))

    expect(after.layers).toEqual(withTwo.layers)
  })
})

describe('setLayerText', () => {
  const withText: CanvasState = addLayer(textLayer('cap', 'Hello', { x: 10, y: 20 })).apply(
    DEFAULT_CANVAS,
  )
  const wordsOf = (state: CanvasState) => {
    const layer = layerById(state, 'cap')
    return layer?.kind === 'text' ? layer.text : null
  }

  it('rewrites only the fields it was given', () => {
    const [after] = roundTrip(withText, setLayerText('cap', { text: 'Goodbye' }))
    const layer = layerById(after, 'cap')

    expect(wordsOf(after)).toBe('Goodbye')
    expect(layer?.kind === 'text' ? layer.size : null).toBe(48)
  })

  it('puts the caption it found back on undo', () => {
    const [, reverted] = roundTrip(withText, setLayerText('cap', { text: 'Goodbye', size: 12 }))

    expect(wordsOf(reverted)).toBe('Hello')
    expect(layerById(reverted, 'cap')).toEqual(layerById(withText, 'cap'))
  })

  it('leaves a layer of another kind untouched', () => {
    const [after] = roundTrip(withTwo, setLayerText('layer-2', { text: 'Goodbye' }))

    expect(after.layers).toEqual(withTwo.layers)
  })

  /**
   * A drag, a grip and an MCP client all land here, and only the first two pass through a
   * component — which is why the rounding is the command's job rather than the caller's.
   */
  it('rounds a box it is handed to whole pixels', () => {
    const [after] = roundTrip(
      withText,
      setLayerText('cap', { box: { width: 471.5789473684211, height: 242.52 } }),
    )
    const layer = layerById(after, 'cap')

    expect(layer?.kind === 'text' ? layer.box : null).toEqual({ width: 472, height: 243 })
  })
})

describe('resizeCaption', () => {
  const withText: CanvasState = addLayer(textLayer('cap', 'Hello', { x: 10, y: 20 })).apply(
    DEFAULT_CANVAS,
  )

  // A north or west grip moves the origin as it resizes, which is why both travel together.
  it('takes the box and where it now starts in one entry', () => {
    const [after] = roundTrip(
      withText,
      resizeCaption('cap', { width: 700.6, height: 310.2 }, { x: 4, y: 6 }),
    )
    const layer = layerById(after, 'cap')

    expect(layer?.kind === 'text' ? layer.box : null).toEqual({ width: 701, height: 310 })
    expect(layer?.transform.x).toBe(4)
    expect(layer?.transform.y).toBe(6)
  })

  /**
   * Both halves or neither. Shift-resizing and a turned caption both hand back a fractional
   * origin, and rounding only the box moved the edge the grip was supposed to hold still.
   */
  it('rounds where it starts too, never one half of the pair', () => {
    const [after] = roundTrip(
      withText,
      resizeCaption('cap', { width: 300.4, height: 120.6 }, { x: 12.7, y: 30.2 }),
    )
    const layer = layerById(after, 'cap')

    expect(layer?.transform.x).toBe(13)
    expect(layer?.transform.y).toBe(30)
  })

  it('puts the caption it found back on undo', () => {
    const [, reverted] = roundTrip(
      withText,
      resizeCaption('cap', { width: 700, height: 310 }, { x: 4, y: 6 }),
    )

    expect(layerById(reverted, 'cap')).toEqual(layerById(withText, 'cap'))
  })
})

/**
 * A command reverted before it ever applied. The panel builds one per edit and the history may
 * step over an entry whose `apply` ran on another document — every command captures what it
 * needs on the way in, so with nothing captured the only honest inverse is the state itself.
 */
describe('reverting a command that never applied', () => {
  it('leaves the stack alone for a single-field edit', () => {
    expect(setLayerBlend('layer-2', 'multiply').revert(withTwo)).toBe(withTwo)
  })

  it('leaves the stack alone for a move', () => {
    expect(translateLayer('layer-2', 40, 40).revert(withTwo)).toBe(withTwo)
  })

  it('leaves the grading alone', () => {
    expect(setLayerAdjustment('adj', warmer).revert(withAdjustment).layers).toEqual(
      withAdjustment.layers,
    )
  })

  it('leaves the guides alone', () => {
    expect(moveGuide('g1', 40).revert(withGuides)).toBe(withGuides)
    expect(removeGuide('g1').revert(withGuides)).toBe(withGuides)
  })
})

/**
 * An id that names nothing — a panel row acting on a layer another window has just removed.
 * Every one of these is a no-op rather than a stack quietly rebuilt around a hole.
 */
describe('commands aimed at a layer that is gone', () => {
  it('removes nothing', () => {
    expect(removeLayer('gone').apply(withTwo)).toBe(withTwo)
  })

  it('moves nothing', () => {
    expect(moveLayer('gone', null, 0).apply(withTwo)).toBe(withTwo)
  })

  it('duplicates nothing', () => {
    expect(duplicateLayer('gone', 'copy', 'Copy', ids()).apply(withTwo)).toBe(withTwo)
  })

  it('patches nothing, and has nothing to undo', () => {
    const command = setLayerBlend('gone', 'multiply')
    const applied = command.apply(withTwo)

    expect(applied.layers).toEqual(withTwo.layers)
    expect(command.revert(applied)).toBe(applied)
  })

  it('moves no guide, and has none to put back', () => {
    const command = moveGuide('gone', 40)
    const applied = command.apply(withGuides)

    expect(applied.guides).toEqual(withGuides.guides)
    expect(command.revert(applied)).toBe(applied)
  })

  it('removes no guide, and lays none back down', () => {
    const command = removeGuide('gone')
    const applied = command.apply(withGuides)

    expect(applied.guides).toEqual(withGuides.guides)
    expect(command.revert(applied)).toBe(applied)
  })
})

/**
 * A group holds no pixels, so arming one leaves the brush drawing nothing. When a restructure
 * turns up nothing paintable, it must not point the brush at a group to fill the field.
 */
describe('restructuring around layers that hold no pixels', () => {
  const emptyGroup = (id: string): CanvasState => ({
    ...DEFAULT_CANVAS,
    layers: [groupLayer(id, 'Empty', [])],
    activeLayerId: null,
  })

  it('arms nothing when the group it wrapped holds nothing paintable', () => {
    const [after] = roundTrip(emptyGroup('g0'), groupLayers(['g0'], 'g', 'Group'))

    expect(after.activeLayerId).toBeNull()
  })

  it('leaves the selection where it was when a dissolved group held nothing paintable', () => {
    const before = { ...emptyGroup('g0'), activeLayerId: 'elsewhere' }
    const [after] = roundTrip(before, ungroupLayer('g0'))

    expect(after.layers).toEqual([])
    expect(after.activeLayerId).toBe('elsewhere')
  })
})
