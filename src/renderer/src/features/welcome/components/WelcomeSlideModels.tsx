import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/helpers/cn'
import { WINDOW_CAPTION, WINDOW_HELP } from '@/components/windowStyles'
import { WindowChip } from '@/components/WindowChip'
import { employmentLabelOf } from '@/features/home/components/ModelInventory/inventory'
import { useModelFit } from '@/hooks/useModelFit'
import { aiRoleId } from '@shared/domain/aiRole'
import { aiDiskBusy } from '@shared/domain/aiOverview'
import { useAiModels } from '@/stores/aiModels'
import { WelcomeCopy } from './WelcomeCopy'
import { WelcomeModelRow } from './WelcomeModelRow'
import { sectionModels, welcomeSections } from './welcomeSections'

/** What fits under the chips in a window that does not scroll. The rest is a click away. */
const OFFERED = 6

/** Above this, the list pairs up rather than running down the sheet (Alban). */
const PAIRED = 2

/**
 * The models a first launch can put on this machine, assistant first. Chips and not a column
 * (Alban): one click, and the screen stays skippable.
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
      <div className="mb-3 flex flex-wrap justify-center gap-2">
        {sections.map(group => {
          const name = employmentLabelOf(group, t)
          return (
            <WindowChip
              key={group.key}
              label={name}
              selected={group.key === chosen.key}
              hint={t('welcome.models.sectionHint', { name })}
              onClick={() => setSection(group.key)}
            />
          )
        })}
      </div>
      {/* A floor under the list: a section holding one model shrank the sheet to half its
          height, and the sheet jumping on every chip is what a carousel must not do. */}
      <div className="min-h-48">
        {chosen.family === '3d' &&
          overview.roles.some(row => row.role === aiRoleId('3d', 'motion')) && (
            <p className={cn(WINDOW_HELP, 'mb-3')}>{t('welcome.models.motionOptional')}</p>
          )}
        <ul className={cn('grid gap-3', models.length > PAIRED ? 'grid-cols-2' : 'grid-cols-1')}>
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
  )
}
