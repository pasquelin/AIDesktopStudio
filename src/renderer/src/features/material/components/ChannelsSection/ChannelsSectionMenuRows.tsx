import { mdiCogOutline, mdiEyeOutline, mdiImageFilterBlackWhite } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { MenuRow } from '@/components/MenuRow'
import { HINT_RIGHT } from '@/helpers/tooltip'
import { DERIVE_LABELS, type ChannelDerivation } from '../../../shell/components/derivation'

export type ChannelsSectionMenuRowsProps = {
  derivation: ChannelDerivation | null
  /** Whether the document is showing this channel flat rather than the lit material. */
  inspected: boolean
  /** The channel's own name, already translated — the row reads it once for both of us. */
  channel: string
  onInspect: () => void
  /**
   * Brings a channel the studio computed out into the explorer — absent for one that is already
   * there. The pair of the hiding: a resource nothing can bring out is a resource the user lost.
   */
  onShow: (() => void) | null
  onClose: () => void
}

/**
 * What a CHANNEL can be asked that no other picture slot can: to be looked at flat, and to be
 * computed from another channel. Everything a SLOT can do is `PictureFieldMenu`'s.
 */
export function ChannelsSectionMenuRows({
  derivation,
  inspected,
  channel,
  onInspect,
  onShow,
  onClose,
}: ChannelsSectionMenuRowsProps) {
  const { t } = useTranslation()

  return (
    <>
      <MenuRow
        label={t(inspected ? 'material.showMaterial' : 'material.inspectChannel', { channel })}
        icon={mdiImageFilterBlackWhite}
        tip={HINT_RIGHT(t('material.inspectChannelHint'))}
        onSelect={() => {
          onInspect()
          onClose()
        }}
      />

      {onShow && (
        <MenuRow
          label={t('material.showInExplorer')}
          icon={mdiEyeOutline}
          tip={HINT_RIGHT(t('material.showInExplorerHint'))}
          onSelect={() => {
            onShow()
            onClose()
          }}
        />
      )}

      {derivation && (
        <MenuRow
          label={t(DERIVE_LABELS[derivation.state], {
            source: t(`material.channel.${derivation.source}`),
          })}
          icon={mdiCogOutline}
          disabled={derivation.state !== 'ready'}
          tip={HINT_RIGHT(t('material.deriveHint'))}
          onSelect={() => {
            derivation.run()
            onClose()
          }}
        />
      )}
    </>
  )
}
