import i18next from 'i18next'
import { assetUrl, type Asset } from '@shared/domain/asset'
import type { PbrChannel } from '@shared/domain/material'
import { loadTexture } from '@/engines/scene/textureCache'
import { createUnpackPort, type UnpackPort } from '@/engines/material/derive/unpackPort'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'

/** The GPU port, built once. It holds nothing: a context is made and released per unpacking. */
const gpuUnpack = createUnpackPort({ loadTexture })

/**
 * What each glTF slot packs, in the studio's own channels — the reason a picture with no `map`
 * cannot simply be offered for unpacking: a `clearcoatTexture` names something with no channel
 * at all, and reading a roughness out of it would write a measurement of nothing.
 */
export const PACKED_BY_SLOT: Record<string, readonly PbrChannel[]> = {
  metallicRoughnessTexture: ['roughness', 'metalness'],
}

/** The channels this picture can be split into, or none when nothing says what it packs. */
export function packedChannels(asset: Asset): readonly PbrChannel[] {
  return asset.packedSlot ? (PACKED_BY_SLOT[asset.packedSlot] ?? []) : []
}

/**
 * Splits a packed picture into one asset per channel it holds, and puts them in the project.
 *
 * New assets every time, never an overwrite — the same rule a derivation follows, and for the
 * same reason: the packed file is what the model was exported with, and it is not the studio's
 * to replace. They land `derivedFrom` the PACKED picture rather than the model, so a second
 * unpacking of the same file is traceable to what it came out of.
 *
 * Answers what landed, so a caller can put each piece in its channel without asking the catalogue
 * again — and **the shelf is that caller's to refresh**, once for whatever it unpacked.
 */
export async function unpackMaterialChannels(
  asset: Asset,
  unpack: UnpackPort = gpuUnpack,
): Promise<readonly Asset[]> {
  const wanted = packedChannels(asset)
  const bridge = getBridge()
  if (wanted.length === 0 || !bridge) return []

  const landed: Asset[] = []
  for (const channel of wanted) {
    try {
      const picture = await unpack({ channel, sourceUrl: assetUrl(asset.id) })
      const saved = await bridge.assets.saveTexture({
        name: i18next.t('material.derivedName', {
          name: asset.name,
          channel: i18next.t(`material.channel.${channel}`),
        }),
        map: channel,
        derivedFrom: asset.id,
        png: picture.png,
      })
      landed.push({
        ...saved,
        ...(asset.textureTransform ? { textureTransform: asset.textureTransform } : {}),
        ...(asset.textureSampling ? { textureSampling: asset.textureSampling } : {}),
      })
    } catch (error) {
      reportFailure('material.channel', channel, error)
    }
  }

  return landed
}
