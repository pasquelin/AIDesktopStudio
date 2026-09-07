import type { AnimationTrack } from '@shared/domain/animation'
import type { Asset } from '@shared/domain/asset'
import { updateAnimationTrack } from '@/engines/scene/animationCommands'
import { addModelClip, addNode, setSelection } from '@/engines/scene/commands'
import { assetClip, type ClipRef } from '@shared/domain/scene'
import { newId } from '@/helpers/ids'
import { modelNode } from '@/engines/scene/nodeFactory'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'
import { sceneFromTemplate } from '@/engines/scene/sceneTemplates'
import type { SceneTemplateId } from '@shared/domain/sceneTemplate'
import type { SelectionMode } from '@/helpers/selection'
import { useAnimationViews } from './animationView'
import { createDocumentStore } from './documentStore'

/** One scene per document, in memory like the documents themselves. */
const store = createDocumentStore<SceneState>(EMPTY_SCENE)

export const sceneStore = store
export const useScenes = store.use
export const sceneOf = store.stateOf
export const sceneHistoryOf = store.historyOf
export const isSceneDirty = store.isDirty

/**
 * Fills a freshly made document with what its template opens on, before any editor mounts.
 *
 * `ensure`, so this never writes over a scene already there — and the state being present is
 * exactly what stops `restoreDocument` from putting the studio default in its place.
 */
export function seedSceneTemplate(
  documentId: string,
  template: SceneTemplateId,
  scriptFolder?: string,
  graph?: string,
): void {
  store.use.getState().ensure(documentId, () => sceneFromTemplate(template, scriptFolder, graph))
}

/**
 * A flag of an animation track, written without an entry in the history — how one works, not what
 * one made. The pendant of `sequences.writeTrack`, and for the same reason.
 */
export function writeAnimationTrack(
  documentId: string,
  trackId: string,
  change: (track: AnimationTrack) => AnimationTrack,
): void {
  const current = store.use.getState()
  current.replaceView(
    documentId,
    updateAnimationTrack(store.stateOf(current, documentId), trackId, change),
  )
}

/**
 * What is picked in a scene, wherever the gesture came from. The scene is read at CALL time, not
 * from the render that drew the row: a copy taken before whatever command ran in between would
 * undo it. It writes the scene and nothing else — the selection a scene holds is its own.
 */
export function selectIn(
  documentId: string,
  ids: readonly string[],
  mode: SelectionMode = 'replace',
): void {
  const state = useScenes.getState()
  const current = sceneOf(state, documentId)
  const next = setSelection(current, ids, mode)

  // Guarded on the ids rather than on the state, which `setSelection` copies either way: clicking
  // a row that is already selected — the gesture that OPENS a drag — otherwise wrote the document
  // back, and the viewport rebuilt its whole scene graph on the strength of it.
  if (next.selectedIds !== current.selectedIds) state.replaceView(documentId, next)
}

/**
 * The one way an imported model enters a scene, whichever door it came through — three call sites
 * building the node their own way is three ways for a model to arrive without a name. Answers
 * whether it went in, so a caller that owns a gesture knows whether to swallow it.
 */
export function addModelTo(documentId: string, asset: Asset): boolean {
  if (asset.type !== 'mesh') return false

  useScenes.getState().runCommand(documentId, addNode(modelNode(asset.id, asset.name)))
  return true
}

/**
 * A motion laid on the character that is SELECTED — never on a node of its own.
 *
 * An animation is not a thing in a scene: it is something a character does. With nothing
 * selected there is nobody to make it do it, and the gesture is refused rather than landing an
 * invisible node — which is exactly the `SKELETON_ONLY` trap `rigState` was written for.
 */
export function addAnimationTo(documentId: string, asset: Asset): boolean {
  if (asset.type !== 'animation') return false

  const scene = sceneOf(useScenes.getState(), documentId)
  const model = scene.nodes.find(
    node => node.type === 'model' && scene.selectedIds.includes(node.id),
  )
  if (!model) return false

  laySceneClip(documentId, model.id, assetClip(newId(), asset.id, asset.name))
  return true
}

/**
 * A block laid on a model, and CHOSEN in the same gesture.
 *
 * 🛑 The two are one: every panel describes the block the band shows as chosen, so one laid and
 * left unpicked leaves the inspector empty while the motion plays in the viewport.
 */
export function laySceneClip(documentId: string, nodeId: string, clip: ClipRef): void {
  useScenes.getState().runCommand(documentId, addModelClip(nodeId, clip))

  // Only what actually landed: naming a block no lane carries would clear the keys one had
  // selected for an edit that never happened.
  const node = sceneOf(useScenes.getState(), documentId).nodes.find(one => one.id === nodeId)
  const laid =
    node?.type === 'model' &&
    node.model.lanes?.some(lane => lane.clips.some(one => one.id === clip.id))
  if (laid) useAnimationViews.getState().setPickedBlock(documentId, clip.id)
}
