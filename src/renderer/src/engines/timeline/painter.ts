import { mdiLinkVariant, mdiLinkVariantOff } from '@mdi/js'
import {
  badgeAt,
  BADGE_SIZE,
  CLIP_INSET,
  EDGE_BAR_INSET,
  EDGE_BAR_WIDTH,
  edgeGrab,
  FADE_BAND,
  RULER_HEIGHT,
  timeToX,
  trackRows,
  visibleRange,
  type Viewport,
} from './timelineGeometry'
import { MDI_VIEWBOX, mdiPath } from '@/helpers/mdiCanvas'
import { paintBandEnd } from './bandEnd'
import { paintRuler as paintBandRuler, readRulerStyle } from './ruler'
import {
  clipEnd,
  hasTrackOfKind,
  sequenceDuration,
  type Clip,
  type SequenceState,
  type Track,
  type TrackKind,
  type Us,
} from './timelineState'
import { memoPalette, rootColour, rootFont } from '../core/palette'
import type { Point, Size } from '../core/geometry'
import { waveformColumns, type WaveColumn } from './waveform'

/** Poster width, as a multiple of the row height. Sixteen by nine, near enough to read a shot. */
const POSTER_RATIO = 16 / 9

/**
 * The mark a clip wears in its corner: whether it still travels with its other half — the
 * picture of a rush and its sound, which `linkId` ties together.
 *
 * Both states are drawn, and that is the point: nothing on the strip said which pairs were still
 * tied, and a mark shown only when linked cannot be told from a mark nobody drew.
 */
const LINK_GLYPHS: Record<'tied' | 'alone', string> = {
  tied: mdiLinkVariant,
  alone: mdiLinkVariantOff,
}

/**
 * Whether a pair can still HOLD on this montage — which is what decides that the mark above is
 * worth drawing.
 *
 * A `linkId` is only ever laid by `insert.ts`, on the two halves of a rush that has both a picture
 * and a sound. With no picture row there is no half to travel with, and the Audio workspace has
 * none by construction: every clip there wore the broken link, forever, saying the same thing
 * about all of them. A mark that cannot vary is not a state, it is decoration.
 *
 * A sound clip CAN outlive its picture — `removeTrack` takes a row without clearing the ids of
 * the clips left behind — and its `linkId` then names a half that is gone. Drawing nothing is the
 * honest answer there too: the full link would promise a pair that no longer exists.
 */
function pairsPossible(state: SequenceState): boolean {
  return hasTrackOfKind(state, 'video')
}

/** Which fill a row's clips take. Keyed by kind, so a third one cannot be added without one. */
const CLIP_FILLS: Record<TrackKind, 'clip' | 'clipAudio'> = {
  video: 'clip',
  audio: 'clipAudio',
}

/** An `@mdi/js` glyph, drawn at `BADGE_SIZE` with its top left corner where the badge sits. */
function paintGlyph(context: CanvasRenderingContext2D, glyph: string, at: Point): void {
  const scale = BADGE_SIZE / MDI_VIEWBOX
  context.save()
  context.translate(at.x, at.y)
  context.scale(scale, scale)
  context.fill(mdiPath(glyph))
  context.restore()
}

const CLIP_FAMILY = 'ui-sans-serif, system-ui'

/** `--text-tiny` at scale 1, for a paint with no document to read from. */
const CLIP_SIZE = '11px'

export type PaintOptions = {
  /** What a clip is called. Absent falls back to its asset id, which is always available. */
  labelOf?: (clip: Clip) => string
  /** The waveform of a clip's source, when one has been read back. */
  peaksOf?: (clip: Clip) => Float32Array | null
  /** The still that stands for a clip, once it is decoded. */
  posterOf?: (clip: Clip) => CanvasImageSource | null
}

type Palette = {
  ruler: string
  track: string
  trackAlt: string
  border: string
  clip: string
  clipAudio: string
  selected: string
  playhead: string
  text: string
  muted: string
  clipFont: string
}

