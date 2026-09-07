import { isWorn } from '@shared/domain/scene'
import type {
  ModelDress,
  ModelDressRef,
  ModelMaterial,
  TextureRef,
  TextureSlot,
} from '@shared/domain/scene'
import { PBR_CHANNELS, slotForChannel, type MaterialSettings } from '@shared/domain/material'
import { cachedOn } from '@/engines/core/cachedOn'
import type { ChannelSet, MaterialState } from '@/engines/material/materialState'
import { loadMaterialSource, wornMaterialOf } from '@/stores/materialSources'
import { assetsById, rememberAssets, useAssets } from '@/stores/assets'
import { getBridge } from '@/services/bridge'

/**
 * What a model's dress is worth to ONE of its material slots — the port every scene takes.
 *
 * Synchronous: the open tab first, then the copy read off disk, `null` while neither has arrived.
 * The cavity, the two ranges and the green flip are dropped — a scene draws no such shader.
 */
export function wornModelDress(dress: ModelDressRef, slot: number): ModelDress | null {
  if (dress.kind === 'plain') return PLAIN_DRESS
  if (dress.kind === 'image') return coveredBy(dress.assetId)

  const materialId = dress.documentIds[slot]
  if (!isWorn(materialId)) return null

  const state = wornMaterialOf(materialId)
  if (state) return modelDressOf(state)

  void loadMaterialSource(materialId)
  return null
}

export function extractedModelDress(assetId: string): ModelDressRef | undefined {
  const documentIds = assetsById(useAssets.getState()).get(assetId)?.modelMaterialIds
  return documentIds ? { kind: 'materials', documentIds } : undefined
}

export async function prepareExtractedModelDress(assetId: string): Promise<void> {
  if (assetsById(useAssets.getState()).has(assetId)) return
  const bridge = getBridge()
  if (!bridge) return
  const assets = await bridge.assets.search({ ids: [assetId], limit: 1 })
  rememberAssets(assets)
}

const PLAIN_DRESS: ModelDress = Object.freeze({ textures: {}, fileTextures: false })

/** Asked once per SLOT of every model wearing it, on every refresh — held against its state. */
const dresses = new WeakMap<MaterialState, ModelDress>()

/**
 * The same dress for every slot of a model covered by one picture — held, since this is asked per
 * slot on each pass and three objects a slot is pure litter.
 */
const covers = new Map<string, ModelDress>()

function coveredBy(assetId: string): ModelDress {
  if (!isWorn(assetId)) return PLAIN_DRESS

  const held = covers.get(assetId)
  if (held) return held

  const made: ModelDress = { textures: { map: { assetId } }, fileTextures: false }
  covers.set(assetId, made)
  return made
}

export function modelDressOf(state: MaterialState): ModelDress {
  return cachedOn(dresses, state, () => ({
    textures: slotsOf(state.channels),
    material: modelFinishOf(state.material),
  }))
}

function slotsOf(channels: ChannelSet): Partial<Record<TextureSlot, TextureRef>> {
  const slots: Partial<Record<TextureSlot, TextureRef>> = {}

  for (const channel of PBR_CHANNELS) {
    const slot = slotForChannel(channel)
    const held = channels[channel]
    if (slot && held) {
      slots[slot] = {
        assetId: held.assetId,
        ...(held.transform ? { transform: held.transform } : {}),
        ...(held.sampling ? { sampling: held.sampling } : {}),
      }
    }
  }

  return slots
}

function modelFinishOf(material: MaterialSettings): ModelMaterial {
  return {
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
    normalScale: material.normalScale,
    aoIntensity: material.aoIntensity,
    emissive: material.emissive,
    emissiveIntensity: material.emissiveIntensity,
    tiling: { x: material.tiling.x, y: material.tiling.y },
    offset: { x: material.offset.x, y: material.offset.y },
    rotation: material.rotation,
  }
}
