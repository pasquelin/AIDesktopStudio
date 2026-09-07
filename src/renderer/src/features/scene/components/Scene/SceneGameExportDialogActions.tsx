import { WindowButton } from '@/components/WindowButton'
import type { ExportDialogState } from '@/hooks/useExportDialogState'

export function SceneGameExportDialogActions({ state }: { state: ExportDialogState }) {
  return (
    <>
      <WindowButton size="dialog" variant="secondary" onClick={state.cancel}>
        {state.t('actions.cancel')}
      </WindowButton>
      <WindowButton
        size="dialog"
        disabled={!state.plan || state.exporting}
        onClick={() => void state.submit()}
      >
        {state.t('game.export.action')}
      </WindowButton>
    </>
  )
}
