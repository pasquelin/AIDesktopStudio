/**
 * The animation band, painted: the ruler, one row per subject or channel, the keys as diamonds,
 * and the head.
 *
 * A canvas rather than the DOM, for the same reason the montage is one: a rig with forty bones
 * keyed every frame is thousands of diamonds, and that many elements is a scroll that stutters.
 * The header column beside it stays DOM, where the controls belong — see `AnimationHeaders`.
 */
import type { Us } from '@shared/domain/time'
import type { CameraShot } from '@shared/domain/animation'
import { placeRows } from '../timeline/band'
import { paintBandEnd } from '../timeline/bandEnd'
import { paintBarGrips, paintClipOn } from '../timeline/painter'
import type { Clip } from '../timeline/timelineState'
import { paintRuler, readRulerStyle } from '../timeline/ruler'
import { RULER_HEIGHT, timeToX, type Viewport } from '../timeline/timelineGeometry'
import { memoPalette, rootColour, rootFont } from '../core/palette'
import type { Size } from '../core/geometry'
import type { AnimationRow, ChannelRow, ClipBlock, ShotBar, SubjectRow } from './bandRows'

/** Half the diagonal of a key, in pixels. A diamond reads at this size and crowds beyond it. */
const KEY_REACH = 4

/** A channel's diamonds are drawn smaller than a subject's, as its row is shorter. */
const CHANNEL_REACH = 3

/** How far a block sits inside its row, so two stacked blocks do not read as one. */
const BLOCK_INSET = 2

/** Below this a name is one clipped letter, which says less than the bar's own colour does. */
const BLOCK_LABEL_MIN = 28

/** Enough to clear the grip at the block's own edge. */
const BLOCK_LABEL_PAD = 6

const BLOCK_FAMILY = 'ui-sans-serif, system-ui'

const BLOCK_SIZE = '11px'

type Palette = {
  ruler: string
  row: string
  rowAlt: string
  border: string
  key: string
  keySelected: string
  block: string
  blockPicked: string
  blockEdge: string
  blockLabel: string
  blockFont: string
  playhead: string
  muted: string
  text: string
  font: string
}

/** The name inside a bar, at the size the ruler labels use — the smallest the scale carries. */
const BAR_SIZE = '10px'
const BAR_FAMILY = 'system-ui, sans-serif'

const readPalette = memoPalette((): Palette => ({
  ruler: rootColour('--color-chassis'),
  row: rootColour('--color-panel'),
  rowAlt: rootColour('--color-surface'),
  border: rootColour('--color-border'),
  key: rootColour('--color-muted'),
  keySelected: rootColour('--color-accent'),
  block: rootColour('--color-elevated'),
  // What is CHOSEN, and a block is a content rather than a control — see the accent rule.
  blockPicked: rootColour('--color-accent-soft'),
  blockEdge: rootColour('--color-muted'),
  blockLabel: rootColour('--color-text'),
  blockFont: rootFont('--text-tiny', BLOCK_SIZE, BLOCK_FAMILY),
  playhead: rootColour('--color-accent'),
  muted: rootColour('--color-muted'),
  text: rootColour('--color-text'),
  font: rootFont('--text-mini', BAR_SIZE, BAR_FAMILY),
}))

export type AnimationPaint = {
  rows: readonly AnimationRow[]
  viewport: Viewport
  fps: number
  duration: Us
  playhead: Us
  /**
   * What the band holds picked. Keys read as `<rowId>@<time>`, so a channel and its subject
   * agree; a shot is its own id, which `keyParts` answers nothing for.
   */
  selected: ReadonlySet<string>
  /** The block shown as chosen, by its own id. */
  picked?: string | null
}

/** How a key is named in the selection set, and in a hit test. */
export function keyId(rowId: string, time: Us): string {
  return `${rowId}@${time}`
}

/**
 * What a key name holds, or nothing when the string is not one.
 *
 * Beside `keyId` because the two decide ONE format between them. It was read apart, in the panel
 * that deletes a key, and a separator decided in two places is a separator that ends up meaning
 * two things. The LAST `@` is the one that separates: nothing forbids a row id from holding one.
 */
export function keyParts(id: string): { rowId: string; time: Us } | undefined {
  const cut = id.lastIndexOf('@')
  // `cut === 0` is a name with no row before the separator, which no row answers to.
  if (cut <= 0) return undefined

  const written = id.slice(cut + 1)
  const time = Number(written)
  // `Number('')` is 0, which would read a key at the start of the sheet out of `row@`.
  if (written === '' || !Number.isFinite(time)) return undefined

  return { rowId: id.slice(0, cut), time }
}

/** A diamond: a square on its corner, which is what every sheet draws a key as. */
function paintKey(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  reach: number,
  colour: string,
): void {
  context.fillStyle = colour
  context.beginPath()
  context.moveTo(x, y - reach)
  context.lineTo(x + reach, y)
  context.lineTo(x, y + reach)
  context.lineTo(x - reach, y)
  context.closePath()
  context.fill()
}

export function keysOf(row: AnimationRow): readonly Us[] {
  if (row.kind === 'subject') return row.keys
  if (row.kind === 'channel') return row.track.keys.map(key => key.time)
  // A lane holds no key: its blocks are drawn as bars — see `paintBlock`.
  return []
}

/**
 * Half a diamond's diagonal on that row, which a hit test needs as much as the paint does. A
 * lane draws no diamond at all, so nothing on its row can be grabbed by one.
 */
