import { mdiLayers } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { MenuButton } from '@/components/MenuButton'
import { MenuRow } from '@/components/MenuRow'
import { HINT_RIGHT, TIP_RIGHT } from '@/helpers/tooltip'
import type { ReliefMask } from '@shared/domain/relief'
import type { ReliefLayer, TerrainEditLayer } from '@shared/domain/scene'

export function WorldToolsMaskMenu({
  terrain,
  edit,
  setMask,
}: {
  terrain: ReliefLayer
  edit: TerrainEditLayer
  setMask: (mask: ReliefMask | undefined) => void
}) {
  const { t } = useTranslation()
  const maskKind = edit.mask?.kind
  const maskLabel =
    maskKind === 'painted'
      ? t('world.maskPainted')
      : maskKind === 'height'
        ? t('world.maskHeight')
        : maskKind === 'slope'
          ? t('world.maskSlope')
          : t('world.maskNone')

  return (
    <MenuButton
      icon={mdiLayers}
      label={maskLabel}
      description={t('world.maskHint')}
      tooltip={TIP_RIGHT}
      variant="bar"
      rowCount={4}
      opensOnClick
      rows={close => (
        <>
          <MenuRow
            label={t('world.maskNone')}
            checked={!edit.mask}
            tick="on-off"
            tip={HINT_RIGHT(t('world.maskNoneHint'))}
            onSelect={() => {
              setMask(undefined)
              close()
            }}
          />
          <MenuRow
            label={t('world.maskPainted')}
            checked={edit.mask?.kind === 'painted'}
            tick="on-off"
            tip={HINT_RIGHT(t('world.maskPaintedHint'))}
            onSelect={() => {
              if (edit.mask?.kind !== 'painted')
                setMask({ kind: 'painted', weights: { chunks: [] } })
              close()
            }}
          />
          <MenuRow
            label={t('world.maskHeight')}
            checked={edit.mask?.kind === 'height'}
            tick="on-off"
            tip={HINT_RIGHT(t('world.maskHeightHint'))}
            onSelect={() => {
              setMask({ kind: 'height', min: terrain.elevation.min, max: terrain.elevation.max })
              close()
            }}
          />
          <MenuRow
            label={t('world.maskSlope')}
            checked={edit.mask?.kind === 'slope'}
            tick="on-off"
            tip={HINT_RIGHT(t('world.maskSlopeHint'))}
            onSelect={() => {
              setMask({ kind: 'slope', min: 0, max: 90 })
              close()
            }}
          />
        </>
      )}
    />
  )
}
