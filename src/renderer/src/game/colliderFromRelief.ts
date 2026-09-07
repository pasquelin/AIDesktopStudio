import type { HeightmapSamples } from '@shared/domain/heightmap'
import { reliefReader, texelStep, worldY } from '@shared/domain/relief'
import type { ReliefLayer } from '@shared/domain/scene'
import type { ColliderShape } from '@game/physics/shape'

/**
 * What a relief is FELT as, derived from the same base+delta grid the surface draws.
 * The heightmap belongs to the studio, so the samples arrive as a parameter.
 */
export function colliderFromRelief(
  layer: ReliefLayer,
  samples: HeightmapSamples,
): ColliderShape | null {
  if (samples.width < 2 || samples.height < 2) return null

  const read = reliefReader(samples, layer.grain, layer.edits, layer)
  const heights = new Float32Array(samples.width * samples.height)
  for (let z = 0; z < samples.height; z++) {
    for (let x = 0; x < samples.width; x++) {
      heights[z * samples.width + x] = worldY(read(x, z), layer.elevation)
    }
  }

  const step = texelStep(layer.size, samples)
  return {
    kind: 'heightfield',
    heights,
    width: samples.width,
    height: samples.height,
    offset: { x: layer.origin.x, y: 0, z: layer.origin.z },
    scale: { x: step.x, y: 1, z: step.z },
  }
}
