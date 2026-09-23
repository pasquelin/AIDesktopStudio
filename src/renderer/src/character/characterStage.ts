import { workshopIdOf, type CharacterExtras } from '@shared/domain/character'
import type { Rig } from '@shared/domain/rig'
import type { SceneState } from '@/engines/scene/sceneState'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { modelNode } from '@/engines/scene/nodeFactory'
import { characterStore, seedCharacter, useCharacters } from '@/stores/character'
import { noteSceneApplied } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'

/** What a stage needs of an engine: a workshop scene laid over it, and what the file turned out to be. */
type CharacterDraw = {
  apply: (state: SceneState) => void
  frameContents: () => boolean
}

export type CharacterStageDeps = {
  renderer: CharacterDraw
  assetId: string
}

export type CharacterStage = {
  /** Called by the engine when a model's file has landed — see `SceneRendererOptions.onCharacter`. */
  read: (rig: Rig | null, extras: CharacterExtras | null) => void
  close: () => void
}

/**
 * 🛑 Noted as well as applied: the workshop drives its engine from its own subscription rather
 * than through the viewport's effect, so an action reading that engine — a still, an
 * optimisation plan — would wait for a note that never came.
 */
function applyWorkshop(renderer: CharacterDraw, documentId: string, state: SceneState): void {
  renderer.apply(state)
  noteSceneApplied(documentId, state)
}

/**
 * Where a character is edited: the workshop laid under it, and the file read into the store.
 *
 * Not a hook, and that is why it exists — `pnpm banc` has no window, and mounts this on a stub
 * renderer. One path, two callers, so what a tab does is measured rather than replaced.
 *
 * 🛑 Nothing here overwrites what is already open. A tab remounts whenever the space changes —
 * `DocumentArea` is keyed on it — and a workshop replaced then would take the motion being posed
 * with it, a skeleton reseeded would take an hour of rigging.
 */
export function createCharacterStage(deps: CharacterStageDeps): CharacterStage {
  let framed = false

  const documentId = workshopIdOf(deps.assetId)
  useScenes.getState().ensure(documentId, () => workshopScene(deps.assetId))
  applyWorkshop(deps.renderer, documentId, sceneOf(useScenes.getState(), documentId))
  // Compared before applying: the store writes a fresh object for every command, every mark and
  // every document — and `apply` sweeps the whole scene each time it is called.
  let last = sceneOf(useScenes.getState(), documentId)
  const watching = useScenes.subscribe(state => {
    const next = sceneOf(state, documentId)
    if (next === last) return

    last = next
    applyWorkshop(deps.renderer, documentId, next)
  })

  return {
    read: (rig, extras) => {
      if (!characterStore.hasState(useCharacters.getState(), deps.assetId))
        seedCharacter(deps.assetId, rig, extras ?? {})
      // Aimed ONCE: re-aiming per landing makes the view breathe as a pose changes the bounds.
      if (!framed) framed = deps.renderer.frameContents()
    },
    // The subscription alone: the workshop and the skeleton belong to the TAB, which is still
    // open — `IO_BY_KIND.character.forget` is what lets go of both when it closes.
    close: () => watching(),
  }
}

/**
 * The character alone, on nothing else.
 *
 * NOT a document: the window edits a file, and a scene it saved would be the second truth this
 * repo forbids. Composed anew on every open, from the asset id and nothing more.
 */
export function workshopScene(assetId: string): SceneState {
  const node = modelNode(assetId, assetId)

  // 🛑 On the sheet at once, where a studio scene waits to be dragged there: this window has no
  // outliner to drag FROM, so a band left to fill itself would stay on its empty state for ever.
  return {
    ...EMPTY_SCENE,
    nodes: [node],
    animation: { ...EMPTY_SCENE.animation, sheet: [node.id] },
  }
}

/** Puts the character's persisted dress onto the workshop's only model. */
export function dressCharacterStage(assetId: string, dress: CharacterExtras['dress']): void {
  const documentId = workshopIdOf(assetId)
  const scene = sceneOf(useScenes.getState(), documentId)
  const node = scene.nodes[0]
  if (node?.type !== 'model' || node.model.dress === dress) return

  useScenes.getState().replace(documentId, {
    ...scene,
    nodes: [{ ...node, model: { ...node.model, dress } }],
  })
}
