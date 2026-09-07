import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { subtreesOf } from '@/engines/scene/sceneState'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'
import {
  useOptimizationDialog,
  type OptimizationDialogRequest,
} from '@/hooks/useOptimizationDialog'
import { SceneOptimizationDialogBody } from './SceneOptimizationDialogBody'
import type { OptimizationPlan } from '@/engines/scene/worldAnalyzer'
import { Dialog } from '@/features/shell/components/Dialog'
import { Spinner } from '@/components/Spinner'
import { WindowButton } from '@/components/WindowButton'

export function SceneOptimizationDialog({ documentId }: { documentId: string }) {
  const { t } = useTranslation()
  const request = useOptimizationDialog(state => state.request)
  const close = useOptimizationDialog(state => state.close)
  const nodes = useScenes(state => sceneOf(state, documentId).nodes)
  const [worldResult, setWorldResult] = useState<{
    request: OptimizationDialogRequest
    plan: OptimizationPlan
  } | null>(null)
  const target = useMemo(
    () =>
      request?.documentId === documentId && request.scope === 'selection'
        ? subtreesOf(nodes, request.selectedIds)
        : [],
    [documentId, nodes, request],
  )
  const selectionPlan = useMemo(
    () =>
      request?.documentId === documentId && request.scope === 'selection'
        ? sceneEngineOf(documentId)?.analyzeOptimization(request.selectedIds)
        : null,
    [documentId, request],
  )
  useEffect(() => {
    let active = true
    if (request?.documentId !== documentId || request.scope !== 'world') return
    const engine = sceneEngineOf(documentId)
    if (!engine) return

    const analyze = async (): Promise<void> => {
      try {
        const next = await engine.analyzeWorldOptimization()
        if (active) setWorldResult({ request, plan: next })
      } catch {
        if (active) close()
      }
    }
    void analyze()
    return () => {
      active = false
    }
  }, [close, documentId, request])
  if (!request || request.documentId !== documentId) return null
  const plan =
    request.scope === 'world'
      ? worldResult?.request === request
        ? worldResult.plan
        : null
      : selectionPlan
  if (!plan)
    return request.scope === 'world' ? (
      <Dialog
        title={t('optimization.performanceTitle')}
        actions={
          <WindowButton size="dialog" onClick={close}>
            {t('actions.cancel')}
          </WindowButton>
        }
      >
        <Spinner label={t('optimization.analyzing')} />
      </Dialog>
    ) : null
  return (
    <SceneOptimizationDialogBody
      key={request.selectedIds.join('\u0000')}
      documentId={documentId}
      target={target}
      plan={plan}
      readOnly={request.scope === 'world'}
    />
  )
}
