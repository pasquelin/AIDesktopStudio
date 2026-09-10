import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PICTURES } from '@shared/domain/asset'
import { PBR_CHANNELS, type PbrChannel } from '@shared/domain/material'
import { PropertySection } from '@/components/PropertySection'
import { setChannel } from '@/engines/material/commands'
import { canDerive, sourceFor } from '@/engines/material/materialState'
import { editPixelsOf, type EditPixels } from '@/helpers/openAsset'
import { useKnownAssets } from '@/hooks/useKnownAssets'
import { useProjectPictureAssets } from '@/hooks/useProjectPictureAssets'
import { placeMaterialChannel } from '@/features/material/components/placeChannel'
import { showInternalResource } from '@/features/material/showInternalResource'
import { isPrivatePath } from '@shared/domain/folder'
import { inspectedChannel, useMaterialViews } from '@/stores/materialViews'
import { materialOf, useMaterials } from '@/stores/materials'
import { ChannelsSectionRow } from './ChannelsSectionRow'
import type { DerivationState } from '../../../shell/components/derivation'

export type ChannelsSectionProps = { documentId: string }

/**
 * The eight channels a material is made of, one link row each.
 *
 * First of the inspector, for the reason the rail gave when this was a panel of its own: it is
 * what the space is for.
 *
 * `memo`, like `EnvironmentSection` and for the same measured reason: the panel above re-renders
 * on every value a slider drag emits, and this subtree rebuilds eight lists of every picture the
 * project holds. Its one prop is a string, so nothing has to be stabilised for it to hold.
 */
export const ChannelsSection = memo(function ChannelsSection({ documentId }: ChannelsSectionProps) {
  const { t } = useTranslation()
  const channels = useMaterials(state => materialOf(state, documentId).channels)

  /**
   * Asked of the CATALOGUE, never filtered out of `useAssets`: that shelf is the scope the browser
   * is asking for, and the Materials space narrows it to `['image']`. Held as ASSETS
   * because `placeMaterialChannel` keeps what the picture measures.
   */
  const offered = useProjectPictureAssets(PICTURES)
  /**
   * The channels' own rows, asked by id — the only query that reaches a computed channel, which
   * lives in the durable internal store and is deliberately absent from every browsable list.
   * Merged for RESOLUTION alone: what a slot offers to pick stays the project's own pictures.
   */
  const held = useKnownAssets(
    useMemo(
      () => PBR_CHANNELS.map(one => channels[one]?.assetId ?? '').filter(Boolean),
      [channels],
    ),
  )
  const pictures = useMemo(
    () => [...offered, ...held.filter(one => !offered.some(other => other.id === one.id))],
    [offered, held],
  )

  const run = useMaterials(state => state.runCommand)
  const inspected = useMaterialViews(state => inspectedChannel(state, documentId))
  const inspect = useMaterialViews(state => state.inspect)

  const [deriving, setDeriving] = useState<PbrChannel | null>(null)

  /**
   * Reached by an `import()` rather than at the top of the file: the inspector is in the opening
   * chunk, and the derivation carries three.js and a WebGL renderer behind it. A channel is
   * computed once in a while, by hand — the wait to fetch its chunk is the click itself.
   */
  const derive = async (channel: PbrChannel): Promise<void> => {
    setDeriving(channel)
    try {
      const { deriveMaterialChannel } = await import('@/features/material/deriveChannel')
      await deriveMaterialChannel(documentId, channel)
    } finally {
      setDeriving(null)
    }
  }

  /**
   * One derivation at a time: each opens a WebGL context of its own, and a browser stops handing
   * them out around sixteen. So the other rows go dead rather than merely unmarked — and they say
   * why, which is the difference between waiting and being broken.
   */
  const derivationState = (channel: PbrChannel): DerivationState => {
    if (deriving === channel) return 'running'
    if (deriving) return 'blocked'
    return canDerive(channels, channel) ? 'ready' : 'missing'
  }

  // Not this space: a material is assembled here and its images are painted in Images.
  // The empty channels leave first: eight of these run per render, and a channel holding nothing
  // would otherwise walk the whole project's pictures to answer `undefined`.
  const editPixels = (channel: PbrChannel): EditPixels | null => {
    const assetId = channels[channel]?.assetId
    if (!assetId) return null

    return editPixelsOf(pictures.find(candidate => candidate.id === assetId))
  }

  // The list only offers what can be decoded, so the row it names is always there; the `if` is
  // what the type asks for, not a case a user reaches.
  const pick = (channel: PbrChannel, assetId: string | null): void => {
    if (assetId === null) return run(documentId, setChannel(channel, null))

    const asset = pictures.find(candidate => candidate.id === assetId)
    if (asset) placeMaterialChannel(documentId, asset, channel)
  }

  /**
   * The gesture that brings a computed channel out of the durable internal store — §6.7, T7.
   *
   * `null` for a channel whose file is already in the tree, and for an empty one: an offer that
   * does nothing is worse than no offer. MOVED by the main process, so the project weighs the
   * same afterwards and the material goes on drawing it — it cites an id, never a path.
   */
  const showableChannel = (channel: PbrChannel): (() => void) | null => {
    const assetId = channels[channel]?.assetId
    const asset = assetId ? held.find(one => one.id === assetId) : undefined
    if (!asset?.path || !isPrivatePath(asset.path)) return null
    return () => void showInternalResource(asset.id)
  }

  // Derived where both stores are visible, as the document derives it: a channel emptied while it
  // was the one being looked at left its row marked AND unpressable, saying two things at once.
  const shown = inspected && channels[inspected] ? inspected : null

  return (
    <PropertySection title={t('inspector.channels')} scId="material.channels">
      {PBR_CHANNELS.map(channel => {
        // `sourceFor` alone decides whether a derivation exists: it is the domain's own answer, and
        // a test holds it against the table of shaders so the two cannot drift apart.
        const from = sourceFor(channel)

        return (
          <ChannelsSectionRow
            key={channel}
            channel={channel}
            map={channels[channel] ?? null}
            inspected={shown === channel}
            derivation={
              from && {
                source: from,
                state: derivationState(channel),
                run: () => void derive(channel),
              }
            }
            onChange={assetId => pick(channel, assetId)}
            // The drop hands over the ASSET, so the one refusal a channel has — a cloud row with
            // no file to decode yet — is spoken where it holds the name to say which file.
            onDropAsset={asset => void placeMaterialChannel(documentId, asset, channel)}
            alsoKnown={held}
            onShow={showableChannel(channel)}
            // Pressing the one already shown flat goes back to the lit material: one gesture in and
            // out, rather than a second control to find.
            onInspect={() => inspect(documentId, shown === channel ? null : channel)}
            pixels={editPixels(channel)}
          />
        )
      })}
    </PropertySection>
  )
})
