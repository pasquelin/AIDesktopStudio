import { Dialog } from '@/features/shell/components/Dialog'
import { useExportDialogState } from '@/hooks/useExportDialogState'
import { SceneGameExportDialogActions } from './SceneGameExportDialogActions'
import { SceneGameExportDialogContent } from './SceneGameExportDialogContent'

export function SceneGameExportDialogBody({ documentId }: { documentId: string }) {
  const state = useExportDialogState(documentId)
  return (
    <Dialog
      title={state.t('game.export.title')}
      actions={<SceneGameExportDialogActions state={state} />}
    >
      <SceneGameExportDialogContent state={state} />
    </Dialog>
  )
}
