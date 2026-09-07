import { isLocalPicture, type Asset } from '@shared/domain/asset'
import type { PbrChannel } from '@shared/domain/material'
import { reportFailure } from '@/services/diagnostics'
import { setChannel } from '@/engines/material/commands'
import { useMaterials } from '@/stores/materials'

/**
 * Puts a picture into one channel of a material.
 *
 * Shared by the drop on the viewport and by "send to Materials" in the shelf menu: both mean the
 * same thing, and writing the command twice is how the two would come to disagree about which
 * channel a bare drop fills.
 *
 * Answers whether it landed: a cloud asset has no file to decode yet. What spares the user the
 * silence is `ASSET_INTENTS`, whose `ready` asks the same question before offering the
 * destination at all — this guard is the one that holds when it is called from anywhere else.
 */
export function placeMaterialChannel(
  documentId: string,
  asset: Asset,
  channel: PbrChannel = 'baseColor',
): boolean {
  if (!isLocalPicture(asset)) {
    // Said rather than swallowed. `AssetDropTarget` cannot refuse this one while it flies — a drag
    // announces its TYPE and not where its file is — so the refusal can only be spoken here, and
    // the JSDoc of that component is explicit that a silent drop is the worse of the two.
    reportFailure('material.channel', asset.id, new Error(`${asset.name} has no local file yet`))
    return false
  }

  useMaterials.getState().runCommand(
    documentId,
    setChannel(channel, {
      assetId: asset.id,
      origin: 'imported',
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      ...(asset.textureTransform ? { transform: asset.textureTransform } : {}),
      ...(asset.textureSampling ? { sampling: asset.textureSampling } : {}),
    }),
  )
  return true
}
