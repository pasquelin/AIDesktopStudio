import i18next from 'i18next'
import { isWorkshopId } from '@shared/domain/character'
import type { PathDescriptor, Vector3 as PlainVector3 } from '@shared/domain/scene'
import { openWorkshopNodeMenu } from '@/features/character/components/CharacterDocument/workshopNodeMenu'
import { movesToCommand } from '@/engines/scene/animationCommands'
import {
  withMovedHandle,
  withMovedPoint,
  withPointAfter,
  withPointAppended,
} from '@/engines/scene/cameraPath'
import { nodeById, type NodeMove } from '@/engines/scene/sceneState'
import { railCommand, railOf } from '@/engines/scene/nodeRail'
import { isPlayerModule } from '@/engines/scene/playerModule'
import { fileModuleOf } from '@/features/player/fileModule'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import { addNodeTo } from '@/hooks/useAddNode'
import { sceneOf, selectIn, useScenes } from '@/stores/scenes'
import { useSceneViews } from '@/stores/sceneViews'
import { removePickedPathPoint, runSceneCommand, toggleNodeVisible } from '../../sceneCommands'
import { openSceneNodeMenu } from '../sceneNodeMenu'
import { openPathPointMenu } from './pathPointMenu'
import { openSceneAddMenu } from './sceneAddMenu'

export function recordTransform(documentId: string, moves: readonly NodeMove[]): void {
  const { state, at, recording } = sceneKeyingAt(documentId)
  const command = movesToCommand(state, moves, at, recording)
  if (command) useScenes.getState().runCommand(documentId, command)
}

export function editPath(
  documentId: string,
  nodeId: string,
  edit: (path: PathDescriptor) => PathDescriptor,
): void {
  const store = useScenes.getState()
  const node = nodeById(sceneOf(store, documentId), nodeId)
  const rail = railOf(node ?? undefined)
  if (!node || !rail) return
  const command = railCommand(node, edit(rail))
  if (command) store.runCommand(documentId, command)
}

export function addPathPoint(documentId: string, nodeId: string, index: number): void {
  editPath(documentId, nodeId, path => withPointAfter(path, index))
  useSceneViews.getState().setPickedPathPoint(documentId, { nodeId, index: index + 1 })
}

export function appendPathPoint(documentId: string, nodeId: string, point: PlainVector3): void {
  const rail = railOf(nodeById(sceneOf(useScenes.getState(), documentId), nodeId) ?? undefined)
  if (!rail) return
  const index = rail.points.length
  editPath(documentId, nodeId, path => withPointAppended(path, point))
  useSceneViews.getState().setPickedPathPoint(documentId, { nodeId, index })
}

export function movePathPoint(
  documentId: string,
  picked: { nodeId: string; index: number; part?: 'in' | 'out' },
  point: PlainVector3,
): void {
  editPath(documentId, picked.nodeId, path =>
    picked.part
      ? withMovedHandle(path, picked.index, picked.part, point)
      : withMovedPoint(path, picked.index, point),
  )
}

export function openNodeMenu(documentId: string, nodeId: string | null): void {
  // A workshop holds one model and saves no scene: its menu moves the view, never the document.
  if (isWorkshopId(documentId)) return openWorkshopNodeMenu({ workshopId: documentId, t: i18next.t })
  if (nodeId === null) {
    return openSceneAddMenu({ t: i18next.t, onAdd: kind => addNodeTo(documentId, kind) })
  }
  const scene = sceneOf(useScenes.getState(), documentId)
  const node = nodeById(scene, nodeId)
  if (!node) return
  if (!scene.selectedIds.includes(nodeId)) selectIn(documentId, [nodeId])
  openSceneNodeMenu({
    node,
    canFrame: true,
    t: i18next.t,
    run: command => runSceneCommand(documentId, command),
    onToggleVisible: () => toggleNodeVisible(documentId, node.id),
    onSheet: scene.animation.sheet.includes(nodeId),
    ...(isPlayerModule(node) ? { onFileAsModule: () => void fileModuleOf(documentId) } : {}),
  })
}

export function openPointMenu(documentId: string): void {
  openPathPointMenu({ t: i18next.t, onRemove: () => removePickedPathPoint(documentId) })
}
