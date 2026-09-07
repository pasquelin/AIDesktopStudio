import { describe, expect, it } from 'vitest'
import {
  blurRadius,
  BRUSH_SETTINGS_BY_TOOL,
  BRUSH_SIZE,
  brushSettingsOf,
  DEFAULT_BRUSH,
  readsBrushSetting,
  resizedBrush,
  type BrushSetting,
  type BrushSettings,
} from './brush'

/**
 * The table the bar hides its controls from and the engine reads its softness out of. What it
 * closes is a slider that moves nothing: the hardness under the pencil was live and draggable
 * for as long as the two sides answered the question separately.
 */
describe('which settings a tool reads', () => {
  const SETTINGS: readonly BrushSetting[] = ['size', 'hardness', 'opacity']

  it('answers for every tool of the engine, which the typecheck is what enforces', () => {
    // Named so the rules below cannot pass on a table someone emptied.
    expect(Object.keys(BRUSH_SETTINGS_BY_TOOL)).toEqual(
      expect.arrayContaining(['brush', 'pencil', 'eraser', 'shape', 'fill', 'picker']),
    )
  })

  it('names only settings that exist, and never the same one twice', () => {
    for (const [tool, reads] of Object.entries(BRUSH_SETTINGS_BY_TOOL)) {
      expect(
        reads.filter(one => !SETTINGS.includes(one)),
        tool,
      ).toEqual([])
      expect(new Set(reads).size, tool).toBe(reads.length)
    }
  })

  /**
   * The one the engine asks for. `softness()` reads this row rather than testing the tool, so
   * a second name here would feather a stroke the bar promised was hard.
   */
  it('gives hardness to the brush and to nothing else', () => {
    const feathering = Object.entries(BRUSH_SETTINGS_BY_TOOL)
      .filter(([, reads]) => reads.includes('hardness'))
      .map(([tool]) => tool)

    expect(feathering).toEqual(['brush'])
  })

  // What the bar hides and the engine stops reading, from the same call.
  it('takes the hardness away on a pixel grid, and nothing else', () => {
    expect(brushSettingsOf('brush', 16)).toEqual(['size', 'opacity'])
    expect(brushSettingsOf('brush', null)).toEqual(['size', 'hardness', 'opacity'])
  })

  it('gives the eraser its size, which is the one thing a stamp of white still needs', () => {
    expect(readsBrushSetting('eraser', 'size')).toBe(true)
    expect(readsBrushSetting('eraser', 'hardness')).toBe(false)
  })

  // A tool that reads nothing is an answer; a tool missing from the table is an oversight, and
  // the typecheck is what tells them apart — `Record<CanvasTool, …>` refuses an absent row.
  it('answers for the tools that paint nothing at all', () => {
    expect(BRUSH_SETTINGS_BY_TOOL.picker).toEqual([])
    expect(BRUSH_SETTINGS_BY_TOOL.text).toEqual([])
    expect(readsBrushSetting('hand', 'size')).toBe(false)
  })
})

describe('stepping the brush size', () => {
  it('grows and shrinks by a ratio, so a step feels the same at either end of the scale', () => {
    // A fixed number of pixels would crawl at 400 and leap at 4.
    expect(resizedBrush(DEFAULT_BRUSH, 'larger').size).toBe(34)
    expect(resizedBrush(DEFAULT_BRUSH, 'smaller').size).toBe(17)
  })

  it('comes back where it started after a step each way', () => {
    const grown = resizedBrush(DEFAULT_BRUSH, 'larger')

    expect(resizedBrush(grown, 'smaller').size).toBe(DEFAULT_BRUSH.size)
  })

  /**
   * The ratio rounds to a standstill at the bottom of the scale: a 1 px brush asked to grow by
   * √2 rounds back to 1, and the key would look broken exactly where the steps matter most.
   */
  it('always moves by at least one pixel', () => {
    expect(resizedBrush({ ...DEFAULT_BRUSH, size: 1 }, 'larger').size).toBe(2)
    expect(resizedBrush({ ...DEFAULT_BRUSH, size: 2 }, 'smaller').size).toBe(1)
    expect(resizedBrush({ ...DEFAULT_BRUSH, size: 3 }, 'smaller').size).toBe(2)
  })

  it('stops at both ends rather than wrapping or running away', () => {
    expect(resizedBrush({ ...DEFAULT_BRUSH, size: BRUSH_SIZE.min }, 'smaller').size).toBe(
      BRUSH_SIZE.min,
    )
    expect(resizedBrush({ ...DEFAULT_BRUSH, size: BRUSH_SIZE.max }, 'larger').size).toBe(
      BRUSH_SIZE.max,
    )
  })

  it('lands exactly on the ceiling rather than overshooting it', () => {
    const near = resizedBrush({ ...DEFAULT_BRUSH, size: BRUSH_SIZE.max - 1 }, 'larger')

    expect(near.size).toBe(BRUSH_SIZE.max)
  })

  it('leaves every other setting of the brush alone', () => {
    const tuned = { ...DEFAULT_BRUSH, hardness: 0.2, opacity: 0.5, color: 0xff0000 }
    const stepped = resizedBrush(tuned, 'larger')

    expect(stepped).toEqual({ ...tuned, size: stepped.size })
  })

  // A size that arrives from a restored session, or from a hand-edited document.
  it('drags a size from outside the scale back onto it', () => {
    expect(resizedBrush({ ...DEFAULT_BRUSH, size: 9000 }, 'larger').size).toBe(BRUSH_SIZE.max)
    expect(resizedBrush({ ...DEFAULT_BRUSH, size: 0 }, 'smaller').size).toBe(BRUSH_SIZE.min)
  })
})

