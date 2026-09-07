import { mdiContentCut, mdiContentDuplicate, mdiDeleteOutline, mdiPlaylistRemove } from '@mdi/js'
import type { TFunction } from 'i18next'
import type {
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  RefObject,
} from 'react'
import { frameDuration, snapToFrame, type Us } from '@shared/domain/time'
import { clamp } from '@shared/numeric'
import { assetClip, bundledClip, clipKeyOf, embeddedClip, type ClipRef } from '@shared/domain/scene'
import {
  editCameraShot,
  moveAnimationKey,
  takeOffAnimationSheet,
  unkeySubject,
} from '@/engines/scene/animationCommands'
import { clampPlayhead } from '@/engines/scene/animationEval'
import { draggedShot } from '@/engines/scene/cameraShots'
import { multi, removeModelClip, setModelLanes } from '@/engines/scene/commands'
import {
  clipsDuplicated,
  clipsMoved,
  clipsSplit,
  clipsTrimmed,
  laneHolding,
  lanesWith,
} from '@/engines/scene/clipBlend'
import type { Command } from '@/engines/core/history'
import type { Point } from '@/engines/core/geometry'
import type { SceneState } from '@/engines/scene/sceneState'
import {
  animationCursorAt,
  hitAnimation,
  type AnimationHit,
  type HitContext,
} from '@/engines/timeline/bandHit'
import { keyId, keyParts } from '@/engines/timeline/bandPainter'
import { xToTime, type ClipEdge, type Viewport } from '@/engines/timeline/timelineGeometry'
import type { AnimationRow } from '@/engines/timeline/bandRows'
import type { FrameCoalesce } from '@/engines/core/frameCoalesce'
import { trackIdsOf } from '@/engines/scene/animationRows'
import { draggedAssetType, droppedAsset } from '@/helpers/assetDrag'
import { showContextMenu } from '@/helpers/contextMenu'
import { newId } from '@/helpers/ids'
import { removePickedShot } from '@/features/scene/components/sceneCommands'
import { ANIMATION_DRAG_TYPE, draggedAnimationOf } from '@/features/animation/components/dragged'
import { sceneNodeDrag } from '@/features/scene/components/dragged'
import { useModelFiles } from '@/stores/modelFiles'
import { useAnimationViews } from '@/stores/animationView'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useSceneViews } from '@/stores/sceneViews'

export type AnimationCanvasSnapshot = {
  rows: readonly AnimationRow[]
  viewport: Viewport
  timeline: ReturnType<typeof sceneOf>['animation']
  playhead: Us
  selected: ReadonlySet<string>
  picked: string | null
}

type BlockRef = { nodeId: string; laneId: string; clipId: string }

export type AnimationCanvasGrab =
  | { kind: 'scrub' }
  | { kind: 'key'; rowId: string; trackIds: readonly string[]; from: Us; at: Us }
  | ({ kind: 'block'; grabbedAt: Us } & BlockRef)
  | ({ kind: 'blockEdge'; edge: ClipEdge } & BlockRef)
  | { kind: 'shot'; shotId: string; edge: 'start' | 'end' | null; grabbedAt: Us }

export type AnimationCanvasInteraction = {
  documentId: string
  latest: RefObject<AnimationCanvasSnapshot>
  grabbed: RefObject<AnimationCanvasGrab | null>
  scrubCoalesce: RefObject<FrameCoalesce>
}

function carriesMotion(event: { dataTransfer: DataTransfer | null }): boolean {
  const kind = draggedAssetType(event)
  return kind === 'mesh' || kind === 'animation'
}

function blockRefOf(hit: { nodeId: string; laneId: string; clipId: string }): BlockRef {
  return { nodeId: hit.nodeId, laneId: hit.laneId, clipId: hit.clipId }
}

function editLane(
  documentId: string,
  where: BlockRef,
  change: (clips: readonly ClipRef[]) => readonly ClipRef[] | null,
): void {
  const store = useScenes.getState()
  const node = sceneOf(store, documentId).nodes.find(candidate => candidate.id === where.nodeId)
  if (node?.type !== 'model' || !node.model.lanes) return
  const lanes = lanesWith(node.model.lanes, where.laneId, change)
  if (lanes) store.runCommand(documentId, setModelLanes(where.nodeId, lanes))
}

function blockOf(documentId: string, clipId: string): BlockRef | null {
  for (const node of sceneOf(useScenes.getState(), documentId).nodes) {
    if (node.type !== 'model') continue
    const lane = laneHolding(node.model.lanes ?? [], clipId)
    if (lane) return { nodeId: node.id, laneId: lane.id, clipId }
  }
  return null
}

function laneClipsOf(documentId: string, where: BlockRef): readonly ClipRef[] | null {
  const node = sceneOf(useScenes.getState(), documentId).nodes.find(
    candidate => candidate.id === where.nodeId,
  )
  if (node?.type !== 'model') return null
  return node.model.lanes?.find(lane => lane.id === where.laneId)?.clips ?? null
}

