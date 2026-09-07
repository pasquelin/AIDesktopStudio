import i18next from 'i18next'
import { assetUrl } from '@shared/domain/asset'
import type { PbrChannel } from '@shared/domain/material'
import { loadTexture } from '@/engines/scene/textureCache'
import { createDerivePort, type DerivePort } from '@/engines/material/derive/derivePort'
import { setChannel } from '@/engines/material/commands'
import { sourceFor, type ChannelSet } from '@/engines/material/materialState'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { assetsById, useAssets } from '@/stores/assets'
import { materialOf, useMaterials } from '@/stores/materials'

/** The GPU port, built once. It holds nothing: a context is made and released per derivation. */
const gpuDerive = createDerivePort({ loadTexture })

type DerivationSnapshot = { source: string; target: string | undefined }

function movedChannel(
  documentId: string,
  from: PbrChannel,
  channel: PbrChannel,
  before: DerivationSnapshot,
): PbrChannel | null {
  const now = channels(documentId)
  if (now[from]?.assetId !== before.source) return from
  return now[channel]?.assetId !== before.target ? channel : null
}

function reportStale(channel: PbrChannel, which: PbrChannel): false {
  reportFailure('material.channel', channel, new Error(`${which} changed while deriving`))
  return false
}

async function saveDerivedChannel(
  documentId: string,
  channel: PbrChannel,
  from: PbrChannel,
  sourceAssetId: string,
  bridge: NonNullable<ReturnType<typeof getBridge>>,
  derive: DerivePort,
): Promise<boolean> {
  const before = { source: sourceAssetId, target: channels(documentId)[channel]?.assetId }
  try {
    const picture = await derive({ channel, sourceUrl: assetUrl(sourceAssetId) })
    const stale = movedChannel(documentId, from, channel, before)
    if (stale) return reportStale(channel, stale)
    const asset = await bridge.assets.saveTexture({
      name: derivedName(from, channel, sourceAssetId),
      map: channel,
      derivedFrom: sourceAssetId,
      png: picture.png,
    })
    await useAssets.getState().refresh()
    const late = movedChannel(documentId, from, channel, before)
    if (late) return reportStale(channel, late)
    useMaterials.getState().runCommand(
      documentId,
      setChannel(channel, {
        assetId: asset.id,
        origin: 'derived',
        width: picture.width,
        height: picture.height,
      }),
    )
    return true
  } catch (error) {
    reportFailure('material.channel', channel, error)
    return false
  }
}

/**
 * Computes one channel of a material from another, and puts the result in the project.
 *
 * A new asset every time, never an overwrite: a derivation is cheap to run again, and the file
 * a user could have painted over is not the studio's to replace. The channel it lands in is
 * badged `derived`, which is what tells it from the frozen output of a model.
 *
 * Answers whether it landed. Failures are reported rather than thrown: the caller is a menu
 * row, and a rejected promise there is a row that does nothing and says nothing.
 */
export async function deriveMaterialChannel(
  documentId: string,
  channel: PbrChannel,
  derive: DerivePort = gpuDerive,
): Promise<boolean> {
  const from = sourceFor(channel)
  const bridge = getBridge()
  if (!from || !bridge) return false

  const source = channels(documentId)[from]
  if (!source) {
    reportFailure('material.channel', channel, new Error(`${from} is empty`))
    return false
  }

  return saveDerivedChannel(documentId, channel, from, source.assetId, bridge, derive)
}

/** Read at call time, never captured: every check has to see the store as it is right now. */
function channels(documentId: string): ChannelSet {
  return materialOf(useMaterials.getState(), documentId).channels
}

/**
 * What the derived picture is called in the shelf. The source's own name is what makes it
 * findable among the eight a pack holds — an opaque id is not.
 */
function derivedName(from: PbrChannel, channel: PbrChannel, sourceAssetId: string): string {
  const source = assetsById(useAssets.getState()).get(sourceAssetId)
  return i18next.t('material.derivedName', {
    name: source?.name ?? i18next.t(`material.channel.${from}`),
    channel: i18next.t(`material.channel.${channel}`),
  })
}
