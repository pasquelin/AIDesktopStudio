import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/helpers/cn'
import { WINDOW_CAPTION, WINDOW_HELP } from '@/components/windowStyles'
import { WindowNav } from '@/components/WindowNav/WindowNav'
import { WindowNavItem } from '@/components/WindowNav/WindowNavItem'
import { employmentLabelOf } from '@/features/home/components/ModelInventory/inventory'
import { useModelFit } from '@/hooks/useModelFit'
import { aiRoleId } from '@shared/domain/aiRole'
import { aiDiskBusy } from '@shared/domain/aiOverview'
import { useAiModels } from '@/stores/aiModels'
import { WelcomeCopy } from './WelcomeCopy'
import { WelcomeModelRow } from './WelcomeModelRow'
import { sectionModels, welcomeSections } from './welcomeSections'

/**
 * What fits beside the column in a window that does not scroll: paired up, six rows stay under
 * the height the eleven sections already take, so the list never drives the sheet.
 */
const OFFERED = 6

/**
 * The models a first launch can put on this machine, assistant first. A COLUMN of sections and no
 * longer a strip of chips (Alban, 2026-09-07): eleven of them ask 825 px of a 702 px row, so the
 * last one wrapped alone and read as a heading — and the list grows with what the machine serves.
 */
export function WelcomeSlideModels() {
  const { t } = useTranslation()
  const overview = useAiModels(state => state.overview)
  const fitOf = useModelFit(overview?.machine ?? null)
  const [section, setSection] = useState<string | null>(null)

  const copy = <WelcomeCopy title={t('welcome.models.title')} body={t('welcome.models.body')} />
  if (overview === null) {
    return (
      <div>
        {copy}
        <p className={WINDOW_HELP}>{t('aiModels.reading')}</p>
      </div>
    )
  }

  const sections = welcomeSections(overview)
  const chosen = sections.find(group => group.key === section) ?? sections[0]
  if (chosen === undefined) {
    return (
      <div>
        {copy}
        <p className={WINDOW_HELP}>{t('aiModels.empty')}</p>
      </div>
    )
  }

  const models = sectionModels(overview, chosen, OFFERED)

  return (
    <div>
      {copy}
      <div className="flex gap-4">
        <div className="border-base-300 w-40 shrink-0 border-r pr-2">
          <WindowNav>
            {sections.map(group => {
              const name = employmentLabelOf(group, t)
              return (
                <WindowNavItem
                  key={group.key}
                  active={group.key === chosen.key}
                  hint={t('welcome.models.sectionHint', { name })}
                  onSelect={() => setSection(group.key)}
                  className="px-2"
                >
                  {name}
                </WindowNavItem>
              )
            })}
          </WindowNav>
        </div>
        {/* A floor under the list: a section holding one model shrank the sheet to half its
            height, and the sheet jumping on every section is what a carousel must not do. */}
        <div className="min-h-48 flex-1">
          {chosen.family === '3d' &&
            overview.roles.some(row => row.role === aiRoleId('3d', 'motion')) && (
              <p className={cn(WINDOW_HELP, 'mb-3')}>{t('welcome.models.motionOptional')}</p>
            )}
          <ul className="grid grid-cols-2 gap-2">
            {models.map(candidate => (
              <WelcomeModelRow
                key={candidate.model.id}
                candidate={candidate}
                fit={fitOf(candidate)}
                installing={overview.installing}
                busy={aiDiskBusy(overview)}
              />
            ))}
          </ul>
          <p className={cn(WINDOW_CAPTION, 'mt-2')}>{t('welcome.models.more')}</p>
        </div>
      </div>
    </div>
  )
}
