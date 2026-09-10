import { mdiCogOutline, mdiFileImageOutline, mdiTextureBox } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { Asset } from '@shared/domain/asset'
import type { PbrChannel } from '@shared/domain/material'
import { rowSkin } from '@/components/styles'
import { TileMark } from '@/components/TileMark'
import type { ChannelMap, ChannelOrigin } from '@/engines/material/materialState'
import { cn } from '@/helpers/cn'
import type { EditPixels } from '@/helpers/openAsset'
import { PictureField } from '../../../../components/PictureField'
import { ChannelsSectionMenuRows } from './ChannelsSectionMenuRows'
import type { ChannelDerivation } from '../../../shell/components/derivation'

export type ChannelsSectionRowProps = {
  channel: PbrChannel
  /** What this channel holds, or `null` for one the material answers with a scalar alone. */
  map: ChannelMap | null
  /** Whether the document is currently showing this channel flat instead of the lit material. */
  inspected: boolean
  derivation: ChannelDerivation | null
  onChange: (assetId: string | null) => void
  onDropAsset: (asset: Asset) => void
  /** Rows no browsable list carries — a computed channel. Resolution only; see `PictureField`. */
  alsoKnown?: readonly Asset[]
  /** Brings this channel's file out into the explorer. `null` for one already out there. */
  onShow: (() => void) | null
  onInspect: () => void
  /** Painting this channel, or `null` where there is nothing to paint — see `editPixelsOf`. */
  pixels: EditPixels | null
}

/**
 * What each origin looks like. The distinction is the point: a *derived* channel was computed from
 * another channel of this same texture, a *generated* one is frozen at what the model answered, and
 * an *imported* one is the user's own file. Someone about to repaint a height map needs to know.
 */
const ORIGINS: Record<ChannelOrigin, { icon: string; key: string }> = {
  generated: { icon: mdiTextureBox, key: 'material.originGenerated' },
  derived: { icon: mdiCogOutline, key: 'material.originDerived' },
  imported: { icon: mdiFileImageOutline, key: 'material.originImported' },
}

/**
 * One channel of a material, as the link row every texture slot of the studio already is.
 *
 * Three gestures, the studio's own: a click CHOOSES another picture, a double-click opens its
 * pixels, and the right-click holds what is left — looking at the channel flat, and computing it.
 */
export function ChannelsSectionRow({
  channel,
  map,
  inspected,
  derivation,
  onChange,
  onDropAsset,
  alsoKnown,
  onShow,
  onInspect,
  pixels,
}: ChannelsSectionRowProps) {
  const { t } = useTranslation()
  const name = t(`material.channel.${channel}`)
  const origin = map ? ORIGINS[map.origin] : null

  return (
    // `aria-current` rather than the tint alone: which of the eight is shown flat is a fact, and
    // a colour is not one a screen reader — or anyone reading without it — can hear.
    <div
      className={cn('min-w-0', rowSkin(inspected))}
      data-selected={inspected || undefined}
      aria-current={inspected || undefined}
    >
      <PictureField
        label={name}
        value={map?.assetId ?? null}
        onChange={onChange}
        onDropAsset={onDropAsset}
        scId={`material.channel.${channel}`}
        // Named even though the press names the button: the MENU reads these words out loud, and
        // painting a channel was reachable from nowhere else once its own menu went away.
        open={
          pixels
            ? { label: t('assets.editPixels'), hint: t('assets.editPixelsHint'), run: pixels.run }
            : null
        }
        alsoKnown={alsoKnown}
        badge={origin && <TileMark icon={origin.icon} label={t(origin.key)} />}
        menuExtra={close => (
          <ChannelsSectionMenuRows
            derivation={derivation}
            inspected={inspected}
            channel={name}
            onInspect={onInspect}
            onShow={onShow}
            onClose={close}
          />
        )}
      />
    </div>
  )
}