const readPalette = memoPalette((): Palette => ({
  ruler: rootColour('--color-chassis'),
  track: rootColour('--color-panel'),
  trackAlt: rootColour('--color-surface'),
  border: rootColour('--color-border'),
  clip: rootColour('--color-elevated'),
  clipAudio: rootColour('--color-clip-audio'),
  selected: rootColour('--color-accent-soft'),
  playhead: rootColour('--color-accent'),
  text: rootColour('--color-text'),
  muted: rootColour('--color-muted'),
  clipFont: rootFont('--text-tiny', CLIP_SIZE, CLIP_FAMILY),
}))

function paintRuler(
  context: CanvasRenderingContext2D,
  state: SequenceState,
  viewport: Viewport,
  size: Size,
): void {
  paintBandRuler(context, {
    viewport,
    width: size.width,
    fps: state.settings.fps,
    style: readRulerStyle(),
  })
}

function paintTrack(
  context: CanvasRenderingContext2D,
  track: Track,
  top: number,
  size: Size,
  palette: Palette,
): void {
  // A row has to be visible before it holds anything: an empty timeline that paints nothing
  // reads as a broken panel, not as an empty one.
  context.fillStyle = track.kind === 'audio' ? palette.trackAlt : palette.track
  context.fillRect(0, top, size.width, track.height)

  context.fillStyle = palette.border
  context.fillRect(0, top + track.height - 1, size.width, 1)
}

/**
 * The fade ramps, drawn as the wedge they remove from the clip. Shown rather than implied: a
 * fade nobody can see is a fade nobody remembers setting.
 */
function paintFades(
  context: CanvasRenderingContext2D,
  clip: Clip,
  viewport: Viewport,
  left: number,
  right: number,
  top: number,
  height: number,
  palette: Palette,
): void {
  const bottom = top + height
  context.fillStyle = palette.ruler

  if (clip.fadeIn > 0) {
    const to = timeToX(clip.start + clip.fadeIn, viewport)
    context.beginPath()
    context.moveTo(left, top)
    context.lineTo(to, top)
    context.lineTo(left, bottom)
    context.fill()
  }

  if (clip.fadeOut > 0) {
    const from = timeToX(clipEnd(clip) - clip.fadeOut, viewport)
    context.beginPath()
    context.moveTo(from, top)
    context.lineTo(right, top)
    context.lineTo(right, bottom)
    context.fill()
  }
}

/**
 * Where a waveform's axis sits in a row, and how far an amplitude of 1 reaches from it.
 *
 * Exported because the programme monitor draws ON this geometry — the band it cuts at −6 dB, the
 * groove of its envelope, its graduations — and each of those has to land on the very axis
 * `paintWaveform` fills against. Spelt twice, moving the one-pixel inset here would shift the
 * colour boundary away from the threshold it marks, and nothing would say so.
 */
export function waveAxis(top: number, height: number): { middle: number; reach: number } {
  return { middle: top + height / 2, reach: height / 2 - 1 }
}

/**
 * The waveform, filling the row under the label. Drawn as one path rather than a rectangle per
 * column: five hundred `fillRect` calls per clip is what a long montage cannot afford.
 */
export function paintWaveform(
  context: CanvasRenderingContext2D,
  columns: readonly WaveColumn[],
  top: number,
  height: number,
  colour: string,
): void {
  if (columns.length === 0) return

  const { middle, reach } = waveAxis(top, height)

  context.fillStyle = colour
  context.beginPath()
  for (const column of columns) context.lineTo(column.x, middle - column.max * reach)
  // Back along the bottom, so the outline closes into the filled body of the wave.
  for (let index = columns.length - 1; index >= 0; index--) {
    const column = columns[index]
    if (column) context.lineTo(column.x, middle - column.min * reach)
  }
  context.closePath()
  context.fill()
}

/** The poster, covering the head of a clip: enough to recognise a shot, never the whole width. */
function paintPoster(
  context: CanvasRenderingContext2D,
  poster: CanvasImageSource,
  left: number,
  right: number,
  top: number,
  height: number,
): void {
  const width = Math.min(height * POSTER_RATIO, right - left)
  if (width <= 0) return
  context.drawImage(poster, left, top, width, height)
}

