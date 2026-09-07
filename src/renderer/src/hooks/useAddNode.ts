import { useCallback } from 'react'
import { addNodes } from '@/engines/scene/commands'
import { createNodesOf } from '@/engines/scene/nodeFactory'
import { bringsSecondPlayer } from '@/engines/scene/playerModule'
import { reportFailure } from '@/services/diagnostics'
import { sceneOf, selectIn, useScenes } from '@/stores/scenes'

/** The one way a node enters a scene: the toolbar, a panel's add menu and the native menu. */
export function addNodeTo(documentId: string, kind: string): void {
  // One command for the whole module, so a single ⌘Z takes back the body AND the eye.
  const nodes = createNodesOf(kind)
  const root = nodes[0]
  if (!root) return

  if (bringsSecondPlayer(sceneOf(useScenes.getState(), documentId).nodes, nodes)) {
    reportFailure('scene.player', root.name, new Error('this scene already holds a player module'))
    return
  }

  useScenes.getState().runCommand(documentId, addNodes(nodes))
  // `addNodes` picks everything it put down, which is right for a duplicate and wrong here: an
  // Add leaves ONE node picked, or the next gesture paints the arm and the camera too.
  if (nodes.length > 1) selectIn(documentId, [root.id])
}

/** The same, bound to the document a component already holds. */
export function useAddNode(documentId: string | null): (kind: string) => void {
  return useCallback(
    (kind: string) => {
      if (documentId) addNodeTo(documentId, kind)
    },
    [documentId],
  )
}
