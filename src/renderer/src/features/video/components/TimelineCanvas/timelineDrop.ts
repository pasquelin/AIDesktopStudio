import type { DragEvent } from 'react'
import type { Point } from '@/engines/core/geometry'
import type { Asset } from '@shared/domain/asset'
import { addClips, addClipsOnNewTracks } from '@/engines/timeline/commands'
import {
  clipForAsset,
  newTracksForAsset,
  opensTrackFor,
  placementsForAsset,
  trackTakesType,
  type ClipPlacement,
} from '@/engines/timeline/insert'
import { clipEnd } from '@/engines/timeline/timelineState'
import { hitTest, xToTime, type Viewport } from '@/engines/timeline/timelineGeometry'
import type { SequenceState, Us } from '@/engines/timeline/timelineState'
import { assetIdFromDrag, draggedAssetType, droppedAsset } from '@/helpers/assetDrag'
import { droppedSceneId } from '@/helpers/sceneDrag'
import { addSceneToSequence, sequenceOf, useSequences } from '@/stores/sequences'
import { loadSceneSource, montageSceneOf } from '@/stores/sceneSources'

type DropContext = {
  documentId: string
  sequence: SequenceState
  viewport: Viewport
  pointAt: (event: DragEvent<HTMLCanvasElement>) => Point
}

function dropScene(
  event: DragEvent<HTMLCanvasElement>,
  context: DropContext,
  sceneId: string,
): void {
  const dropped = context.pointAt(event)
  const target = hitTest(context.sequence, context.viewport, dropped)
  if (target?.kind === 'ruler') return
  event.stopPropagation()
  addSceneToSequence(
    context.documentId,
    sceneId,
    montageSceneOf(sceneId)?.animation.duration ?? null,
    xToTime(dropped.x, context.viewport),
    target?.trackId,
  )
  void loadSceneSource(sceneId)
}

async function dropAsset(event: DragEvent<HTMLCanvasElement>, context: DropContext): Promise<void> {
  const assetId = assetIdFromDrag(event)
  if (!assetId) return
  const point = context.pointAt(event)
  const target = hitTest(context.sequence, context.viewport, point)
  if (target?.kind === 'ruler') return
  if (!target && !opensTrackFor(context.sequence, draggedAssetType(event))) return
  event.stopPropagation()
  const asset = await droppedAsset(event)
  if (!asset) return
  placeTimelineAssetAt(context, asset, point, null)
}

export function timelineTakesType(
  context: DropContext,
  type: Asset['type'],
  point: Point,
): boolean {
  const target = hitTest(context.sequence, context.viewport, point)
  if (target?.kind === 'ruler') return false
  if (!target) return opensTrackFor(context.sequence, type)
  return trackTakesType(context.sequence, target.trackId, type)
}

/**
 * The same landing, at a time the caller may name — and answering where the clip ENDS.
 *
 * What a drop of several files needs: they go in end to end from the point the pointer was let
 * go at, so five rushes dropped together read as a cut rather than as five clips on one frame.
 * `null` for a landing the montage refused, which is what tells a lot to stop.
 */
export function placeTimelineAssetAt(
  context: DropContext,
  asset: Asset,
  point: Point,
  from: Us | null,
): Us | null {
  const target = hitTest(context.sequence, context.viewport, point)
  if (target?.kind === 'ruler') return null
  if (!target && !opensTrackFor(context.sequence, asset.type)) return null

  const store = useSequences.getState()
  const current = sequenceOf(store, context.documentId)
  const start = from ?? xToTime(point.x, context.viewport)
  // Measured from the clip the placement itself builds, so the answer is the snapped end rather
  // than the raw duration: `clipForAsset` is what both branches below lay down.
  const landed = clipEnd(clipForAsset(asset.id, asset, start, current.settings))
  const placements = landingPlacements(current, asset, start, target?.trackId, from === null)
  if (placements.length > 0) {
    store.runCommand(context.documentId, addClips(placements))
    return landed
  }
  if (target?.trackId || newTracksForAsset(current, asset).length === 0) return null
  store.runCommand(context.documentId, addClipsOnNewTracks(asset, asset.id, start))
  return landed
}

/**
 * The rows this clip goes on: the one under the pointer, or — for the rest of a LOT — whichever
 * row the montage lands this kind on.
 *
 * The hit test reads the montage as it was when the drag began, so below the last track it
 * answers « no row » for every file of the lot: five rushes came out as five new tracks, one clip
 * each. The FIRST of a lot still opens rows; the rest join them.
 */
function landingPlacements(
  current: SequenceState,
  asset: Asset,
  start: Us,
  aimed: string | undefined,
  first: boolean,
): ClipPlacement[] {
  if (aimed) return placementsForAsset(current, asset, asset.id, start, aimed)
  return first ? [] : placementsForAsset(current, asset, asset.id, start)
}

export function createTimelineDropHandler(context: DropContext) {
  return (event: DragEvent<HTMLCanvasElement>): void => {
    event.preventDefault()
    const sceneId = droppedSceneId(event)
    if (sceneId) return dropScene(event, context, sceneId)
    void dropAsset(event, context)
  }
}