/**
 * The grips at both ends of a bar one drags by its ends, shared with the animation band as
 * `paintWaveform` is: a grip drawn by its own arithmetic elsewhere would stop agreeing with
 * `edgeGrab`, the zone that actually grabs it. The caller hands the rectangle they stand in.
 */
export function paintBarGrips(
  context: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  height: number,
  colour: string,
): void {
  if (edgeGrab(right - left) < EDGE_BAR_WIDTH) return

  context.fillStyle = colour
  context.fillRect(left, top, EDGE_BAR_WIDTH, height)
  context.fillRect(right - EDGE_BAR_WIDTH, top, EDGE_BAR_WIDTH, height)
}

/**
 * The grips at both ends, which is what says a clip can be lengthened at all.
 *
 * They start BELOW the fade band, and that offset is the whole point: up there the same corner
 * opens a fade rather than a trim (`hitTest`), so a bar drawn into the band would be pressed for
 * a lengthening and hand back a ramp. Skipped altogether once the bar would be wider than the
 * zone that grabs it — on a narrow clip `edgeGrab` gives the middle back to the drag, and a bar
 * sticking out past its own target promises a trim that is refused.
 */
function paintEdgeBars(
  context: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  height: number,
  selected: boolean,
  palette: Palette,
): void {
  paintBarGrips(
    context,
    left,
    right,
    // The band is measured from the row, `top` is the clip box: one inset apart.
    top + FADE_BAND - CLIP_INSET,
    // Never negative: MIN_TRACK_HEIGHT leaves a 23 px box against the 13 px the two insets take.
    height - (FADE_BAND - CLIP_INSET) - EDGE_BAR_INSET,
    selected ? palette.text : palette.muted,
  )
}

/**
 * What every clip of one paint shares — read once for the strip, where the nine arguments above
 * vary per clip. `linkable` is derived from the montage rather than taken from `PaintOptions`:
 * that one is the caller's, and a caller has no business claiming a montage holds pairs.
 */
type ClipPaint = { palette: Palette; options: PaintOptions; linkable: boolean }

/**
 * One clip, for a band that is not the montage — the dope sheet's camera shots.
 *
 * The montage's own palette and nothing else: a shot and a rush are the same object to a hand,
 * and two tables of tokens is how two bands stop looking alike without anyone deciding it.
 */
export function paintClipOn(
  context: CanvasRenderingContext2D,
  clip: Clip,
  label: string,
  viewport: Viewport,
  top: number,
  height: number,
  selected: boolean,
): void {
  const left = timeToX(clip.start, viewport)
  // Never nothing: a clip shorter than a pixel still has to be visible enough to grab.
  const right = Math.max(left + 1, timeToX(clipEnd(clip), viewport))
  const palette = readPalette()

  // Posed here, where `paintTimeline` poses them for the strip: a band that draws its own text
  // some other way leaves its baseline behind, and the name rides out of the top of the bar.
  context.font = palette.clipFont
  context.textBaseline = 'top'

  paintClip(context, clip, label, viewport, left, right, top, height, selected, 'video', {
    palette,
    options: {},
    linkable: false,
  })
}

function paintClip(
  context: CanvasRenderingContext2D,
  clip: Clip,
  label: string,
  viewport: Viewport,
  left: number,
  right: number,
  top: number,
  height: number,
  selected: boolean,
  kind: TrackKind,
  { palette, options, linkable }: ClipPaint,
): void {
  const boxTop = top + CLIP_INSET
  const boxHeight = height - CLIP_INSET * 2 - 1

  context.fillStyle = selected ? palette.selected : palette[CLIP_FILLS[kind]]
  context.fillRect(left, boxTop, right - left, boxHeight)

  context.save()
  context.beginPath()
  context.rect(left, boxTop, right - left, boxHeight)
  context.clip()

  paintClipMedia(context, clip, viewport, left, right, boxTop, boxHeight, selected, kind, {
    palette,
    options,
    linkable,
  })

  context.fillStyle = palette.text
  context.fillText(label, left + 6, boxTop + 4)
  paintLinkBadge(context, clip, left, right, top, selected, linkable, palette)
  context.restore()

  context.fillStyle = palette.border
  context.fillRect(left, boxTop, 1, boxHeight)
  context.fillRect(right - 1, boxTop, 1, boxHeight)
  paintEdgeBars(context, left, right, boxTop, boxHeight, selected, palette)
}

