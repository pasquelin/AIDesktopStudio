import { useGameExportDialog } from '@/hooks/useGameExportDialog'
import { SceneGameExportDialogBody } from './SceneGameExportDialogBody'

export function SceneGameExportDialog({ documentId }: { documentId: string }) {
  const requested = useGameExportDialog(state => state.documentId)
  return requested === documentId ? <SceneGameExportDialogBody documentId={documentId} /> : null
}
