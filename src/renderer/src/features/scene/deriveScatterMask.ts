import { scatterMaskFromGroundPaint } from '@shared/domain/groundPaintMask'
import type { GroundMaterialChannel, ReliefLayer, ScatterLayer } from '@shared/domain/scene'
import { setScatterMask } from '@/engines/scene/scatterCommands'
import { reportFailure } from '@/services/diagnostics'
import { sceneOf, useScenes } from '@/stores/scenes'
import { loadGroundPaint, type GroundPaintCodec } from './groundPaintAsset'

export async function deriveScatterMask(
  documentId: string,
  scatterId: string,
  codec?: GroundPaintCodec,
  channel: GroundMaterialChannel = 'r',
): Promise<boolean> {
  const world = sceneOf(useScenes.getState(), documentId).world
  const scatter = world.layers.find(
    (layer): layer is ScatterLayer => layer.kind === 'scatter' && layer.id === scatterId,
  )
  if (!scatter) return false
  const terrain = world.layers.find(
    (layer): layer is ReliefLayer =>
      layer.kind === 'relief' &&
      layer.enabled &&
      layer.groundWeights !== null &&
      overlaps(layer, scatter),
  )
  if (!terrain) return false
  const paint = await loadGroundPaint(documentId, terrain.id, codec)
  if (!paint) return false
  try {
    useScenes.getState().runCommand(
      documentId,
      setScatterMask(scatterId, {
        kind: 'painted',
        weights: scatterMaskFromGroundPaint(paint, terrain, scatter, scatter.grain, channel),
      }),
    )
    return true
  } catch (error) {
    reportFailure('scene.model', scatterId, error)
    return false
  }
}

function overlaps(terrain: ReliefLayer, scatter: ScatterLayer): boolean {
  return (
    terrain.origin.x < scatter.origin.x + scatter.size.x &&
    terrain.origin.x + terrain.size.x > scatter.origin.x &&
    terrain.origin.z < scatter.origin.z + scatter.size.z &&
    terrain.origin.z + terrain.size.z > scatter.origin.z
  )
}
