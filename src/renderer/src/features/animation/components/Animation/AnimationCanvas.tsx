import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { paintAnimation } from '@/engines/timeline/bandPainter'
import { rowsHeight, maxOffsetFor, maxScrollTopFor } from '@/engines/timeline/band'
import { RULER_HEIGHT, type Viewport } from '@/engines/timeline/timelineGeometry'
import { clampScale } from '@/engines/timeline/viewport'
import { useRepaintOnResize } from '@/hooks/useRepaintOnResize'
import { useTimelineWheel } from '@/hooks/useTimelineWheel'
import type { Size } from '@/engines/core/geometry'
import { paintOn } from '@/engines/core/canvas2d'
import { createFrameCoalesce } from '@/engines/core/frameCoalesce'
import { type AnimationRow } from '@/engines/timeline/bandRows'
import { clamp } from '@shared/numeric'
import { animationViewOf, keySetOf, useAnimationViews } from '@/stores/animationView'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useScenePlayhead } from '@/stores/sceneViews'
import {
  animationCanvasCloseGesture,
  animationCanvasContextMenu,
  animationCanvasDragOver,
  animationCanvasDrop,
  animationCanvasKeyDown,
  animationCanvasPointerDown,
  animationCanvasPointerMove,
  type AnimationCanvasInteraction,
  type AnimationCanvasGrab,
  type AnimationCanvasSnapshot,
} from './animationCanvasInteractions'

export type AnimationCanvasProps = {
  documentId: string
  rows: readonly AnimationRow[]
}

/**
 * The animation band: the ruler, the rows and the keys, painted.
 *
 * The same split the montage uses — this canvas draws, `AnimationHeaders` beside it holds the
 * controls. Reimplementing focus and accessible names inside a canvas would be rebuilding the
 * browser; drawing a thousand diamonds in the DOM would be a scroll that stutters.
 */
export function AnimationCanvas({ documentId, rows }: AnimationCanvasProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grabbed = useRef<AnimationCanvasGrab | null>(null)
  const scrubCoalesce = useRef(createFrameCoalesce())

  const timeline = useScenes(state => sceneOf(state, documentId).animation)
  const playhead = useScenePlayhead(documentId)
  const view = useAnimationViews(state => animationViewOf(state, documentId))

  // Keyed on the array, whose identity is stable: building the set in a selector would hand
  // zustand a new snapshot on every render and the subscription would never settle.
  const selected = useMemo(() => keySetOf(view.selected), [view.selected])

  // Everything the paint reads, gathered once: the ref and the effect below hand over the very
  // same object, so a field gained here is not a field to remember in two other places.
  const snapshot: AnimationCanvasSnapshot = {
    rows,
    viewport: view.viewport,
    timeline,
    playhead,
    selected,
    picked: view.pickedBlock,
  }

  const latest = useRef(snapshot)
  const size = useRef<Size>({ width: 0, height: 0 })

  const paint = useCallback((): void => {
    paintOn(canvasRef.current, (context, box) => {
      size.current = box

      const current = latest.current
      paintAnimation(
        context,
        {
          rows: current.rows,
          viewport: current.viewport,
          fps: current.timeline.fps,
          duration: current.timeline.duration,
          playhead: current.playhead,
          selected: current.selected,
          picked: current.picked,
        },
        box,
      )
    })
  }, [])

  useEffect(() => {
    latest.current = snapshot
    paint()
  })

  // A gesture cut short by an unmount must not drop the head it ended on.
  useEffect(() => {
    const coalesce = scrubCoalesce.current
    return () => coalesce.flush()
  }, [])

  useRepaintOnResize(canvasRef, paint)

  const setViewport = useCallback(
    (next: Viewport): void => {
      const current = latest.current
      const scale = clampScale(next.scale)
      const offset = clamp(
        Math.round(next.offset),
        0,
        maxOffsetFor(current.timeline.duration, scale, size.current.width),
      )
      const scrollTop = clamp(
        Math.round(next.scrollTop),
        0,
        maxScrollTopFor(rowsHeight(current.rows), size.current.height, RULER_HEIGHT),
      )
      useAnimationViews.getState().setViewport(documentId, { scale, offset, scrollTop })
    },
    [documentId],
  )

  useTimelineWheel(canvasRef, () => latest.current.viewport, setViewport)
  const interaction: AnimationCanvasInteraction = { documentId, latest, grabbed, scrubCoalesce }

  return (
    <canvas
      ref={canvasRef}
      data-testid="animation-canvas"
      className="block h-full w-full outline-none"
      // Focusable, or the canvas would never receive a key at all.
      tabIndex={0}
      onKeyDown={event => animationCanvasKeyDown(interaction, event)}
      onDragOver={animationCanvasDragOver}
      onDrop={event => void animationCanvasDrop(interaction, event)}
      onContextMenu={event => animationCanvasContextMenu(interaction, event, t)}
      onPointerDown={event => animationCanvasPointerDown(interaction, event)}
      onPointerMove={event => animationCanvasPointerMove(interaction, event)}
      // Or a pointer that leaves mid-hover writes the resize cursor on the element for good.
      onPointerLeave={event => (event.currentTarget.style.cursor = '')}
      onPointerUp={event => animationCanvasCloseGesture(interaction, event)}
      onPointerCancel={event => animationCanvasCloseGesture(interaction, event)}
      onLostPointerCapture={event => animationCanvasCloseGesture(interaction, event)}
    />
  )
}
