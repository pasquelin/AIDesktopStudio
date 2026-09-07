import { clamp } from '@shared/numeric'
import type { CanvasTool } from './canvasTool'

/**
 * What the brush, the eraser and the shape stroke are set to. Session state, not document
 * state: it is held by React and pushed into the engine, which never reads it back.
 *
 * It lives here rather than beside the engine so that the toolbar can name it without pulling
 * Pixi into a test that only wanted a number.
 */
export type BrushSettings = {
  /** A diameter, in document pixels. */
  size: number
  /** 0 to 1. 1 is a hard edge, 0 a fully feathered one. */
  hardness: number
  opacity: number
  /** Packed RGB, the form Pixi takes. */
  color: number
}

/**
 * The colour is NOT one, and that is what this type says: it belongs to the DOCUMENT rather than
 * to the brush — offered whatever the armed tool, exactly as `ImageDocumentBrush` draws it.
 */
export type BrushSetting = Exclude<keyof BrushSettings, 'color'>

/**
 * Which of the three each tool actually reads. An empty row means it reads no BRUSH setting —
 * the bucket still paints in the colour, which is not one.
 *
 * **It is the source, not a description of one.** `softness()` asks it rather than testing the
 * tool itself, so the bar and the engine cannot disagree about the hardness: a control that
 * moves nothing is the defect this table exists to close, and a second spelling of the rule
 * would reopen it on the first edit.
 *
 * Exhaustive by the typecheck: a tool added to `CanvasTool` without a row here does not build.
 * A tool that reads nothing gets an empty row rather than being left out — "reads nothing" is
 * an answer, "not in the table" is an oversight.
 */
export const BRUSH_SETTINGS_BY_TOOL: Readonly<Record<CanvasTool, readonly BrushSetting[]>> = {
  brush: ['size', 'hardness', 'opacity'],
  // Hard by definition, and that is the whole of what tells it from the brush.
  pencil: ['size', 'opacity'],
  eraser: ['size', 'opacity'],
  // `size` is the stroke's width here rather than a disc's diameter.
  shape: ['size', 'opacity'],
  fill: [],
  // A caption's colour and size live on the layer and are edited in the inspector.
  text: [],
  select: [],
  smartSelect: [],
  move: [],
  hand: [],
  crop: [],
  comment: [],
  picker: [],
}

/** The table's row, minus what a pixel grid takes away: nothing feathers on a grid. */
export function brushSettingsOf(tool: CanvasTool, cell: number | null): readonly BrushSetting[] {
  const reads = BRUSH_SETTINGS_BY_TOOL[tool]
  return cell === null ? reads : reads.filter(setting => setting !== 'hardness')
}

export function readsBrushSetting(tool: CanvasTool, setting: BrushSetting): boolean {
  return BRUSH_SETTINGS_BY_TOOL[tool].includes(setting)
}

/**
 * One pixel to five hundred and twelve. The floor is the smallest dab that leaves a mark; the
 * ceiling is half a 1024 document, past which a brush stops being a brush and becomes a fill.
 */
export const BRUSH_SIZE = { min: 1, max: 512 }

export const DEFAULT_BRUSH: BrushSettings = {
  size: 24,
  hardness: 0.8,
  opacity: 1,
  color: 0x000000,
}

/**
 * How far a fully soft edge reaches, as a fraction of the radius. Half: the dab keeps a solid
 * core at every setting, where a full radius would leave a cloud with no mark in the middle —
 * softness is meant to feather an edge, not to dissolve the brush.
 */
const FEATHER = 0.5

/**
 * Under this, a blur costs a full filter pass and moves no pixel a user can see: half a pixel of
 * spread is below what the edge of a disc already owes to antialiasing.
 */
const LEAST_VISIBLE_BLUR = 0.5

/**
 * How far the edge of a dab is spread, in document pixels — zero for a hard edge, and zero as
 * well whenever the answer would be too small to show.
 *
 * Here rather than in the engine so it can be read without Pixi: the number decides both the
 * filter's strength and how far the stroke reaches, and those two must not be computed twice.
 */
export function blurRadius(brush: BrushSettings): number {
  const spread = (1 - clamp(brush.hardness, 0, 1)) * (brush.size / 2) * FEATHER
  return spread < LEAST_VISIBLE_BLUR ? 0 : spread
}

/**
 * A step of the scale, as a ratio rather than a count of pixels: a fixed step crawls at 400 px
 * and leaps at 4. Half an octave, which is what puts a handful of presses between the extremes.
 */
const STEP = Math.SQRT2

export function resizedBrush(brush: BrushSettings, towards: 'larger' | 'smaller'): BrushSettings {
  const from = clamp(brush.size, BRUSH_SIZE.min, BRUSH_SIZE.max)
  // At least a pixel either way: at the bottom of the scale the ratio rounds to a standstill,
  // and a key that does nothing reads as a broken key rather than as a floor.
  const stepped =
    towards === 'larger'
      ? Math.max(from + 1, Math.round(from * STEP))
      : Math.min(from - 1, Math.round(from / STEP))

  return { ...brush, size: clamp(stepped, BRUSH_SIZE.min, BRUSH_SIZE.max) }
}
