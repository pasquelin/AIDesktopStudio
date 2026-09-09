import { createDefaultScene } from '@/engines/scene/defaultScene'
import { nodeById, type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import type { DocumentStoreState } from './documentStore'
import { installIn } from './document-fixtures'
import { sceneOf, sceneStore, useScenes } from './scenes'

/** Puts the store back as it was built, so a suite never inherits the previous one's. */
export function clearScenes(): void {
  sceneStore.resetForTests()
}

/**
 * Puts a scene document in front of a panel under test, in a store put back as it was built.
 *
 * It lives beside the stores rather than beside the node fixtures because their shape is what
 * it knows — and `engines/` must not reach for a store.
 */
export function installScene(documentId: string, state: SceneState = createDefaultScene()): void {
  installIn(sceneStore, documentId, state, '3d')
}

/**
 * Reading half of `installScene`, in the shape a subscribed selector takes it.
 *
 * Prefixed for the reason every reader of a node is: "node" is the word of two domains at once,
 * and each store publishes one — `nodeById` exists for a scene (`engines/scene/scene-state.ts`)
 * and for a graph (`shared/domain/graph.ts`). The prefix is what keeps a suite from reading a
 * graph where it meant to read a scene, whichever an editor's auto-import reaches first.
 */
const sceneNodeIn = (
  state: DocumentStoreState<SceneState>,
  documentId: string,
  id: string,
): SceneNode | null => nodeById(sceneOf(state, documentId), id)

/**
 * The same read for what a suite asserts BETWEEN renders, where there is no state to be handed.
 *
 * `null` covers two different accidents — a node the scene does not hold, and a document the
 * store lost. `installScene` REPLACES the whole map, so installing a second scene turns the
 * first into the second accident silently.
 */
export const sceneNodeNow = (documentId: string, id: string): SceneNode | null =>
  sceneNodeIn(useScenes.getState(), documentId, id)