describe('the brush the studio opens on', () => {
  it('sits inside its own scale', () => {
    expect(DEFAULT_BRUSH.size).toBeGreaterThanOrEqual(BRUSH_SIZE.min)
    expect(DEFAULT_BRUSH.size).toBeLessThanOrEqual(BRUSH_SIZE.max)
  })
})

/**
 * The number decides two things at once — how strong the filter is, and how far the stroke
 * reaches for the undo. A soft brush whose reach was computed from the disc alone would put back
 * everything but the fringe it had just laid down.
 */
describe('how far the edge of a dab is spread', () => {
  const brush = (hardness: number, size = 24): BrushSettings => ({
    ...DEFAULT_BRUSH,
    hardness,
    size,
  })

  it('spreads nothing at all under a fully hard edge', () => {
    expect(blurRadius(brush(1))).toBe(0)
  })

  it('reaches half the radius when the edge is fully soft', () => {
    // A solid core at every setting: a full radius would leave a cloud with no mark in it.
    expect(blurRadius(brush(0, 40))).toBe(10)
  })

  it('grows as the edge softens, and with the brush', () => {
    expect(blurRadius(brush(0.5, 40))).toBe(5)
    expect(blurRadius(brush(0.5, 80))).toBe(10)
    expect(blurRadius(brush(0.25, 40))).toBe(7.5)
  })

  it('answers nothing where the answer would be too small to show', () => {
    // A 4 px brush at 0.8 would spread by 0.2 px: a whole filter pass, and no pixel moved.
    expect(blurRadius(brush(0.8, 4))).toBe(0)
    expect(blurRadius(brush(0, 1))).toBe(0)
  })

  /** The threshold itself, from both sides: half a pixel shows, a hair under it does not. */
  it('keeps a spread of exactly half a pixel, and drops anything under it', () => {
    // 2 px at hardness 0 spreads by exactly 0.5.
    expect(blurRadius(brush(0, 2))).toBe(0.5)
    // 4 px at 0.5 spreads by 0.5 as well; a hair harder and it falls under.
    expect(blurRadius(brush(0.5, 4))).toBe(0.5)
    expect(blurRadius(brush(0.501, 4))).toBe(0)
  })

  it('holds a hardness read from outside the unit interval', () => {
    // A hand-edited setting is user territory. Held at both ends: below zero it would spread
    // further than the radius — a dab with no middle — and above one it would spread backwards,
    // which the floor would then hide as a zero that looks deliberate.
    expect(blurRadius(brush(-1, 40))).toBe(10)
    expect(blurRadius(brush(1.5, 40))).toBe(0)
    // Read unclamped, a hardness of 2 gives −10 and a hardness of 3 gives −20: distinct numbers
    // where the clamp gives one. Both must answer the same nothing.
    expect(blurRadius(brush(3, 40))).toBe(blurRadius(brush(2, 40)))
  })

  it('spreads the default brush a little, which is what "mostly hard" means', () => {
    const spread = blurRadius(DEFAULT_BRUSH)

    expect(spread).toBeGreaterThan(0)
    expect(spread).toBeLessThan(DEFAULT_BRUSH.size / 4)
  })
})