function paintClipMedia(
  context: CanvasRenderingContext2D,
  clip: Clip,
  viewport: Viewport,
  left: number,
  right: number,
  top: number,
  height: number,
  selected: boolean,
  kind: TrackKind,
  { palette, options }: ClipPaint,
): void {
  const poster = kind === 'video' ? (options.posterOf?.(clip) ?? null) : null
  if (poster) paintPoster(context, poster, left, right, top, height)

  const peaks = kind === 'audio' ? (options.peaksOf?.(clip) ?? null) : null
  if (peaks) {
    paintWaveform(
      context,
      waveformColumns(clip, peaks, viewport, left, right),
      top,
      height,
      selected ? palette.text : palette.muted,
    )
  }

  paintFades(context, clip, viewport, left, right, top, height, palette)
}

function paintLinkBadge(
  context: CanvasRenderingContext2D,
  clip: Clip,
  left: number,
  right: number,
  top: number,
  selected: boolean,
  linkable: boolean,
  palette: Palette,
): void {
  const badge = linkable ? badgeAt(left, right, top) : null
  if (badge) {
    context.fillStyle = selected || clip.linkId ? palette.text : palette.muted
    paintGlyph(context, LINK_GLYPHS[clip.linkId ? 'tied' : 'alone'], badge)
  }
}

export function paintTimeline(
  context: CanvasRenderingContext2D,
  state: SequenceState,
  viewport: Viewport,
  size: Size,
  options: PaintOptions = {},
): void {
  const [from, to]: [Us, Us] = visibleRange(viewport, size.width)
  const palette = readPalette()
  const labelOf = options.labelOf ?? (clip => clip.assetId)

  context.clearRect(0, 0, size.width, size.height)
  context.fillStyle = palette.track
  context.fillRect(0, 0, size.width, size.height)

  // Hoisted out of the clip loop: assigning `font` reparses the CSS shorthand and drops the
  // context's metrics cache, and at five hundred clips a frame that is not free.
  context.font = palette.clipFont
  context.textBaseline = 'top'

  // Read once for the whole strip rather than per clip: `linkable` answers about the MONTAGE, and
  // asking it five hundred times a frame would walk the tracks five hundred times.
  const shared: ClipPaint = { palette, options, linkable: pairsPossible(state) }

  paintTracks(context, state, viewport, size, from, to, labelOf, shared)

  paintRuler(context, state, viewport, size)

  paintBandEnd(context, {
    end: sequenceDuration(state),
    viewport,
    width: size.width,
    height: size.height,
    colour: palette.muted,
  })

  context.fillStyle = palette.playhead
  context.fillRect(Math.round(timeToX(state.playhead, viewport)), 0, 1, size.height)
}

function paintTracks(
  context: CanvasRenderingContext2D,
  state: SequenceState,
  viewport: Viewport,
  size: Size,
  from: Us,
  to: Us,
  labelOf: (clip: Clip) => string,
  shared: ClipPaint,
): void {
  const { palette } = shared

  for (const { track, offset } of trackRows(state)) {
    const top = RULER_HEIGHT + offset - viewport.scrollTop
    if (top > size.height || top + track.height < RULER_HEIGHT) continue

    paintTrack(context, track, top, size, palette)

    for (const clip of track.clips) {
      // Horizontal virtualisation: at 500 clips, painting the ones off screen is the whole cost.
      if (clipEnd(clip) < from || clip.start > to) continue

      paintClip(
        context,
        clip,
        labelOf(clip),
        viewport,
        timeToX(clip.start, viewport),
        timeToX(clipEnd(clip), viewport),
        top,
        track.height,
        state.selectedId === clip.id,
        track.kind,
        shared,
      )
    }
  }
}
