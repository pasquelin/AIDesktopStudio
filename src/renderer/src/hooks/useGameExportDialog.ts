import { create } from 'zustand'

type GameExportDialogState = {
  documentId: string | null
  open: (documentId: string) => void
  close: () => void
}

export const useGameExportDialog = create<GameExportDialogState>(set => ({
  documentId: null,
  open: documentId => set({ documentId }),
  close: () => set({ documentId: null }),
}))

export function openGameExportDialog(documentId: string): void {
  useGameExportDialog.getState().open(documentId)
}
