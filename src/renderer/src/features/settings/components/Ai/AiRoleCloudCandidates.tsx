import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultChatModel } from '@shared/domain/aiCloud'
import { ASSISTANT_ROLE } from '@shared/domain/aiRole'
import type { ChoiceScope, RoleRow } from '@shared/domain/aiOverview'
import { WINDOW_CAPTION, WINDOW_GROUP_LABEL } from '@/components/windowStyles'
import { useAiModels } from '@/stores/aiModels'
import { AiChoiceRow } from './AiChoiceRow'
import { AiCloudModel } from './AiCloudModel'
import { AiStudioModel } from './AiStudioModel'

export function AiRoleCloudCandidates({ row, scope }: { row: RoleRow; scope: ChoiceScope }) {
  const { t } = useTranslation()
  const choose = useAiModels(state => state.chooseAiProvider)
  const editing = row.chosen[scope]
  if (row.clouds.length === 0) return null
  return (
    <li className="pt-6">
      <h4 className={WINDOW_GROUP_LABEL}>{t('aiModels.sourceCloud')}</h4>
      <p className={WINDOW_CAPTION}>{t('aiModels.sourceCloudHelp')}</p>
      <ul>
        {row.clouds.map(providerId => (
          <Fragment key={providerId}>
            <AiChoiceRow
              role={row.role}
              choice={providerId}
              label={t(`aiClouds.${providerId}`)}
              hint={t(`aiClouds.${providerId}Hint`)}
              checked={editing?.kind === 'cloud' && editing.providerId === providerId}
              onChoose={() => void choose(row.role, { kind: 'cloud', providerId }, scope)}
            />
            {row.role === ASSISTANT_ROLE &&
              (defaultChatModel(providerId) === null ? (
                <AiStudioModel />
              ) : (
                <AiCloudModel providerId={providerId} />
              ))}
          </Fragment>
        ))}
      </ul>
    </li>
  )
}