function clipLengthOf(documentId: string, where: BlockRef): number | null {
  const clip = laneClipsOf(documentId, where)?.find(candidate => candidate.id === where.clipId)
  return clip
    ? (useModelFiles.getState().lengths[documentId]?.[where.nodeId]?.[clipKeyOf(clip.source)] ??
        null)
    : null
}

function splitAt(context: AnimationCanvasInteraction, clips: readonly ClipRef[], where: BlockRef) {
  return clipsSplit(
    clips,
    where.clipId,
    context.latest.current.playhead,
    newId(),
    clipLengthOf(context.documentId, where),
  )
}

function dropBlock(context: AnimationCanvasInteraction, where: BlockRef): void {
  useScenes.getState().runCommand(context.documentId, removeModelClip(where.nodeId, where.clipId))
  useAnimationViews.getState().setPickedBlock(context.documentId, null)
}

function duplicateBlock(context: AnimationCanvasInteraction, where: BlockRef): void {
  editLane(context.documentId, where, clips =>
    clipsDuplicated(clips, where.clipId, newId(), clipLengthOf(context.documentId, where)),
  )
}

function splitBlock(context: AnimationCanvasInteraction, where: BlockRef): void {
  editLane(context.documentId, where, clips => splitAt(context, clips, where))
}

function blockKey(
  context: AnimationCanvasInteraction,
  event: ReactKeyboardEvent<HTMLCanvasElement>,
  where: BlockRef,
): boolean {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    dropBlock(context, where)
    return true
  }
  if (event.code === 'KeyD' && (event.metaKey || event.ctrlKey)) {
    duplicateBlock(context, where)
    return true
  }
  if (event.code === 'KeyS' && !event.metaKey && !event.ctrlKey) {
    splitBlock(context, where)
    return true
  }
  return false
}

function selectedKeyDrops(context: AnimationCanvasInteraction): Command<SceneState>[] {
  const store = useScenes.getState()
  const drops: Command<SceneState>[] = []
  for (const id of context.latest.current.selected) {
    const key = keyParts(id)
    if (!key) continue
    const row = context.latest.current.rows.find(candidate => candidate.id === key.rowId)
    if (!row) continue
    const command = unkeySubject(sceneOf(store, context.documentId), trackIdsOf(row), key.time)
    if (command) drops.push(command)
  }
  return drops
}

export function animationCanvasKeyDown(
  context: AnimationCanvasInteraction,
  event: ReactKeyboardEvent<HTMLCanvasElement>,
): void {
  const picked = context.latest.current.picked
  const block = picked ? blockOf(context.documentId, picked) : null
  if (block && blockKey(context, event, block)) return event.preventDefault()
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  if (removePickedShot(context.documentId)) return event.preventDefault()
  const drops = selectedKeyDrops(context)
  if (drops.length === 0) return
  event.preventDefault()
  useScenes
    .getState()
    .runCommand(
      context.documentId,
      drops.length === 1 && drops[0] ? drops[0] : multi('key:drop', drops),
    )
  useAnimationViews.getState().setSelected(context.documentId, [])
}

function hitContext(context: AnimationCanvasInteraction): HitContext {
  const current = context.latest.current
  return { rows: current.rows, viewport: current.viewport, fps: current.timeline.fps }
}

