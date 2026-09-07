import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@/features/shell/components/Dialog'
import { WindowButton } from '@/components/WindowButton'
import { fieldHandle } from '@/components/scHandle'
import { setNodesOptimization } from '@/engines/scene/commands'
import { bakeOptimization } from '@/engines/scene/bakeOptimization'
import type { SceneNode } from '@/engines/scene/sceneState'
import { OPTIMIZATION_MODES, type OptimizationMode } from '@shared/domain/scene'
import { OPTIMIZATION_WARNING_REASONS, type OptimizationPlan } from '@/engines/scene/worldAnalyzer'
import { formatBytes, formatDecimal } from '@/helpers/format'
import { useScenes } from '@/stores/scenes'
import { useOptimizationDialog } from '@/hooks/useOptimizationDialog'

const MIXED_MODE = 'mixed'
type OptimizationChoice = OptimizationMode | typeof MIXED_MODE

function isOptimizationMode(value: string): value is OptimizationMode {
  return OPTIMIZATION_MODES.some(mode => mode === value)
}

function modeOf(nodes: readonly SceneNode[]): OptimizationChoice {
  const first = nodes[0]?.optimization?.mode ?? 'auto'
  return nodes.every(node => (node.optimization?.mode ?? 'auto') === first) ? first : MIXED_MODE
}

export function SceneOptimizationDialogBody({
  documentId,
  target,
  plan,
  readOnly = false,
}: {
  documentId: string
  target: readonly SceneNode[]
  plan: OptimizationPlan
  readOnly?: boolean
}) {
  const { t, i18n } = useTranslation()
  const close = useOptimizationDialog(state => state.close)
  const [mode, setMode] = useState<OptimizationChoice>(() => modeOf(target))
  const number = (value: number): string => formatDecimal(value, i18n.language, { digits: 0 })
  const bytes = (value: number): string =>
    formatBytes(value, unit => t(`units.${unit}`), i18n.language)
  const batchSavings = plan.batches.reduce((saved, group) => saved + group.meshCount - 1, 0)
  const drawCallsAfter =
    mode === 'batch'
      ? Math.max(0, plan.measured.draws - batchSavings)
      : mode === 'individual' || mode === 'exclude'
        ? plan.measured.draws
        : plan.estimated.drawCallsAfter
  const apply = (): void => {
    if (target.length > 0 && mode !== MIXED_MODE) {
      useScenes
        .getState()
        .runCommand(
          documentId,
          setNodesOptimization(target, mode === 'auto' ? undefined : { mode }),
        )
    }
    close()
  }
  const bake = (): void => {
    useScenes.getState().runCommand(documentId, bakeOptimization(target))
    close()
  }
  return (
    <Dialog
      title={t(readOnly ? 'optimization.performanceTitle' : 'optimization.title')}
      actions={
        readOnly ? (
          <WindowButton size="dialog" onClick={close}>
            {t('actions.close')}
          </WindowButton>
        ) : (
          <>
            <WindowButton size="dialog" variant="secondary" onClick={close}>
              {t('actions.cancel')}
            </WindowButton>
            <WindowButton size="dialog" disabled={mode === MIXED_MODE} onClick={apply}>
              {t('optimization.optimize')}
            </WindowButton>
            <WindowButton
              size="dialog"
              variant="secondary"
              disabled={plan.bakeCandidates.length === 0}
              onClick={bake}
            >
              {t('optimization.bake')}
            </WindowButton>
          </>
        )
      }
    >
      <dl>
        <dt>{t('optimization.measured')}</dt>
        <dd>
          {t('optimization.objects', {
            count: plan.measured.objects,
            value: number(plan.measured.objects),
          })}
        </dd>
        <dd>
          {t('optimization.visibleObjects', {
            count: plan.measured.visibleObjects,
            value: number(plan.measured.visibleObjects),
          })}
        </dd>
        <dd>{t('optimization.meshes', { value: number(plan.measured.meshes) })}</dd>
        <dd>{t('optimization.drawCalls', { value: number(plan.measured.draws) })}</dd>
        <dd>{t('optimization.triangles', { value: number(plan.measured.triangles) })}</dd>
        <dd>{t('optimization.geometry', { value: bytes(plan.measured.geometryBytes) })}</dd>
        <dd>{t('optimization.images', { value: bytes(plan.measured.textureBytes) })}</dd>
        <dt>{t('optimization.opportunities')}</dt>
        <dd>{t('optimization.instanceGroups', { value: number(plan.instances.length) })}</dd>
        <dd>
          {t('optimization.sharedMaterials', { value: number(plan.measured.sharedMaterials) })}
        </dd>
        <dd>
          {t('optimization.duplicateGeometry', {
            value: bytes(plan.estimated.avoidedGeometryBytes),
          })}
        </dd>
        <dd>
          {t('optimization.duplicateImages', {
            value: bytes(plan.estimated.avoidedTextureBytes),
          })}
        </dd>
        <dt>{t('optimization.estimated')}</dt>
        <dd>
          {t('optimization.drawCallResult', {
            before: number(plan.estimated.drawCallsBefore),
            after: number(drawCallsAfter),
          })}
        </dd>
        <dd>
          {t('optimization.instanceCandidates', {
            value: number(plan.instances.reduce((total, group) => total + group.meshCount, 0)),
          })}
        </dd>
        <dd>
          {t('optimization.batchCandidates', {
            value: number(plan.batches.reduce((total, group) => total + group.meshCount, 0)),
          })}
        </dd>
        {OPTIMIZATION_WARNING_REASONS.map(reason => {
          const count = plan.warnings.filter(warning => warning.reason === reason).length
          return count > 0 ? (
            <dd key={reason}>
              {t('optimization.warning', {
                value: number(count),
                reason: t(`optimization.warningReasons.${reason}`),
              })}
            </dd>
          ) : null
        })}
        <dd>{t('optimization.visualChangesNone')}</dd>
      </dl>
      {!readOnly && (
        <label className="form-control">
          <span className="label-text">{t('optimization.mode')}</span>
          <select
            className="select select-bordered"
            data-sc={fieldHandle('optimization.mode')}
            value={mode}
            onChange={event => {
              if (isOptimizationMode(event.target.value)) setMode(event.target.value)
            }}
          >
            {mode === MIXED_MODE && (
              <option value={MIXED_MODE}>{t('optimization.modes.mixed')}</option>
            )}
            {OPTIMIZATION_MODES.map(value => (
              <option key={value} value={value}>
                {t(`optimization.modes.${value}`)}
              </option>
            ))}
          </select>
        </label>
      )}
    </Dialog>
  )
}
