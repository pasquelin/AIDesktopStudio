import type { DragEvent } from 'react'
import type { Point } from '@/engines/core/geometry'
import type { Asset } from '@shared/domain/asset'
import { addClips, addClipsOnNewTracks } from '@/engines/timeline/commands'
import {
  newTracksForAsset,
  opensTrackFor,
  placementsForAsset,
  trackTakesType,
} from '@/engines/timeline/insert'
import { hitTest, xToTime, type Viewport } from '@/engines/timeline/timelineGeometry'
import type { SequenceState } from '@/engines/timeline/timelineState'
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
  placeTimelineAsset(context, asset, point)
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

export function placeTimelineAsset(context: DropContext, asset: Asset, point: Point): boolean {
  const target = hitTest(context.sequence, context.viewport, point)
  if (target?.kind === 'ruler') return false
  if (!target && !opensTrackFor(context.sequence, asset.type)) return false

  const store = useSequences.getState()
  const current = sequenceOf(store, context.documentId)
  const start = xToTime(point.x, context.viewport)
  if (!target?.trackId) {
    if (newTracksForAsset(current, asset).length > 0) {
      store.runCommand(context.documentId, addClipsOnNewTracks(asset, asset.id, start))
      return true
    }
    return false
  }
  const placements = placementsForAsset(current, asset, asset.id, start, target.trackId)
  if (placements.length === 0) return false
  store.runCommand(context.documentId, addClips(placements))
  return true
}

export function createTimelineDropHandler(context: DropContext) {
  return (event: DragEvent<HTMLCanvasElement>): void => {
    event.preventDefault()
    const sceneId = droppedSceneId(event)
    if (sceneId) return dropScene(event, context, sceneId)
    void dropAsset(event, context)
  }
}
