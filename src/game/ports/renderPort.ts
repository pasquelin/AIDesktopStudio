// SPDX-License-Identifier: MIT

import type { CameraView, Transform } from '@shared/domain/transform'

export type { CameraView }

/** Where one entity of a document stands, once a step has moved it. */
export type EntityPlacement = { entity: string; transform: Transform }

/**
 * What a step hands to whatever draws: one call for every entity that moved, for the reason
 * `InputState` gives. Placing only — what SPAWNS an entity belongs to the world, which has none.
 */
export type RenderPort = {
  place: (moved: readonly EntityPlacement[]) => void
  /**
   * How far the picture is veiled, from 0 (nothing) to 1 (whole).
   *
   * 🛑 A NUMBER and not an effect: what a fade LOOKS like belongs to whatever draws, and a
   * runtime that composed one would be a second renderer. A host with nothing to veil with does
   * nothing, and the game plays on — which is what an exported one without the studio does.
   */
  veil: (amount: number) => void
  /**
   * Where the game wants to be watched FROM, once a step has settled. Nothing means the scene
   * is flown by hand — `orbit`, and the runtime must then not touch the camera at all.
   */
  view: (view: CameraView | null) => void
}
