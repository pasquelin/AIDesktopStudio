import { useTranslation } from 'react-i18next'
import { WindowFailure } from '@/components/WindowFailure'
import { WindowNote } from '@/components/WindowNote'
import type { UsagePeriod } from '@shared/domain/usage'
import { HINT_RIGHT } from '@/helpers/tooltip'
import { UsageTable } from './Table/UsageTable'
import { UsageTableHeadCell } from './Table/UsageTableHeadCell'
import { UsageTableRow } from './Table/UsageTableRow'
import { formatMoment, formatUnits } from '@/helpers/format'
import { useUsageEvents } from '@/hooks/useUsageEvents'
import { WindowButton } from '@/components/WindowButton'

/**
 * The raw billable log, event by event.
 *
 * Loads when this section is opened, not with the window: over 120 days it is the one call heavy
 * enough to make opening feel slow, and it is nobody's first screen.
 */
export function UsageJournal({ period }: { period: UsagePeriod }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { page, loading, failure, more } = useUsageEvents(period)

  if (failure) return <WindowFailure>{t('usage.failure')}</WindowFailure>
  if (!page && loading) return <WindowNote>{t('usage.loading')}</WindowNote>
  if (!page || page.events.length === 0) {
    return <WindowNote>{t('usage.empty')}</WindowNote>
  }

  return (
    <div className="flex flex-col gap-3">
      <UsageTable
        head={
          <>
            {/* The frame these hours are read in, ON the column: the footnote saying so renders
                after the table, and this list pages — so a reader scrolling rows whose hours
                disagree with their own clock had the explanation off screen. */}
            <UsageTableHeadCell label={t('usage.columns.time')} hint={t('usage.countedInUtc')} />
            <UsageTableHeadCell label={t('usage.columns.action')} />
            <UsageTableHeadCell label={t('usage.columns.model')} />
            <UsageTableHeadCell label={t('usage.columns.account')} />
            <UsageTableHeadCell label={t('usage.columns.units')} numeric />
          </>
        }
      >
        {page.events.map((event, index) => (
          <UsageTableRow key={`${event.time}-${event.jobId ?? index}`}>
            {/* UTC, like the day the chart next door counts it under: a stamp read in the local
                zone puts an event two hours past midnight on the bar of the day before. */}
            <td className="py-1.5 whitespace-nowrap">{formatMoment(event.time, locale, 'utc')}</td>
            {/* Scenario adds actions without notice: one nobody named shows as the API sent it. */}
            <td className="py-1.5">
              {t(`usage.actionNames.${event.action}`, { defaultValue: event.action })}
            </td>
            <td className="max-w-48 truncate py-1.5" title={event.modelName}>
              {event.modelName ?? '—'}
            </td>
            <td className="py-1.5">{event.accountName}</td>
            <td className="py-1.5 text-right font-mono">
              {event.units === 0 ? (
                <span className="text-base-content/70">{t('usage.free')}</span>
              ) : (
                formatUnits(event.units, locale)
              )}
            </td>
          </UsageTableRow>
        ))}
      </UsageTable>

      {page.more && (
        <WindowButton
          variant="secondary"
          className="self-start"
          {...HINT_RIGHT(t('usage.loadMoreHint'))}
          onClick={more}
          disabled={loading}
        >
          {t('usage.loadMore')}
        </WindowButton>
      )}
    </div>
  )
}
