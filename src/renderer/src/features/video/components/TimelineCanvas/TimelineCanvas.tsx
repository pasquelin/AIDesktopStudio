import { useCallback, useEffect, useRef, type DragEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { posterUrl } from '@shared/domain/asset'
import { mediaExtentOf, type MediaExtent } from '@/engines/timeline/commands'
import {
  commandForGesture,
  viewportForGesture,
  type Gesture,
} from '@/engines/timeline/interactions'
import { paintTimeline, type PaintOptions } from '@/engines/timeline/painter'
import { cursorAt, xToTime, type Viewport } from '@/engines/timeline/timelineGeometry'
import type { Point, Size } from '@/engines/core/geometry'
import { paintOn } from '@/engines/core/canvas2d'
import { createFrameCoalesce } from '@/engines/core/frameCoalesce'
import {
  snapToFrame,
  type Clip,
  type SequenceState,
  type Us,
} from '@/engines/timeline/timelineState'
import { clampViewport } from '@/engines/timeline/viewport'
import { cn } from '@/helpers/cn'
import { cachedImage } from '@/helpers/imageCache'
import { useExternalTimelineDrop } from '@/hooks/useExternalTimelineDrop'
import { useRepaintOnResize } from '@/hooks/useRepaintOnResize'
import { useTimelineCanvasCommands } from '@/hooks/useTimelineCanvasCommands'
import { useTimelineWheel } from '@/hooks/useTimelineWheel'
import { useViewFollowsHead } from '@/hooks/useViewFollowsHead'
import { assetsById, useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { peaksOf, usePeaks } from '@/stores/peaks'
import { playbackHeadOf, usePlayback } from '@/stores/playback'
import { sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'
import { useTimelineView, viewportOf } from '@/stores/timelineView'
import { createTimelineDropHandler } from './timelineDrop'
import { createTimelineContextMenu } from './timelineContextMenu'
import { createTimelinePointerDown } from './timelinePointerDown'
import type { VideoToolId } from '../videoTools'

export type TimelineCanvasProps = {
  documentId: string
  tool: VideoToolId
  /**
   * Whether ⌘Z and ⌘⇧Z belong to this strip.
   *
   * The host decides, and only for those two: a sound montage sits under a take that already
   * answers ⌘Z on its own scope, and two listeners undoing at once is one press taking a step
   * off BOTH halves of the document — the studio's oldest trap. Everything else the strip binds
   * — the blade, Delete, the zoom, the ends — stays live, or the one timeline this lot exists to
   * make consistent would be the only one with a dead keyboard.
   */
  history?: boolean
}

function pointAt(event: PointerEvent<HTMLCanvasElement> | DragEvent<HTMLCanvasElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function writePlayhead(documentId: string, base: SequenceState, playhead: Us): void {
  const store = useSequences.getState()
  if (sequenceStore.hasState(store, documentId))
    store.replaceView(documentId, { ...base, playhead })
}

export function TimelineCanvas({ documentId, tool, history = true }: TimelineCanvasProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The gesture and the state it started from: one history entry per gesture, not per pixel.
  const dragging = useRef<{ gesture: Gesture; base: SequenceState } | null>(null)
  const scrubCoalesce = useRef(createFrameCoalesce())

  const sequence = useSequences(state => sequenceOf(state, documentId))
  const clockHead = usePlayback(state => playbackHeadOf(state, documentId))
  const viewport = useTimelineView(state => viewportOf(state, documentId))
  const byId = useAssets(assetsById)
  const stored = useDocuments(state => state.stored)

  // Read by `paint`, which must stay stable: rebuilding the observer on every dragged pixel
  // would tear down and re-create it sixty times a second.
  const latest = useRef<{ sequence: SequenceState; viewport: Viewport; options: PaintOptions }>({
    sequence,
    viewport,
    options: {},
  })
  const size = useRef<Size>({ width: 0, height: 0 })

  const paint = useCallback((): void => {
    paintOn(canvasRef.current, (context, box) => {
      size.current = box

      const current = latest.current
      paintTimeline(context, current.sequence, current.viewport, box, current.options)
    })
  }, [])

  /**
   * A repaint, at most one per frame.
   *
   * Posters and waveforms both land one asset at a time, after the frame that asked for them,
   * and each of them only needs the strip drawn again. Opening a project answered every
   * arrival with its own repaint; coalescing them costs one frame of latency and nothing else.
   */
  const queued = useRef(0)
  const repaint = useCallback((): void => {
    if (queued.current) return
    queued.current = requestAnimationFrame(() => {
      queued.current = 0
      paint()
    })
  }, [paint])

  // A scene clip has no catalogue row to be named after: it is the document's title that has to
  // show on the strip, or the block reads as empty.
  const nameOf = useCallback(
    (clip: Clip): string =>
      clip.sceneId
        ? (stored.find(document => document.id === clip.sceneId)?.title ?? clip.sceneId)
        : (byId.get(clip.assetId)?.name ?? clip.assetId),
    [byId, stored],
  )

  // A trim stops where the media does, and only the catalogue knows how far that is.
  const mediaExtents = useCallback(
    (assetId: string): MediaExtent => mediaExtentOf(byId.get(assetId) ?? null),
    [byId],
  )

  const posterOf = useCallback(
    (clip: Clip): CanvasImageSource | null => {
      const asset = byId.get(clip.assetId)
      const url = asset ? posterUrl(asset) : null
      return url ? cachedImage(url, repaint) : null
    },
    [byId, repaint],
  )

  useEffect(() => {
    const stop = usePeaks.subscribe(repaint)
    const coalesce = scrubCoalesce.current
    return () => {
      stop()
      if (queued.current) cancelAnimationFrame(queued.current)
      coalesce.flush()
    }
  }, [repaint])

  useRepaintOnResize(canvasRef, paint)

  const shownPlayhead = clockHead ?? sequence.playhead

  useEffect(() => {
    latest.current = {
      sequence: { ...sequence, playhead: shownPlayhead },
      viewport,
      options: { labelOf: nameOf, peaksOf, posterOf },
    }
    paint()
  }, [sequence, shownPlayhead, viewport, nameOf, posterOf, paint])

  const setViewport = useCallback(
    (next: Viewport): void => {
      const clamped = clampViewport(next, latest.current.sequence, size.current)
      useTimelineView.getState().set(documentId, clamped)
    },
    [documentId],
  )

  useViewFollowsHead(
    shownPlayhead,
    () => ({ viewport: latest.current.viewport, width: size.current.width }),
    setViewport,
  )

  useTimelineWheel(canvasRef, () => latest.current.viewport, setViewport)

  useTimelineCanvasCommands({
    documentId,
    history,
    sequence: () => latest.current.sequence,
    viewport: () => latest.current.viewport,
    width: () => size.current.width,
    setViewport,
  })

  const scrubTo = (base: SequenceState, point: Point, immediate = false): void => {
    const playhead = snapToFrame(xToTime(point.x, viewport), base.settings)
    if (immediate) {
      writePlayhead(documentId, base, playhead)
      return
    }
    // One seek per frame: a pointermove is faster than a GOP, and each extra ask was dropped.
    scrubCoalesce.current.schedule(playhead, next => writePlayhead(documentId, base, next))
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    createTimelinePointerDown({
      documentId,
      tool,
      sequence,
      viewport,
      setDragging: next => {
        dragging.current = next
      },
      pointAt,
      scrubTo,
    })(event)
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const current = dragging.current
    if (!current) {
      // Written straight to the node, the way `CanvasEngine` does it: this component keeps
      // everything that moves with the pointer out of React, and a hover is no exception.
      // Always written, empty included — skipping the write would leave a stale `ew-resize`
      // on the node after a tool change, where it would beat the hand's own class.
      // Only Selection trims: the hand moves the view and the blade cuts where it is pressed,
      // so promising either a trim would be a cursor the press then refuses.
      event.currentTarget.style.cursor =
        tool === 'select' ? cursorAt(sequence, viewport, pointAt(event)) : ''
      return
    }

    const point = pointAt(event)

    const view = viewportForGesture(current.gesture, point)
    if (view) return setViewport(view)

    if (current.gesture.kind === 'scrub') {
      scrubTo(current.base, point)
      return
    }

    const command = commandForGesture(current.gesture, current.base, viewport, point, mediaExtents)
    if (command) useSequences.getState().replaceView(documentId, command.apply(current.base))
  }

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>): void => {
    const current = dragging.current
    dragging.current = null
    if (!current) return

    event.currentTarget.releasePointerCapture(event.pointerId)

    // The frame owed by the last pointermove, paid HERE: left pending, it lands after the press
    // that follows and rewrites the montage from the state THIS gesture started on. A scrub is no
    // command either, so it ends on this line rather than on a hit test whose answer is dropped.
    if (current.gesture.kind === 'scrub') return scrubCoalesce.current.flush()

    const command = commandForGesture(
      current.gesture,
      current.base,
      viewport,
      pointAt(event),
      mediaExtents,
    )
    if (!command) return

    const store = useSequences.getState()
    // Rewind the preview first: the command has to apply to the state the gesture started from,
    // or undo would step back to a half-dragged clip.
    store.replaceView(documentId, current.base)
    store.runCommand(documentId, command)
  }

  /**
   * What can be done to the clip under the pointer, as the system's own menu.
   *
   * Everything here is also a shortcut, and that is the point: the keys were the ONLY way to
   * reach them, so a montage offered nothing to a right-click and nothing at all to whoever had
   * not learnt them. The labels are the commands' own, so a row and its key never drift apart.
   */
  const onContextMenu = createTimelineContextMenu({
    documentId,
    viewport,
    pointAt,
    labels: {
      split: t('commands.sequenceSplit.title'),
      splitHelp: t('commands.sequenceSplit.help'),
      unlink: t('commands.sequenceUnlink.title'),
      unlinkHelp: t('commands.sequenceUnlink.help'),
      remove: t('commands.sequenceDelete.title'),
      removeHelp: t('commands.sequenceDelete.help'),
    },
  })

  const onDrop = createTimelineDropHandler({ documentId, sequence, viewport, pointAt })
  const externalDrop = useExternalTimelineDrop({ documentId, sequence, viewport, pointAt }, onDrop)

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      className={cn(
        'block h-full w-full outline-none',
        externalDrop.className,
        tool === 'hand' && 'cursor-grab active:cursor-grabbing',
      )}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // A pointer that leaves mid-hover would otherwise leave the resize cursor written on the
      // node, and the surface would wear it until another move cleared it.
      onPointerLeave={event => (event.currentTarget.style.cursor = '')}
      // Not `AssetDropTarget`: what this surface accepts is decided per track, and one outline
      // over the whole timeline would promise the ruler takes what it refuses. Only the half
      // that has nothing to do with tracks is shared — preventing a drag we do not carry is
      // what makes a surface swallow files dragged in from the desktop.
      {...externalDrop.handlers}
    />
  )
}
