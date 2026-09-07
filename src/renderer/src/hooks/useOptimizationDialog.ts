import { create } from 'zustand'
import { sceneOf, useScenes } from '@/stores/scenes'

export type OptimizationDialogRequest = {
  documentId: string
  selectedIds: readonly string[]
  scope: 'selection' | 'world'
}

type OptimizationDialogState = {
  request: OptimizationDialogRequest | null
  open: (request: OptimizationDialogRequest) => void
  close: () => void
}

export const useOptimizationDialog = create<OptimizationDialogState>(set => ({
  request: null,
  open: request => set({ request }),
  close: () => set({ request: null }),
}))

export function openOptimizationDialog(documentId: string): void {
  const scene = useScenes.getState()
  useOptimizationDialog.getState().open({
    documentId,
    selectedIds: sceneOf(scene, documentId).selectedIds,
    scope: 'selection',
  })
}

export function openWorldPerformanceDialog(documentId: string): void {
  useOptimizationDialog.getState().open({ documentId, selectedIds: [], scope: 'world' })
}