export function reachOf(row: AnimationRow): number {
  if (row.kind === 'subject') return KEY_REACH
  return row.kind === 'channel' ? CHANNEL_REACH : 0
}

export function paintAnimation(
  context: CanvasRenderingContext2D,
  paint: AnimationPaint,
  size: Size,
): void {
  const palette = readPalette()
  context.clearRect(0, 0, size.width, size.height)

  paintRows(context, paint, size, palette)

  paintRuler(context, {
    viewport: paint.viewport,
    width: size.width,
    fps: paint.fps,
    style: readRulerStyle(),
  })

  // A ruler graduated to seventeen seconds over a five-second scene says the scene is longer than
  // it is, and there is nowhere for a key to go out there — the head is clamped to the duration.
  paintBandEnd(context, {
    end: paint.duration,
    viewport: paint.viewport,
    width: size.width,
    height: size.height,
    colour: palette.muted,
  })
  paintHead(context, paint, size, palette)
}

function paintRows(
  context: CanvasRenderingContext2D,
  paint: AnimationPaint,
  size: Size,
  palette: Palette,
): void {
  for (const { item: row, offset } of placeRows(paint.rows)) {
    const top = RULER_HEIGHT + offset - paint.viewport.scrollTop
    if (top > size.height || top + row.height < RULER_HEIGHT) continue
    paintRow(context, row, top, size.width, paint, palette)
  }
}

function paintRow(
  context: CanvasRenderingContext2D,
  row: AnimationRow,
  top: number,
  width: number,
  paint: AnimationPaint,
  palette: Palette,
): void {
  context.fillStyle = row.kind === 'subject' ? palette.row : palette.rowAlt
  context.fillRect(0, top, width, row.height)
  context.fillStyle = palette.border
  context.fillRect(0, top + row.height - 1, width, 1)

  if (row.kind === 'lane') {
    for (const block of row.blocks)
      paintBlock(
        context,
        block,
        top,
        row.height,
        paint.viewport,
        palette,
        block.clipId === paint.picked,
      )
    return
  }
  if (row.kind === 'subject' && row.bars)
    for (const bar of row.bars) paintShot(context, bar, top, row.height, paint)

  paintKeys(context, row, top, width, paint, palette)
}

function paintKeys(
  context: CanvasRenderingContext2D,
  row: SubjectRow | ChannelRow,
  top: number,
  width: number,
  paint: AnimationPaint,
  palette: Palette,
): void {
  const middle = top + row.height / 2
  const reach = reachOf(row)
  for (const time of keysOf(row)) {
    const x = timeToX(time, paint.viewport)
    if (x < -reach || x > width + reach) continue
    paintKey(
      context,
      x,
      middle,
      reach,
      paint.selected.has(keyId(row.id, time)) ? palette.keySelected : palette.key,
    )
  }
}

/**
 * A clip, as the bar it is: it has a length, which is the whole difference from a key. Its own
 * name is written on it — several blocks share a lane row now, so the header column beside them
 * can no longer say which is which.
 */
function paintBlock(
  context: CanvasRenderingContext2D,
  block: ClipBlock,
  top: number,
  height: number,
  viewport: Viewport,
  palette: Palette,
  chosen: boolean,
): void {
  const left = timeToX(block.start, viewport)
  const right = timeToX(block.start + block.duration, viewport)
  const box = { top: top + BLOCK_INSET, height: height - BLOCK_INSET * 2 - 1 }

  context.fillStyle = chosen ? palette.blockPicked : palette.block
  context.fillRect(left, box.top, Math.max(1, right - left), box.height)
  paintBarGrips(context, left, right, box.top, box.height, palette.blockEdge)

  if (right - left < BLOCK_LABEL_MIN) return

  context.save()
  context.beginPath()
  context.rect(left + BLOCK_LABEL_PAD, box.top, right - left - BLOCK_LABEL_PAD * 2, box.height)
  context.clip()
  context.fillStyle = palette.blockLabel
  context.font = palette.blockFont
  context.textBaseline = 'middle'
  context.fillText(block.name, left + BLOCK_LABEL_PAD, box.top + box.height / 2)
  context.restore()
}

/**
 * What the montage draws a clip from, filled in from a shot. Everything a montage carries and a
 * shot has no notion of reads as nothing: no fade, no gain, no pair to travel with.
 */
function clipOfShot(shot: CameraShot): Clip {
  return {
    id: shot.id,
    assetId: '',
    start: shot.start,
    duration: shot.duration,
    inPoint: 0,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    gain: 0,
  }
}

/** A shot, painted BY the montage: same fill, same name, same grips, same everything. */
function paintShot(
  context: CanvasRenderingContext2D,
  bar: ShotBar,
  top: number,
  height: number,
  paint: AnimationPaint,
): void {
  paintClipOn(
    context,
    clipOfShot(bar.shot),
    bar.name,
    paint.viewport,
    top,
    height,
    paint.selected.has(bar.shot.id),
  )
}

function paintHead(
  context: CanvasRenderingContext2D,
  paint: AnimationPaint,
  size: Size,
  palette: Palette,
): void {
  // The half pixel is what keeps a one-pixel rule from being drawn across two.
  const x = Math.round(timeToX(paint.playhead, paint.viewport)) + 0.5
  if (x < 0 || x > size.width) return

  context.fillStyle = palette.playhead
  context.fillRect(x, 0, 1, size.height)
}
