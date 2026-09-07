import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiOverview, RoleRow } from '@shared/domain/aiOverview'
import type { SettingsSectionId } from '@shared/domain/settings'
import { QuietNote } from '@/components/QuietNote'
import { Separator } from '@/components/Separator'
import { aiSectionOf } from '@/helpers/aiSectionLazy'
import { ModelInventoryRow } from './ModelInventoryRow'
import { HOME_BLOCK, HOME_BLOCK_HEADING } from '@/components/styles'
import {
  employmentGroupsOf,
  employmentLabelOf,
  type EmploymentGroup,
  type Translate,
} from './inventory'

/**
 * One line per family, and one per role no family holds — what serves each, or how many of the
 * family are served.
 *
 * Twenty-four generation employments would be a page rather than a band, and the family is the
 * unit a reader already has: it is the space they work in.
 */
export function ModelInventoryEmployments({
  overview,
  onOpen,
}: {
  overview: AiOverview
  onOpen: (section: SettingsSectionId) => void
}) {
  const { t } = useTranslation()
  const groups = employmentGroupsOf(overview)

  return (
    <div className={HOME_BLOCK}>
      <h3 className={HOME_BLOCK_HEADING}>{t('home.models.employments')}</h3>

      {groups.length === 0 ? (
        <QuietNote>{t('home.models.nothing')}</QuietNote>
      ) : (
        groups.map((group, rank) => {
          const label = employmentLabelOf(group, t)

          return (
            // The roles no family holds close the list, and a rule says so: read straight on,
            // « Assistant » looked like a seventh workspace.
            <Fragment key={group.key}>
              {group.family === null && groups[rank - 1]?.family !== null && (
                <Separator orientation="horizontal" className="my-1 w-full" />
              )}
              <ModelInventoryRow
                label={label}
                served={group.served}
                total={group.total}
                standing={standingOf(group, t)}
                hint={t('home.models.employmentHint', { name: label })}
                // The screen is asked for on the click rather than composed with the group: the
                // registry that answers rides in the settings window's own chunk.
                onClick={() => void aiSectionOf(group.family).then(onOpen)}
              />
            </Fragment>
          )
        })
      )}
    </div>
  )
}

/**
 * What answers for the group: the provider by name where ONE employment is at stake, a fraction
 * otherwise. A family of six that named only its first employment's model would read as an
 * answer about all six — and « aucun emploi servi » written out six times was six identical rows.
 */
function standingOf(group: EmploymentGroup, t: Translate): string {
  if (group.sole !== null) return servedBy(group.sole, t)

  return t('home.models.served', { count: group.served, total: group.total })
}

function servedBy(row: RoleRow, t: Translate): string {
  const { provider } = row
  if (provider === null) return t('aiModels.providerNone')
  if (provider.kind === 'cloud') return t(`aiClouds.${provider.providerId}`)

  // What SERVES it, which is not always what was chosen: a model since uninstalled falls back.
  const model = row.candidates.find(candidate => candidate.model.id === provider.modelId)

  return model?.model.name ?? t('aiModels.providerNone')
}
