import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Licence } from '@shared/domain/licence'
import licences from '@shared/licences.json'
import { WindowShell } from '@/components/WindowShell'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { cn } from '@/helpers/cn'
import { HINT_BOTTOM } from '@/helpers/tooltip'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'

/**
 * The notice every shipped licence asks for. Outside the docks, so `WindowShell` and DaisyUI's
 * tokens like every other window that is not one — this is the application being an application.
 *
 * The whole text of each licence is here rather than a link: a notice that needs a working
 * network to be read is not a notice.
 */
export function LicencesWindow() {
  const { t } = useTranslation()
  const [openName, setOpenName] = useState<string | null>(null)
  useAppliedSettings()

  const entries: Licence[] = licences

  return (
    <WindowShell title={t('licences.title')}>
      <p className={cn(WINDOW_CAPTION, 'pb-3')}>{t('licences.intro')}</p>

      {entries
        .filter(entry => entry.attribution)
        .map(entry => (
          <p key={entry.name} className="text-body pb-3">
            {entry.attribution}
          </p>
        ))}

      <ul>
        {entries.map(entry => (
          <li key={entry.name} className="border-base-300 border-b last:border-b-0">
            <button
              type="button"
              aria-expanded={openName === entry.name}
              {...HINT_BOTTOM(openName === entry.name ? t('licences.fold') : t('licences.unfold'))}
              onClick={() => setOpenName(current => (current === entry.name ? null : entry.name))}
              className="hover:bg-base-200 flex w-full cursor-pointer items-baseline gap-2 py-2 text-left"
            >
              <span className="text-body">{entry.name}</span>
              <span className={WINDOW_CAPTION}>{entry.version ?? t('licences.bundled')}</span>
              <span className={cn(WINDOW_CAPTION, 'ml-auto')}>{entry.spdx}</span>
            </button>

            {openName === entry.name && (
              <div className="pb-3">
                {entry.sources && (
                  <p className={cn(WINDOW_CAPTION, 'pb-2')}>
                    {t(entry.unmodified ? 'licences.sourcesUnmodified' : 'licences.sources')}{' '}
                    {entry.sources}
                  </p>
                )}
                <pre
                  className={cn(
                    WINDOW_CAPTION,
                    'bg-base-100 max-h-72 overflow-auto rounded p-3 whitespace-pre-wrap',
                  )}
                >
                  {entry.text}
                </pre>
              </div>
            )}
          </li>
        ))}
      </ul>
    </WindowShell>
  )
}
