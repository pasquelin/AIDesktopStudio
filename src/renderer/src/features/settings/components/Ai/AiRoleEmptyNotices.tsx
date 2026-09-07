import { mdiInformationOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { AUTO_RIG_ROLE } from '@shared/domain/aiRole'
import type { RoleRow } from '@shared/domain/aiOverview'
import { UiIcon } from '@/components/UiIcon'

export function AiRoleEmptyNotices({ row }: { row: RoleRow }) {
  const { t } = useTranslation()
  return (
    <>
      {row.provider === null && row.role !== AUTO_RIG_ROLE && (
        <li className="py-2">
          <span className="alert alert-warning alert-soft">
            <UiIcon path={mdiInformationOutline} />
            {t('aiModels.chooseProvider')}
          </span>
        </li>
      )}
      {row.candidates.length === 0 && (
        <li className="py-2">
          <span className="alert alert-info alert-soft">
            <UiIcon path={mdiInformationOutline} />
            {t('aiModels.noLocalEngine')}
          </span>
        </li>
      )}
    </>
  )
}
