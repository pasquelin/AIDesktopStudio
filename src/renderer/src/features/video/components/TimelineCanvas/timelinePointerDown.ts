import type { PointerEvent } from 'react'
import type { Point } from '@/engines/core/geometry'
import { splitClip } from '@/engines/timeline/commands'
import { beginGesture, type Gesture } from '@/engines/timeline/interactions'
import { hitTest, xToTime, type Viewport } from '@/engines/timeline/timelineGeometry'
import type { SequenceState } from '@/engines/timeline/timelineState'
import { selectClipIn, useSequences } from '@/stores/sequences'
import type { VideoToolId } from '../videoTools'

type Options = {
  documentId: string
  tool: VideoToolId
  sequence: SequenceState
  viewport: Viewport
  setDragging: (dragging: { gesture: Gesture; base: SequenceState }) => void
  pointAt: (event: PointerEvent<HTMLCanvasElement>) => Point
  scrubTo: (base: SequenceState, point: Point, immediate: boolean) => void
}

function cutAt(point: Point, options: Options): void {
  const target = hitTest(options.sequence, options.viewport, point)
  const clipId = target && 'clipId' in target ? target.clipId : null
  if (clipId)
    useSequences
      .getState()
      .runCommand(options.documentId, splitClip(clipId, xToTime(point.x, options.viewport)))
}

function beginDrag(event: PointerEvent<HTMLCanvasElement>, point: Point, options: Options): void {
  const gesture = beginGesture(options.sequence, options.viewport, point, options.tool === 'hand')
  if (!gesture) {
    selectClipIn(options.documentId, null)
    return
  }
  event.currentTarget.setPointerCapture(event.pointerId)
  if (gesture.kind === 'scrub' || gesture.kind === 'pan') {
    options.setDragging({ gesture, base: options.sequence })
    if (gesture.kind === 'scrub') options.scrubTo(options.sequence, point, true)
    return
  }
  options.setDragging({
    gesture,
    base: selectClipIn(options.documentId, gesture.clipId),
  })
}

export function createTimelinePointerDown(options: Options) {
  return (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0 || event.ctrlKey) return
    const point = options.pointAt(event)
    if (options.tool === 'blade') return cutAt(point, options)
    beginDrag(event, point, options)
  }
}
