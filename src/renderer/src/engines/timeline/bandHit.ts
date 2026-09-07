/**
 * What a point on the animation band is pointing at.
 *
 * Kept apart from the paint so it can be held to account without a canvas: the two agree because
 * both derive a row's position from `placeRows` and a key's from `timeToX`, never from their own
 * arithmetic.
 */
import { snapToFrame, type Us } from '@shared/domain/time'
import { placeRows } from '../timeline/band'
import {
  edgeGrab,
  RULER_HEIGHT,
  timeToX,
  xToTime,
  type ClipEdge,
  type Viewport,
} from '../timeline/timelineGeometry'
import { keysOf, reachOf } from '../timeline/bandPainter'
import type { Point } from '../core/geometry'
import type { AnimationRow, LaneRow } from './bandRows'

/** Which block of a lane a press took hold of, and where the two ends of a lane row agree. */
type BlockAt = { rowId: string; nodeId: string; laneId: string; clipId: string }

export type AnimationHit =
  /** The graduated strip: pressing there scrubs, wherever the pointer then goes. */
  | { kind: 'ruler'; time: Us }
  | { kind: 'key'; rowId: string; time: Us }
  /** A clip block, and how far into it the pointer landed — a drag must not snap it to the hand. */
  | ({ kind: 'block'; grabbedAt: Us } & BlockAt)
  /** One end of a block: the same zone the montage grabs a trim by, and the same arithmetic. */
  | ({ kind: 'blockEdge'; edge: ClipEdge } & BlockAt)
  /** A shot: its body slides, its two edges trim. `grabbedAt` is how far into it the hand landed. */
  | { kind: 'shot'; rowId: string; shotId: string; edge: 'start' | 'end' | null; grabbedAt: Us }
  | { kind: 'row'; rowId: string; time: Us }

export type HitContext = {
  rows: readonly AnimationRow[]
  viewport: Viewport
  fps: number
}

/**
 * A key is grabbed within half a diamond of its centre, PLUS a pixel of slack: a diamond is a
 * few pixels across, and asking a hand to land inside one is asking too much.
 */
const GRAB_SLACK = 2

/**
 * Which edge of a bar the hand landed on, through the montage's own `edgeGrab`: handles are
 * measured in PIXELS, and they shrink on a narrow bar so its body stays draggable.
 */
function edgeOf(start: Us, duration: Us, x: number, viewport: Viewport): 'start' | 'end' | null {
  const left = timeToX(start, viewport)
  const right = timeToX(start + duration, viewport)
  const grab = edgeGrab(right - left)

  if (Math.abs(left - x) <= grab) return 'start'
  return Math.abs(right - x) <= grab ? 'end' : null
}

export function hitAnimation(context: HitContext, point: Point): AnimationHit | null {
  const { rows, viewport, fps } = context
  const at = snapToFrame(xToTime(point.x, viewport), fps)

  if (point.y < RULER_HEIGHT) return { kind: 'ruler', time: at }

  const from = point.y + viewport.scrollTop - RULER_HEIGHT
  if (from < 0) return null

  for (const { item: row, offset } of placeRows(rows)) {
    if (from >= offset + row.height) continue

    if (row.kind === 'lane')
      return hitLane(row, viewport, point.x) ?? { kind: 'row', rowId: row.id, time: at }

    return hitKeyOrShot(row, viewport, point.x) ?? { kind: 'row', rowId: row.id, time: at }
  }

  return null
}

function hitKeyOrShot(
  row: Exclude<AnimationRow, LaneRow>,
  viewport: Viewport,
  x: number,
): AnimationHit | null {
  const grab = reachOf(row) + GRAB_SLACK
  const key = keysOf(row).find(time => Math.abs(timeToX(time, viewport) - x) <= grab)
  if (key !== undefined) return { kind: 'key', rowId: row.id, time: key }

  // Bars are painted under diamonds, so a key at the same point wins above.
  if (row.kind !== 'subject' || !row.bars) return null
  const on = xToTime(x, viewport)
  const bar = row.bars.find(
    held => on >= held.shot.start && on <= held.shot.start + held.shot.duration,
  )
  if (!bar) return null
  return {
    kind: 'shot',
    rowId: row.id,
    shotId: bar.shot.id,
    edge: edgeOf(bar.shot.start, bar.shot.duration, x, viewport),
    grabbedAt: on - bar.shot.start,
  }
}

/**
 * Which block of a lane the pointer is over, and whether it is over one of its ends. Later blocks
 * win where two overlap: they are drawn last, so the eye grabs what it sees.
 */
function hitLane(row: LaneRow, viewport: Viewport, x: number): AnimationHit | null {
  const at = xToTime(x, viewport)

  for (const block of [...row.blocks].reverse()) {
    if (at < block.start || at > block.start + block.duration) continue

    const where = { rowId: row.id, nodeId: row.nodeId, laneId: row.laneId, clipId: block.clipId }
    const left = timeToX(block.start, viewport)
    const right = timeToX(block.start + block.duration, viewport)
    // The same zone the montage trims by, so a narrow block keeps a body to drag rather than
    // becoming two handles that meet in the middle.
    const grab = edgeGrab(right - left)

    if (x <= left + grab) return { kind: 'blockEdge', ...where, edge: 'in' }
    if (x >= right - grab) return { kind: 'blockEdge', ...where, edge: 'out' }
    return { kind: 'block', ...where, grabbedAt: at - block.start }
  }

  return null
}

/**
 * What the pointer should look like there. The montage says `ew-resize` over a trim zone and the
 * animation band said nothing, which is what made a press on an edge read as a move that failed.
 */
export function animationCursorAt(context: HitContext, point: Point): string {
  const hit = hitAnimation(context, point)
  if (hit?.kind === 'blockEdge') return 'ew-resize'
  return hit?.kind === 'shot' && hit.edge ? 'ew-resize' : ''
}
