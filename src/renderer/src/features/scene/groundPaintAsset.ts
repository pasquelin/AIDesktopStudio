import i18next from 'i18next'
import { bytesToBase64 } from '@shared/base64'
import type { GroundPaint } from '@shared/domain/groundPaint'
import type { ReliefLayer } from '@shared/domain/scene'
import { encodePng } from '@/engines/material/derive/offscreen'
import { setTerrainGroundWeights } from '@/engines/scene/reliefCommands'
import { fetchAsset } from '@/helpers/assetFetch'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { useAssets } from '@/stores/assets'
import { sceneOf, useScenes } from '@/stores/scenes'

export type GroundPaintCodec = {
  encode: (paint: GroundPaint) => Promise<Uint8Array>
  decode: (assetId: string) => Promise<GroundPaint>
}

export const groundPaintCodec: GroundPaintCodec = {
  encode: async paint => {
    const canvas = document.createElement('canvas')
    canvas.width = paint.width
    canvas.height = paint.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas is unavailable')
    context.putImageData(
      new ImageData(Uint8ClampedArray.from(paint.pixels), paint.width, paint.height),
      0,
      0,
    )
    return encodePng(canvas)
  },
  decode: async assetId => {
    const bitmap = await createImageBitmap(await (await fetchAsset(assetId)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas is unavailable')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    return {
      width: canvas.width,
      height: canvas.height,
      pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
    }
  },
}

export async function saveGroundPaint(
  documentId: string,
  terrainId: string,
  paint: GroundPaint,
  codec: GroundPaintCodec = groundPaintCodec,
): Promise<boolean> {
  const bridge = getBridge()
  const terrain = terrainOf(documentId, terrainId)
  if (!bridge || !terrain) return false
  try {
    const png = await codec.encode(paint)
    const previous = terrain.groundWeights?.assetId
    const asset = await bridge.assets.savePicture({
      name: i18next.t('world.groundPaintName', { name: terrain.name }),
      png: bytesToBase64(png),
      ...(previous ? { derivedFrom: previous } : {}),
    })
    await useAssets.getState().refresh()
    const current = terrainOf(documentId, terrainId)
    if (!current || current.groundWeights?.assetId !== previous) return false
    useScenes
      .getState()
      .runCommand(documentId, setTerrainGroundWeights(terrainId, { assetId: asset.id }))
    return true
  } catch (error) {
    reportFailure('scene.model', terrainId, error)
    return false
  }
}

export async function loadGroundPaint(
  documentId: string,
  terrainId: string,
  codec: GroundPaintCodec = groundPaintCodec,
): Promise<GroundPaint | null> {
  const terrain = terrainOf(documentId, terrainId)
  const assetId = terrain?.groundWeights?.assetId
  if (!assetId) return null
  try {
    return await codec.decode(assetId)
  } catch (error) {
    reportFailure('scene.model', terrainId, error)
    return null
  }
}

function terrainOf(documentId: string, terrainId: string): ReliefLayer | undefined {
  return sceneOf(useScenes.getState(), documentId).world.layers.find(
    (layer): layer is ReliefLayer => layer.kind === 'relief' && layer.id === terrainId,
  )
}
