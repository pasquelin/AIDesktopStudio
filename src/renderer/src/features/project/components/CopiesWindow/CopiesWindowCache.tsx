import { useTranslation } from 'react-i18next'
import type { DerivedCacheReport } from '@shared/domain/derivedCache'
import { PropertyRow } from '@/components/PropertyRow'
import { PropertySection } from '@/components/PropertySection'
import { WindowButton } from '@/components/WindowButton'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { formatBytes } from '@/helpers/format'
import type { DerivedCacheState } from '@/hooks/useDerivedCache'

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * What the last purge actually did. A refusal is told apart from a purge that freed nothing:
 * the second is an answer, the first has to be tried again.
 *
 * A run that succeeded says the project must be reopened, and that is measured rather than
 * polite: the pipeline rebuilds a proxy or a waveform when a project OPENS, so until then a
 * montage reads the originals — which is the slow path, and no path at all for a codec the
 * browser cannot decode.
 */
function outcome(freed: DerivedCacheReport, size: (bytes: number) => string, t: Translate): string {
  if (freed.refused === 'deriving') return t('copies.purgeBusy')

  return [
    t('copies.freed', { size: size(freed.bytes) }),
    t('copies.forgotten', { count: freed.clearedRows }),
    t('copies.reopen'),
  ].join(' ')
}

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
      {freed && <p className={WINDOW_CAPTION}>{outcome(freed, size, t)}</p>}
    </PropertySection>
  )
}