function pointIn(event: { currentTarget: Element; clientX: number; clientY: number }): Point {
  const bounds = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function hitAt(
  context: AnimationCanvasInteraction,
  event: PointerEvent<HTMLCanvasElement>,
): AnimationHit | null {
  return hitAnimation(hitContext(context), pointIn(event))
}

function seek(context: AnimationCanvasInteraction, time: Us): void {
  const timeline = context.latest.current.timeline
  useSceneViews
    .getState()
    .setPlayhead(
      context.documentId,
      clampPlayhead(snapToFrame(time, timeline.fps), timeline.duration),
    )
}

function showSubjectMenu(
  context: AnimationCanvasInteraction,
  event: ReactMouseEvent<HTMLCanvasElement>,
  hit: Exclude<AnimationHit, { kind: 'ruler' } | { kind: 'block' } | { kind: 'blockEdge' }>,
  t: TFunction,
): void {
  const row = context.latest.current.rows.find(candidate => candidate.id === hit.rowId)
  if (row?.kind !== 'subject') return
  const command = takeOffAnimationSheet(sceneOf(useScenes.getState(), context.documentId), [
    hit.rowId,
  ])
  if (!command || row.bars) return
  event.preventDefault()
  void showContextMenu([
    {
      label: t('animation.removeFromSheet', { name: row.name }),
      icon: mdiPlaylistRemove,
      tooltip: t('animation.removeFromSheetHint'),
      onSelect: () => useScenes.getState().runCommand(context.documentId, command),
    },
  ])
}

function showBlockMenu(
  context: AnimationCanvasInteraction,
  event: ReactMouseEvent<HTMLCanvasElement>,
  hit: Extract<AnimationHit, { kind: 'block' }>,
  t: TFunction,
): void {
  event.preventDefault()
  const where = blockRefOf(hit)
  useAnimationViews.getState().setPickedBlock(context.documentId, where.clipId)
  const clips = laneClipsOf(context.documentId, where)
  void showContextMenu([
    {
      label: t('animations.duplicateBlock'),
      icon: mdiContentDuplicate,
      tooltip: t('animations.duplicateBlockHint'),
      onSelect: () => duplicateBlock(context, where),
    },
    {
      label: t('animations.splitBlock'),
      icon: mdiContentCut,
      tooltip: t('animations.splitBlockHint'),
      disabled: clips === null || splitAt(context, clips, where) === null,
      onSelect: () => splitBlock(context, where),
    },
    {
      label: t('animations.removeBlock'),
      icon: mdiDeleteOutline,
      tooltip: t('animations.removeBlockHint'),
      onSelect: () => dropBlock(context, where),
    },
  ])
}

export function animationCanvasContextMenu(
  context: AnimationCanvasInteraction,
  event: ReactMouseEvent<HTMLCanvasElement>,
  t: TFunction,
): void {
  const hit = hitAnimation(hitContext(context), pointIn(event))
  if (hit && hit.kind !== 'block' && hit.kind !== 'blockEdge' && hit.kind !== 'ruler') {
    showSubjectMenu(context, event, hit, t)
    return
  }
  if (hit?.kind === 'block') showBlockMenu(context, event, hit, t)
}

function dropAt(context: AnimationCanvasInteraction, row: AnimationRow, clip: ClipRef): void {
  if (row.kind !== 'lane') return
  editLane(context.documentId, { ...row, clipId: clip.id }, clips => [...clips, clip])
  useAnimationViews.getState().setPickedBlock(context.documentId, clip.id)
}

function animationDropTarget(
  context: AnimationCanvasInteraction,
  event: DragEvent<HTMLCanvasElement>,
): { row: AnimationRow; start: Us } | null {
  const hit = hitAnimation(hitContext(context), pointIn(event))
  if (!hit || hit.kind === 'ruler') return null
  const row = context.latest.current.rows.find(candidate => candidate.id === hit.rowId)
  if (!row || row.kind !== 'lane') return null
  const current = context.latest.current
  const at = snapToFrame(xToTime(pointIn(event).x, current.viewport), current.timeline.fps)
  return { row, start: Math.max(0, clampPlayhead(at, current.timeline.duration)) }
}

function animationClipFrom(written: string, start: Us): ClipRef | null {
  const dropped = draggedAnimationOf(JSON.parse(written))
  if (!dropped) return null
  return dropped.kind === 'embedded'
    ? embeddedClip(newId(), dropped.clip, { start })
    : bundledClip(newId(), dropped.name, { start })
}

export async function animationCanvasDrop(
  context: AnimationCanvasInteraction,
  event: DragEvent<HTMLCanvasElement>,
): Promise<void> {
  if (sceneNodeDrag.carries(event)) return
  const written = event.dataTransfer.getData(ANIMATION_DRAG_TYPE)
  const flying = written || !carriesMotion(event) ? null : droppedAsset(event)
  if (!written && !flying) return
  event.preventDefault()
  const target = animationDropTarget(context, event)
  if (!target) return
  const { row, start } = target
  if (flying) {
    const asset = await flying
    if (asset) dropAt(context, row, assetClip(newId(), asset.id, asset.name, { start }))
    return
  }
  const clip = animationClipFrom(written, start)
  if (clip) dropAt(context, row, clip)
}

function holdBlock(context: AnimationCanvasInteraction, hit: AnimationHit): boolean {
  if (hit.kind !== 'block' && hit.kind !== 'blockEdge') return false
  context.grabbed.current =
    hit.kind === 'block'
      ? { kind: 'block', ...blockRefOf(hit), grabbedAt: hit.grabbedAt }
      : { kind: 'blockEdge', ...blockRefOf(hit), edge: hit.edge }
  useScenes.getState().beginGesture(context.documentId)
  useAnimationViews.getState().setPickedBlock(context.documentId, hit.clipId)
  return true
}

function holdShot(context: AnimationCanvasInteraction, hit: AnimationHit): boolean {
  if (hit.kind !== 'shot') return false
  context.grabbed.current = {
    kind: 'shot',
    shotId: hit.shotId,
    edge: hit.edge,
    grabbedAt: hit.grabbedAt,
  }
  useScenes.getState().beginGesture(context.documentId)
  useAnimationViews.getState().setSelected(context.documentId, [hit.shotId])
  return true
}

export function animationCanvasPointerDown(
  context: AnimationCanvasInteraction,
  event: PointerEvent<HTMLCanvasElement>,
): void {
  const hit = hitAt(context, event)
  if (!hit) return useAnimationViews.getState().setSelected(context.documentId, [])
  event.currentTarget.setPointerCapture(event.pointerId)
  if (hit.kind === 'ruler') {
    context.grabbed.current = { kind: 'scrub' }
    seek(context, hit.time)
    return
  }
  if (hit.kind === 'row') {
    useAnimationViews.getState().setSelected(context.documentId, [])
    seek(context, hit.time)
    return
  }
  if (holdBlock(context, hit) || holdShot(context, hit)) return
  if (hit.kind !== 'key') return
  const row = context.latest.current.rows.find(candidate => candidate.id === hit.rowId)
  if (!row) return
  const trackIds = trackIdsOf(row)
  if (trackIds.length === 0) return
  context.grabbed.current = {
    kind: 'key',
    rowId: hit.rowId,
    trackIds,
    from: hit.time,
    at: hit.time,
  }
  useAnimationViews.getState().setSelected(context.documentId, [keyId(hit.rowId, hit.time)])
}

function draggedTime(
  context: AnimationCanvasInteraction,
  event: PointerEvent<HTMLCanvasElement>,
): Us {
  const current = context.latest.current
  return clampPlayhead(
    snapToFrame(xToTime(pointIn(event).x, current.viewport), current.timeline.fps),
    current.timeline.duration,
  )
}

function moveBlock(
  context: AnimationCanvasInteraction,
  grab: AnimationCanvasGrab,
  at: Us,
): boolean {
  if (grab.kind === 'block') {
    editLane(context.documentId, grab, clips =>
      clipsMoved(clips, grab.clipId, Math.max(0, at - grab.grabbedAt)),
    )
    return true
  }
  if (grab.kind !== 'blockEdge') return false
  editLane(context.documentId, grab, clips =>
    clipsTrimmed(clips, grab.clipId, grab.edge, at, clipLengthOf(context.documentId, grab)),
  )
  return true
}

function moveShot(context: AnimationCanvasInteraction, grab: AnimationCanvasGrab, at: Us): boolean {
  if (grab.kind !== 'shot') return false
  const timeline = context.latest.current.timeline
  const shot = timeline.shots.find(held => held.id === grab.shotId)
  const bounds = shot ? draggedShot(shot, grab, at, frameDuration(timeline.fps)) : null
  if (bounds) {
    useScenes.getState().runCommand(context.documentId, editCameraShot(grab.shotId, bounds))
  }
  return true
}

export function animationCanvasPointerMove(
  context: AnimationCanvasInteraction,
  event: PointerEvent<HTMLCanvasElement>,
): void {
  const grab = context.grabbed.current
  if (!grab) {
    event.currentTarget.style.cursor = animationCursorAt(hitContext(context), pointIn(event))
    return
  }
  if (event.buttons === 0) return animationCanvasCloseGesture(context, event)
  const at = draggedTime(context, event)
  if (grab.kind === 'scrub')
    return context.scrubCoalesce.current.schedule(at, time => seek(context, time))
  if (moveBlock(context, grab, at) || moveShot(context, grab, at)) return
  if (grab.kind !== 'key') return
  context.grabbed.current = { ...grab, at: clamp(at, 0, context.latest.current.timeline.duration) }
  useAnimationViews.getState().setSelected(context.documentId, [keyId(grab.rowId, grab.at)])
}

export function animationCanvasCloseGesture(
  context: AnimationCanvasInteraction,
  event: PointerEvent<HTMLCanvasElement>,
): void {
  const grab = context.grabbed.current
  context.grabbed.current = null
  if (!grab) return
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  if (grab.kind === 'scrub') context.scrubCoalesce.current.flush()
  if (grab.kind === 'block' || grab.kind === 'blockEdge' || grab.kind === 'shot') {
    useScenes.getState().endGesture(context.documentId)
    return
  }
  if (grab.kind !== 'key' || grab.at === grab.from) return
  const moves = grab.trackIds.map(trackId => moveAnimationKey(trackId, grab.from, grab.at))
  const command = moves.length === 1 && moves[0] ? moves[0] : multi('key:drag', moves)
  useScenes.getState().runCommand(context.documentId, command)
  useAnimationViews.getState().setSelected(context.documentId, [keyId(grab.rowId, grab.at)])
}

export function animationCanvasDragOver(event: DragEvent<HTMLCanvasElement>): void {
  const carried =
    event.dataTransfer.types.includes(ANIMATION_DRAG_TYPE) ||
    sceneNodeDrag.carries(event) ||
    carriesMotion(event)
  if (!carried) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}
