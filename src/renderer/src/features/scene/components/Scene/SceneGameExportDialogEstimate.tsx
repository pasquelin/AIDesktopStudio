import { hasVisualChanges } from '@shared/domain/gameExport'
import { estimatedLossyImpact } from '@/engines/scene/worldAnalyzer'
import type { ExportDialogState } from '@/hooks/useExportDialogState'

export function SceneGameExportDialogEstimate({ state }: { state: ExportDialogState }) {
  const { plan, projectEstimate, t, number, bytes, options } = state
  if (!plan || !projectEstimate) return null
  const impact = estimatedLossyImpact(plan, options)
  return (
    <dl>
      <dt>{t('game.export.currentSceneMeasured')}</dt>
      <dd>{t('optimization.drawCalls', { value: number(plan.measured.draws) })}</dd>
      <dd>{t('optimization.triangles', { value: number(plan.measured.triangles) })}</dd>
      <dd>{t('optimization.geometry', { value: bytes(plan.measured.geometryBytes) })}</dd>
      <dd>{t('optimization.images', { value: bytes(plan.measured.textureBytes) })}</dd>
      <dt>{t('game.export.projectEstimated', { count: projectEstimate.scenes })}</dt>
      <dd>
        {t('optimization.drawCallResult', {
          before: number(projectEstimate.drawCallsBefore),
          after: number(projectEstimate.drawCallsAfter),
        })}
      </dd>
      {hasVisualChanges(options) && impact && (
        <dd>
          {t('game.export.currentSceneLossyEstimate', {
            triangles: number(impact.trianglesAfter),
            geometry: bytes(impact.geometryBytesAfter),
            images: bytes(impact.textureBytesAfter),
          })}
        </dd>
      )}
      <dd>
        {t(
          hasVisualChanges(options)
            ? 'game.export.visualChangesPossible'
            : 'game.export.visualChangesNone',
        )}
      </dd>
    </dl>
  )
}
