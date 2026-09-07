import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { partsOfRole, type AiRoleId } from '@shared/domain/aiRole'
import type { AvailableInput } from '@shared/domain/aiCapability'
import {
  availableInputsOf,
  type GenerationInput,
  type WithdrawableInput,
} from '@/generation/generationInputs'
import { resolveCapability, type CapabilityChoice } from '@/generation/capabilityResolver'
import { nameOf } from '@shared/domain/folder'
import { selectedNodes } from '@/engines/scene/sceneState'
import { usePickedRows } from './usePickedRows'
import { deselect } from '@/helpers/selection'
import { workspaceById } from '@/helpers/workspaces'
import { useAssets, assetsById } from '@/stores/assets'
import { activeImageId, activeSceneId, activeScriptId, useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { sceneOf, selectIn, useScenes } from '@/stores/scenes'
import { latestGenerationIds, useJobs } from '@/stores/jobs'
import { selectedFilePaths, useSelection } from '@/stores/selection'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'
import { writtenGenerationComments } from '@/features/image/generationComments'

/**
 * What the AI side knows of the workspace right now — the § 9 of the brief.
 *
 * The panel reads THIS and never a viewport: the resolution is pure (`generationInputs.ts`,
 * `capabilityResolver.ts`) and this is the one place that gathers the state it works from.
 */
export type GenerationContext = {
  inputs: readonly GenerationInput[]
  capability: CapabilityChoice
  /** Takes one input off by undoing the gesture that offered it; a result has none to undo. */
  withdraw: (input: WithdrawableInput) => void
}

/**
 * Gathers what is at hand and works out the operation it points at.
 *
 * `forced` is what the person asked for explicitly, and it wins while the context can still
 * reach it — § 21: a selection changing under their hand must not take the operation away.
 */
export function useGenerationContext(forced: AiRoleId | null): GenerationContext {
  const workspace = useLayouts(state => state.activeWorkspace)
  // The forced employment's own family, when it has one: a canvas edit reaches OUTSIDE the space
  // it was made in — Enlarge asks for an upscaler while the image workspace is in front.
  const family = (forced && partsOfRole(forced)?.family) ?? workspaceById(workspace).family

  /**
   * 🛑 Asked OF the catalogue, never off `useAssets.items`: that store pages two hundred rows at
   * a time, so a file picked past the first page would have offered nothing at all, in silence.
   */
  const pickedPaths = useSelection(selectedFilePaths)
  const pickedRows = usePickedRows(pickedPaths)
  const rows = useAssets(assetsById)

  /**
   * 🛑 The narrow answers, never the document states: every scene command and every canvas edit
   * replaces those objects, and a subscription to one turned a gizmo drag into a re-render of the
   * whole panel — form, picker and sources.
   */
  const sceneId = useDocuments(activeSceneId)
  // 🛑 STRINGS across the subscription, never objects: `useShallow` compares the entries with
  // `Object.is`, so an array of fresh `{ id, name }` is a new snapshot every read — an endless
  // re-render the moment a scene holds one selected model. Paired back into rows below.
  const meshKeys = useScenes(
    useShallow(state => (sceneId ? selectedMeshKeysOf(sceneOf(state, sceneId)) : NO_KEYS)),
  )

  const meshes = useMemo(() => meshKeys.map(meshOfKey), [meshKeys])

  // § 24: what the last generation produced, so a chain starts from it without a round trip
  // through the shelf. Ids rather than rows, so a catalogue refresh does not re-render this.
  const producedIds = useJobs(latestGenerationIds)

  const inputs = useMemo(() => {
    return availableInputsOf({
      // In the ORDER they were picked, which the catalogue's answer does not keep: the panel
      // fills each slot of the contract from the first input that fits.
      selectedFiles: pickedPaths.flatMap(path => {
        const asset = pickedRows.get(path)
        // The FILE's name, as the explorer shows it: a catalogue row is filed under its stem, and
        // a `concept.png` clicked in the tree stood under the thumbnail as `concept`.
        return asset ? [{ assetId: asset.id, name: nameOf(path), path, type: asset.type }] : []
      }),
      selectedMeshes: meshes,
      results: producedIds.flatMap(id => {
        const asset = rows.get(id)
        return asset ? [{ id: asset.id, name: asset.name, type: asset.type }] : []
      }),
    })
  }, [pickedPaths, pickedRows, rows, meshes, producedIds])

  /**
   * 🛑 Undone where it was DONE, never filtered here: a panel-side list of dismissed ids would
   * leave the explorer showing a row as picked while the generation no longer took it.
   */
  const withdraw = useCallback((input: WithdrawableInput) => {
    // Both read at CALL time, never from the render that drew the row: a click landing after
    // the selection moved would otherwise act on a list nobody holds any more.
    if (input.origin === 'scene') {
      const documentId = activeSceneId(useDocuments.getState())
      if (documentId === null) return

      const scene = sceneOf(useScenes.getState(), documentId)
      selectIn(documentId, deselect(scene.selectedIds, input.nodeId))
      return
    }

    const picked = selectedFilePaths(useSelection.getState())
    useSelection.getState().selectFiles(deselect(picked, input.path))
  }, [])

  // Offered to the resolver and to nothing else: there is no catalogue row to attach and no
  // thumbnail to draw. Its TEXT travels in the body — see `bodyExtras`.
  const scriptId = useDocuments(activeScriptId)
  const imageId = useDocuments(activeImageId)
  const annotatedImage = useGenerationComments(
    state => writtenGenerationComments(generationCommentsOf(state, imageId)).length > 0,
  )

  const available = useMemo<readonly AvailableInput[]>(
    () => [
      ...inputs,
      ...(scriptId === null ? [] : [SCRIPT_AT_HAND]),
      ...(annotatedImage ? [IMAGE_AT_HAND] : []),
    ],
    [inputs, scriptId, annotatedImage],
  )

  // Memoised with the inputs it reads: the resolution allocates a contract per required input,
  // and the panel re-renders on every keystroke of the form below it.
  const capability = useMemo(
    () => resolveCapability(family, available, forced),
    [family, available, forced],
  )

  return useMemo(() => ({ inputs, capability, withdraw }), [inputs, capability, withdraw])
}

/** Stable, so a workspace with no scene open does not hand React a new array per render. */
const NO_KEYS: readonly string[] = []

/** The open script, as the resolver sees it. Frozen once: it carries no id and never varies. */
const SCRIPT_AT_HAND: AvailableInput = { role: 'source', kind: 'code' }
const IMAGE_AT_HAND: AvailableInput = { role: 'source', kind: 'image' }

/** A separator no node name can hold, so the three parts travel as one comparable string. */
const KEY_PART = '\u0000'

/**
 * The meshes a scene has selected, by the catalogue row each placement references.
 *
 * A node is not an asset: what a scene selects is a placement, and anything but a model has no
 * file to send.
 */
function selectedMeshKeysOf(scene: ReturnType<typeof sceneOf>): readonly string[] {
  // Guarded on the commonest case: `selectedNodes` indexes every node of the scene, and this runs
  // on every emission of the scene store — a pointer gesture writes at 60 Hz.
  if (scene.selectedIds.length === 0) return NO_KEYS

  // Through `selectedNodes`, which keeps the ORDER OF SELECTION — the panel fills each slot from
  // the first input that fits, and tree order would hand it the wrong one.
  const picked = selectedNodes(scene.nodes, scene.selectedIds).flatMap(node =>
    node.type === 'model'
      ? [`${node.id}${KEY_PART}${node.model.assetId}${KEY_PART}${node.name}`]
      : [],
  )

  return picked.length === 0 ? NO_KEYS : picked
}

function meshOfKey(key: string): { assetId: string; name: string; nodeId: string } {
  const [nodeId = '', assetId = '', name = ''] = key.split(KEY_PART)
  return { assetId, name, nodeId }
}
