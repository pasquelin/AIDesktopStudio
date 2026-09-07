import { VIEW_SIDE_OF, type CommandId } from '@shared/domain/command'
import type { LogScope } from '@shared/ipc'
import type { CsgOperation } from '@shared/domain/csg'
import { canInvertCarve, canNegate, canSeparate } from '@/engines/csg/carve'
import {
  addNodes,
  carveNodes,
  copiesOf,
  groupNodes,
  invertCarve,
  negateNodes,
  separateNode,
  removeNodes,
  rootedIn,
  setNodeVisible,
} from '@/engines/scene/commands'
import { openOptimizationDialog, openWorldPerformanceDialog } from '@/hooks/useOptimizationDialog'
import { openGameExportDialog } from '@/hooks/useGameExportDialog'
import { railCommand, railOf } from '@/engines/scene/nodeRail'
import { withoutPoint } from '@/engines/scene/cameraPath'
import {
  putOnAnimationSheet,
  removeCameraShot,
  takeOffAnimationSheet,
} from '@/engines/scene/animationCommands'
import { bringsSecondPlayer, playerPartsOf, tearsPlayerApart } from '@/engines/scene/playerModule'
import { nodeById, rootsOf, selectedNodes, type SceneNode } from '@/engines/scene/sceneState'
import { newId } from '@/helpers/ids'
import { reportFailure } from '@/services/diagnostics'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { useSceneClipboard } from '@/stores/sceneClipboard'
import type { CommandAnswer } from '@/services/commandBus'
import { runHistoryCommand } from '@/services/historyCommand'
import { sceneOf, sceneStore, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { isCameraView } from '@/engines/scene/sceneView'
/**
 * The commands that act on what a scene has selected, and on nothing else — no mode, no view
 * setting, nothing a viewport holds in React state.
 *
 * Apart from the space's own dispatch because they now have three doors rather than two: the
 * toolbar, the keyboard and the native Édition menu all arrive as a `CommandId`, and so does the
 * context menu of a node. Written twice, a duplicate that stops offsetting its copies or a delete
 * that stops taking a subtree would be fixed on one door and left broken on the other.
 *
 * Answers whether the command was one of these, so the caller can go on to the ones only it can
 * serve. The viewport is reached through the registry rather than through a ref: a panel that is
 * not the viewport raises this menu too.
 */
/**
 * Flips the eye of one node, read at the moment it is asked for.
 *
 * Its own function because it is the only gesture of the node menu that is not a `CommandId`, and
 * because the state has to be FRESH: a native menu stands open for as long as the hand takes to
 * choose, and a `visible` captured when it was built would write back the value already in place
 * — an entry in the history that changes nothing, and a redo stack emptied for it.
 */
export function toggleNodeVisible(documentId: string, nodeId: string): void {
  const store = useScenes.getState()
  const node = nodeById(sceneOf(store, documentId), nodeId)
  if (node) store.runCommand(documentId, setNodeVisible(node.id, !node.visible))
}
/**
 * The commands refuse on their own; this is what SAYS so, since a gesture that quietly does
 * nothing reads as a studio that ignored the key. Answers true so a caller can stop there.
 */
function saysRefusal(nodes: readonly SceneNode[], scope: LogScope, why: string): boolean {
  reportFailure(scope, playerPartsOf(nodes)?.module.name ?? '', new Error(why))
  return true
}
/** A removal that would leave a module standing without its body or its eye. */
function refusesRemoval(nodes: readonly SceneNode[], ids: readonly string[]): boolean {
  return (
    tearsPlayerApart(nodes, ids) &&
    saysRefusal(nodes, 'scene.playerParts', 'a player module keeps its body and its camera')
  )
}
/** The same for what comes IN: a scene arbitrating between two modules is what the module ended. */
function refusesArrival(nodes: readonly SceneNode[], copies: readonly SceneNode[]): boolean {
  return (
    bringsSecondPlayer(nodes, copies) &&
    saysRefusal(nodes, 'scene.player', 'this scene already holds a player module')
  )
}
/**
 * The picked control point of a rail, taken away. Answers whether there was one, so a caller can
 * go on to what it would otherwise have deleted.
 *
 * Only while its rail is still the SELECTION, and that is what stops Delete from being hijacked:
 * a point is picked by a click in the viewport and let go of by another one, where the tree
 * selects through `selectIn`, which knows nothing of this. A point left over from a rail worked
 * on earlier would eat the Delete meant for the object just picked in the tree — and on a rail
 * already down to its last two points, it would swallow every Delete and do nothing at all.
 *
 * Two points is the floor `withoutPoint` holds — one point is not a line — and that refusal still
 * counts as handled: falling through would delete the rail the hand is working on.
 */
export function removePickedPathPoint(documentId: string): boolean {
  const picked = sceneViewOf(useSceneViews.getState(), documentId).pickedPathPoint
  if (!picked) return false
  const store = useScenes.getState()
  const scene = sceneOf(store, documentId)
  if (!scene.selectedIds.includes(picked.nodeId)) return false
  const node = nodeById(scene, picked.nodeId)
  const rail = railOf(node ?? undefined)
  if (!node || !rail) return false
  const path = withoutPoint(rail, picked.index)
  if (path === rail) return true
  const edit = railCommand(node, path)
  if (edit) store.runCommand(documentId, edit)
  useSceneViews.getState().setPickedPathPoint(documentId, null)
  return true
}
/**
 * The shot picked in the band, taken away. Answers whether there was one, the way a picked
 * control point does — and for the same reason, one payment later: Delete is an accelerator of
 * the native Édition menu, so it never reaches the band's own `onKeyDown`. Clicking a shot while
 * a camera stood selected deleted THE CAMERA, silently.
 */
export function removePickedShot(documentId: string): boolean {
  const picked = animationViewOf(useAnimationViews.getState(), documentId).selected
  if (picked.length === 0) return false
  const store = useScenes.getState()
  const shot = sceneOf(store, documentId).animation.shots.find(held => picked.includes(held.id))
  if (!shot) return false
  store.runCommand(documentId, removeCameraShot(shot.id))
  useAnimationViews.getState().setSelected(documentId, [])
  return true
}
/** Which cut each of the three buttons asks for. */
const OPERATION_OF: Record<'scene.carve' | 'scene.weld' | 'scene.intersect', CsgOperation> = {
  'scene.carve': 'subtract',
  'scene.weld': 'unite',
  'scene.intersect': 'intersect',
}
/**
 * What a command that CREATES answers — see `publishCommand`: the ids of what it made, roots only,
 * a subtree copied whole being one thing to the hand that asked.
 */
const madeOf = (copies: readonly SceneNode[]): CommandAnswer => ({
  nodeIds: rootsOf(copies).map(node => node.id),
})
/** Through the chosen camera, and back out on a second call — Blender's `Numpad0`. The pane in
 * FRONT, never all four: locking the other three onto a camera is nothing anybody asked for. */
function lookThroughCamera(
  documentId: string,
  nodes: readonly SceneNode[],
  picked: readonly SceneNode[],
): void {
  const views = useSceneViews.getState()
  const view = sceneViewOf(views, documentId)
  const pane = view.activePane
  if (isCameraView(view.panes[pane])) return views.setPaneView(documentId, pane, 'free')
  const camera = picked.find(node => node.type === 'camera') ?? nodes.find(n => n.type === 'camera')
  if (camera) views.setPaneView(documentId, pane, { kind: 'camera', nodeId: camera.id })
}
/**
 * 🛑 Split into named halves, never one switch: the size guard caps a function of this complexity
 * at thirty lines. Each half answers `null` for what it does not know, and the next one is asked —
 * so a command may be moved between them freely, and only the ORDER of a shared case matters.
 */
export function runSceneCommand(documentId: string, command: CommandId): CommandAnswer {
  const store = useScenes.getState()
  const { nodes, selectedIds } = sceneOf(store, documentId)
  const picked = selectedNodes(nodes, selectedIds)
  const framingAndViews = () => {
    switch (command) {
      case 'scene.frame':
        sceneEngineOf(documentId)?.frameSelection()
        return true
      case 'scene.frameFollow':
        sceneEngineOf(documentId)?.frameFollow()
        return true
      case 'scene.exportGame':
        openGameExportDialog(documentId)
        return true
      case 'scene.viewFront':
      case 'scene.viewBack':
      case 'scene.viewRight':
      case 'scene.viewLeft':
      case 'scene.viewTop':
      case 'scene.viewBottom':
        // The camera is MOVED to that side and left free to turn away from it again, which is what
        // the keypad does in Blender — a pane LOCKED to a side is another gesture, see `PaneView`.
        sceneEngineOf(documentId)?.viewFrom(VIEW_SIDE_OF[command])
        return true
      default:
        return null
    }
  }
  const cameraSheetAndPanels = () => {
    switch (command) {
      case 'scene.viewCamera':
        lookThroughCamera(documentId, nodes, picked)
        return true
      // Who is on the band. The selection, never a list to pick from: a map of thousands of
      // objects is not one anybody scrolls through — one clicks the character and asks for this.
      case 'scene.addToSheet': {
        const command = putOnAnimationSheet(sceneOf(store, documentId), selectedIds)
        if (command) store.runCommand(documentId, command)
        return true
      }
      case 'scene.removeFromSheet': {
        const command = takeOffAnimationSheet(sceneOf(store, documentId), selectedIds)
        if (command) store.runCommand(documentId, command)
        return true
      }
      case 'scene.optimizeSelection':
        if (picked.length > 0 && sceneEngineOf(documentId)) openOptimizationDialog(documentId)
        return true
      case 'scene.worldPerformance':
        if (sceneEngineOf(documentId)) openWorldPerformanceDialog(documentId)
        return true
      default:
        return null
    }
  }
  const removingAndCopying = () => {
    switch (command) {
      case 'scene.delete':
        // A picked control point is taken first: point and rail are one selection seen at two
        // depths, and Delete on a point that took the whole rail would be a rail nobody meant.
        if (removePickedPathPoint(documentId)) return true
        if (removePickedShot(documentId)) return true
        if (selectedIds.length === 0 || refusesRemoval(nodes, selectedIds)) return true
        store.runCommand(documentId, removeNodes(nodes, selectedIds))
        return true
      case 'scene.duplicate': {
        if (picked.length === 0) return true
        const copies = copiesOf(nodes, picked)
        if (refusesArrival(nodes, copies)) return true
        store.runCommand(documentId, addNodes(copies))
        return madeOf(copies)
      }
      case 'scene.copy':
        if (picked.length > 0) useSceneClipboard.getState().copy(copiesOf(nodes, picked))
        return true
      default:
        return null
    }
  }
  const pastingAndGrouping = () => {
    switch (command) {
      case 'scene.cut':
        // Checked BEFORE the clipboard is written: a cut that cannot remove must not look copied.
        if (picked.length === 0 || refusesRemoval(nodes, selectedIds)) return true
        useSceneClipboard.getState().copy(copiesOf(nodes, picked))
        store.runCommand(documentId, removeNodes(nodes, selectedIds))
        return true
      case 'scene.paste': {
        // Copied again on the way out: pasting twice must not put the same ids in twice.
        const held = useSceneClipboard.getState().nodes
        if (held.length === 0) return true
        const pasted = rootedIn(copiesOf(held, held), nodes)
        if (refusesArrival(nodes, pasted)) return true
        store.runCommand(documentId, addNodes(pasted))
        return madeOf(pasted)
      }
      case 'scene.group': {
        if (picked.length === 0) return true
        const id = newId()
        store.runCommand(documentId, groupNodes(picked, id))
        return { nodeIds: [id] }
      }
      default:
        return null
    }
  }
  const solidOperations = () => {
    switch (command) {
      case 'scene.negate':
        if (canNegate(picked)) store.runCommand(documentId, negateNodes(picked))
        return true
      case 'scene.carve':
      case 'scene.weld':
      case 'scene.intersect': {
        const folded = carveNodes(picked, OPERATION_OF[command], nodes)
        if (folded) store.runCommand(documentId, folded)
        return true
      }
      case 'scene.invertCarve': {
        const solid = picked[0]
        if (canInvertCarve(picked) && solid?.type === 'carved') {
          const flipped = invertCarve(solid, nodes)
          if (flipped) store.runCommand(documentId, flipped)
        }
        return true
      }
      default:
        return null
    }
  }
  const separatingAndHistory = () => {
    switch (command) {
      case 'scene.separate': {
        const solid = picked[0]
        if (canSeparate(picked) && solid?.type === 'carved') {
          store.runCommand(documentId, separateNode(solid))
        }
        return true
      }
      /**
       * 🛑 `false` on an empty stack, which is what a caller needs: answered `ok` regardless, a
       * model sent nine undos in a row and took the whole decor apart (bench pass, 2026-08-26).
       */
      case 'scene.undo':
      case 'scene.redo':
        return runHistoryCommand(sceneStore, 'scene', documentId, command) ?? false
      default:
        return null
    }
  }
  // 🛑 The ORDER is the whole of what this list carries: a command a half does not know answers
  // `null`, and the next one is asked — so moving one between halves is free, and only a case two
  // of them share depends on where it sits.
  for (const half of [
    framingAndViews,
    cameraSheetAndPanels,
    removingAndCopying,
    pastingAndGrouping,
    solidOperations,
    separatingAndHistory,
  ]) {
    const answer = half()
    if (answer !== null) return answer
  }
  return false
}
