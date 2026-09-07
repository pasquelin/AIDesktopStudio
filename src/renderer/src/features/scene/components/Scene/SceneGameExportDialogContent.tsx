import { Spinner } from '@/components/Spinner'
import type { ExportDialogState } from '@/hooks/useExportDialogState'
import { SceneGameExportDialogEstimate } from './SceneGameExportDialogEstimate'
import { SceneGameExportDialogSafeOptions } from './SceneGameExportDialogSafeOptions'
import { SceneGameExportDialogVisualOptions } from './SceneGameExportDialogVisualOptions'

export function SceneGameExportDialogContent({ state }: { state: ExportDialogState }) {
  if (!state.plan && !state.failed) return <Spinner label={state.t('optimization.analyzing')} />
  return (
    <>
      <SceneGameExportDialogSafeOptions state={state} />
      <SceneGameExportDialogVisualOptions state={state} />
      <SceneGameExportDialogEstimate state={state} />
      {state.failed && <p role="alert">{state.t('game.export.failed')}</p>}
    </>
  )
}
