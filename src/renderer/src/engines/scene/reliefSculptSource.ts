import type { HeightmapSamples } from '@shared/domain/heightmap'
import type { ReliefExtent, ReliefMask, ReliefOverlay, ReliefSculpt } from '@shared/domain/relief'
import type { TerrainEditLayer } from '@shared/domain/scene'

export type ReliefSculptSource = {
  samples: HeightmapSamples
  extent: ReliefExtent
  grain: number
  sculpt: ReliefSculpt | undefined
  maskWeights: ReliefSculpt | undefined
  overlayAlpha: number
  overlayMask?: ReliefMask
  /** Enabled overlays other than the armed edit, so smooth/flatten see combined height. */
  overlays: readonly ReliefOverlay[]
}

export function reliefSculptSourceOf(
  held: {
    samples: HeightmapSamples
    extent: ReliefExtent
    grain: number
    edits: readonly TerrainEditLayer[]
  },
  edit: TerrainEditLayer,
): ReliefSculptSource {
  return {
    samples: held.samples,
    extent: held.extent,
    grain: held.grain,
    sculpt: edit.sculpt,
    maskWeights: edit.mask?.kind === 'painted' ? edit.mask.weights : undefined,
    overlayAlpha: edit.alpha,
    overlayMask: edit.mask,
    overlays: held.edits
      .filter(candidate => candidate.id !== edit.id)
      .map(candidate => ({
        enabled: candidate.enabled,
        alpha: candidate.alpha,
        sculpt: candidate.sculpt,
        mask: candidate.mask,
      })),
  }
}
