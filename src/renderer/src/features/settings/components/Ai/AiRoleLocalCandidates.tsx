import { useTranslation } from 'react-i18next'
import type { AiOverview, ChoiceScope, ModelCandidate, RoleRow } from '@shared/domain/aiOverview'
import { MODEL_SOURCES, sourceOf, type ModelSource } from '@shared/domain/localModel'
import { WINDOW_CAPTION, WINDOW_GROUP_LABEL } from '@/components/windowStyles'
import type { ModelFitSentence } from '@/hooks/useModelFit'
import { useAiModels } from '@/stores/aiModels'
import { useModels } from '@/stores/models'
import { AiCandidateRow } from './AiCandidateRow'

const SOURCE_COPY: Record<ModelSource, { title: string; help?: string }> = {
  studio: { title: 'aiModels.sourceStudio', help: 'aiModels.sourceStudioHelp' },
  ollama: { title: 'aiModels.sourceOllama', help: 'aiModels.sourceOllamaHelp' },
  custom: { title: 'aiModels.sourceCustom' },
}

export type AiRoleOptionsProps = {
  row: RoleRow
  installing: AiOverview['installing']
  loading: AiOverview['loading']
  busy: boolean
  scope: ChoiceScope
  fitOf: (candidate: ModelCandidate) => ModelFitSentence
}

export function AiRoleLocalCandidates(props: AiRoleOptionsProps) {
  const { row, installing, loading, busy, scope, fitOf } = props
  const { t } = useTranslation()
  const choose = useAiModels(state => state.chooseAiProvider)
  const select = useModels(state => state.select)
  const editing = row.chosen[scope]
  return MODEL_SOURCES.map(source => {
    const candidates = row.candidates.filter(one => sourceOf(one.model) === source)
    if (candidates.length === 0) return null
    const copy = SOURCE_COPY[source]
    return (
      <li key={source} className="pt-6">
        <h4 className={WINDOW_GROUP_LABEL}>{t(copy.title)}</h4>
        {copy.help !== undefined && <p className={WINDOW_CAPTION}>{t(copy.help)}</p>}
        <ul>
          {candidates.map(candidate => (
            <AiCandidateRow
              key={candidate.model.id}
              role={row.role}
              candidate={candidate}
              chosen={editing?.kind === 'local' && editing.modelId === candidate.model.id}
              fit={fitOf(candidate)}
              progress={installing?.modelId === candidate.model.id ? installing.progress : null}
              loading={loading?.modelId === candidate.model.id ? loading.ratio : null}
              busy={busy}
              onChoose={() => {
                void choose(row.role, { kind: 'local', modelId: candidate.model.id }, scope)
                select(row.role, candidate.model.id)
              }}
            />
          ))}
        </ul>
      </li>
    )
  })
}
