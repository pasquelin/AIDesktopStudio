import { useTranslation } from 'react-i18next'
import { PropertyRow } from '@/components/PropertyRow'
import { PropertySection } from '@/components/PropertySection'
import { WindowButton } from '@/components/WindowButton'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { formatBytes } from '@/helpers/format'
import type { DerivedCacheState } from '@/hooks/useDerivedCache'

export type CopiesWindowCacheProps = {
  cache: DerivedCacheState
}

/**
 * What the studio keeps and can make again, and the one command that frees it.
 *
 * A NAMED command, never a consequence (R6): nothing purges on its own, no threshold triggers
 * it, and the figure beside the button is measured rather than estimated. What it will not
 * touch is said in the section's own sentence — a chosen still and a durable resource are not
 * caches, and neither is work that was never saved.
 */
export function CopiesWindowCache({ cache }: CopiesWindowCacheProps) {
  const { t, i18n } = useTranslation()
  const { report, freed, purging, purge } = cache
  const size = (bytes: number): string =>
    formatBytes(bytes, unit => t(`units.${unit}`), i18n.language)

  return (
    <PropertySection
      title={t('copies.cache')}
      description={t('copies.cacheNote')}
      scId="copies.cache"
      plate
      actions={
        <WindowButton
          size="row"
          disabled={purging || report === null || report.bytes === 0}
          onClick={purge}
        >
          {purging ? t('copies.purging') : t('copies.purge')}
        </WindowButton>
      }
    >
      {report?.stores.map(store => (
        <PropertyRow key={store.store} label={t(`copies.stores.${store.store}`)}>
          {t('copies.storeHeld', { count: store.files, size: size(store.bytes) })}
        </PropertyRow>
      ))}
      <PropertyRow label={t('copies.cacheTotal')}>
        {report === null ? t('copies.reading') : size(report.bytes)}
      </PropertyRow>
      {freed && (
        <p className={WINDOW_CAPTION}>
          {t('copies.freed', { size: size(freed.bytes) })}{' '}
          {t('copies.forgotten', { count: freed.clearedRows })}
        </p>
      )}
    </PropertySection>
  )
}
