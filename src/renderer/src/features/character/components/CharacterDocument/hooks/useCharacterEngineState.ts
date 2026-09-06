import { useEffect } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '@shared/domain/settings'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { characterOf, useCharacters } from '@/stores/character'
import type { characterViewOf } from '@/stores/characterView'

/**
 * The decor is this tab's own — it shows bones on a grid, never the studio's helpers. The two
 * NAVIGATION preferences are the person's, and follow them here as they do in a scene.
 */
function characterViewport(three: Settings['three']): Settings['three'] {
  return {
    ...DEFAULT_SETTINGS.three,
    orbitAroundSelection: three.orbitAroundSelection,
    orbitUnderCursor: three.orbitUnderCursor,
    showGrid: true,
    lightHelpers: 'off',
    cameraHelpers: 'off',
    boundingBoxes: 'off',
  }
}

/** Pushes what the character's own view holds into the live engine — the gizmo's side of it. */
export function useCharacterEngineState(
  engine: SceneRenderer | null,
  assetId: string,
  nodeId: string | undefined,
  view: ReturnType<typeof characterViewOf>,
  navigating: boolean,
  three: Settings['three'],
): void {
  useEffect(() => engine?.setNavigating(navigating), [engine, navigating])
  useEffect(() => engine?.setMode(view.mode), [engine, view.mode])
  useEffect(() => engine?.configure(characterViewport(three)), [engine, three])

  // 🛑 The padlocks reach the DRAG, not just the release: unheld for the length of a gesture, a
  // joint leaves the axis a hand meant to keep it on — seen on screen the 2026-09-02.
  useEffect(() => engine?.setHeldBoneAxes(view.heldAxes), [engine, view.heldAxes])

  // 🛑 The rest is put back BEFORE the engine measures the skins against it: a bone left where a
  // pose placed it would be bound there, and that pose would become the character's own shape.
  useEffect(() => {
    if (!engine || !nodeId) return

    if (view.editingRest)
      for (const bone of characterOf(useCharacters.getState(), assetId).rig?.bones ?? [])
        engine.poseBone(nodeId, bone.name, bone.rest)

    engine.setRestEditing(view.editingRest)
  }, [engine, view.editingRest, assetId, nodeId])

  // 🛑 What puts a gizmo on a joint, and paints it as the chosen one. Without it the engine hears
  // its own pick back from nobody: a bone could be named by the panel and still not be held.
  useEffect(() => {
    engine?.setPickedBone(view.pickedBone && nodeId ? { nodeId, bone: view.pickedBone } : null)
  }, [engine, view.pickedBone, nodeId])
}
