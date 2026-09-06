import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { aiRoleId, AUTO_RIG_ROLE } from '@shared/domain/aiRole'
import type { AiOverview, ChoiceScope, ModelCandidate, RoleRow } from '@shared/domain/aiOverview'
import { WindowTag } from '@/components/WindowTag'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import type { ModelFitSentence } from '@/hooks/useModelFit'
import { roleLabel } from '@/helpers/roleLabel'
import { AiRoleOptions } from './AiRoleOptions'

export type AiRoleRowProps = {
  row: RoleRow
  /** The install in flight when it is one of THIS row's candidates, so the others hold their render. */
  installing: AiOverview['installing']
  /** The load in flight, on the same terms — one at a time, and only the row that owns it. */
  loading: AiOverview['loading']
  /** Whether some install holds the disk, wherever it was begun. */
  busy: boolean
  /** Where a click writes — the application default, or the open project alone. */
  scope: ChoiceScope
  fitOf: (candidate: ModelCandidate) => ModelFitSentence
}

/**
 * One EMPLOYMENT and what serves it, never one model. Folded by default — a choice already
 * made needs no attention — and unfolded it shows every local candidate, those too heavy included.
 */
export const AiRoleRow = memo(function AiRoleRow({
  row,
  installing,
  loading,
  busy,
  scope,
  fitOf,
}: AiRoleRowProps) {
  const { t } = useTranslation()
  const label = roleLabel(row.role, t)
  // Captured so the narrowing survives into the callback below, which a property access does not.
  const provider = row.provider
  // What SERVES the role, which is not always what was chosen: a model since uninstalled falls
  // back, and the summary has to say what answers today rather than what was asked for.
  const served =
    provider?.kind === 'local'
      ? row.candidates.find(candidate => candidate.model.id === provider.modelId)
      : undefined
  // The controls, unlike the summary, show the scope BEING EDITED: a radio reading the effect
  // would leave a click writing a scope that already agreed, doing nothing and saying nothing.
  const usesIntegratedRig = row.role === AUTO_RIG_ROLE

  return (
    <details className="border-base-300 border-b last:border-b-0">
      <summary className="flex cursor-pointer items-center gap-2 py-3">
        <span className="flex-1">{label}</span>
        {row.chosen.project !== null && <WindowTag>{t('aiModels.chosenAtProject')}</WindowTag>}
        <span className={WINDOW_CAPTION}>
          {served && served.model.name}
          {provider?.kind === 'cloud' && t(`aiClouds.${provider.providerId}`)}
          {provider === null &&
            t(usesIntegratedRig ? 'aiModels.autoRigSimple' : 'aiModels.providerNone')}
        </span>
      </summary>

      <fieldset className="pt-3 pb-4">
        <legend className="sr-only">{t('aiModels.candidates', { role: label })}</legend>
        {row.role === aiRoleId('3d', 'motion') && (
          <p className={WINDOW_CAPTION}>{t('aiModels.motionSetup')}</p>
        )}
        <AiRoleOptions {...{ row, installing, loading, busy, scope, fitOf }} />
      </fieldset>
    </details>
  )
})
