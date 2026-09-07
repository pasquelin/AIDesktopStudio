import { useTranslation } from 'react-i18next'
import { AUTO_RIG_ROLE } from '@shared/domain/aiRole'
import { useAiModels } from '@/stores/aiModels'
import { AiChoiceRow } from './AiChoiceRow'
import { AiRoleCloudCandidates } from './AiRoleCloudCandidates'
import { AiRoleEmptyNotices } from './AiRoleEmptyNotices'
import { AiRoleLocalCandidates, type AiRoleOptionsProps } from './AiRoleLocalCandidates'

export function AiRoleOptions(props: AiRoleOptionsProps) {
  const { row, scope } = props
  const { t } = useTranslation()
  const choose = useAiModels(state => state.chooseAiProvider)
  const integrated = row.role === AUTO_RIG_ROLE
  return (
    <ul>
      <AiChoiceRow
        role={row.role}
        choice="none"
        label={t(integrated ? 'aiModels.autoRigSimple' : 'aiModels.none')}
        hint={t(integrated ? 'aiModels.autoRigSimpleHint' : 'aiModels.noneHint')}
        checked={row.chosen[scope] === null}
        onChoose={() => void choose(row.role, null, scope)}
      />
      <AiRoleEmptyNotices row={row} />
      <AiRoleLocalCandidates {...props} />
      <AiRoleCloudCandidates row={row} scope={scope} />
    </ul>
  )
}
