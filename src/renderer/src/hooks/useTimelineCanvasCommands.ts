import { useCallback } from 'react'
import type { CommandId } from '@shared/domain/command'
import type { SequenceState } from '@/engines/timeline/timelineState'
import type { Viewport } from '@/engines/timeline/timelineGeometry'
import { fitToWidth, zoomAt, ZOOM_STEP } from '@/engines/timeline/viewport'
import {
  exportCutAs,
  exportOtio,
  exportOtioz,
  exportStems,
} from '@/features/shell/components/otioExport'
import { exportSequence } from '@/features/video/components/TimelineCanvas/sequenceExport'
import {
  runSequenceCommand,
  shownSequence,
} from '@/features/video/components/TimelineCanvas/sequenceCommands'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { runTask } from '@/stores/tasks'
import { useShortcuts } from './useShortcuts'

type Options = {
  documentId: string
  history: boolean
  sequence: () => SequenceState
  viewport: () => Viewport
  width: () => number
  setViewport: (viewport: Viewport) => void
}

function runExport(command: CommandId, documentId: string, sequence: SequenceState): boolean {
  if (command === 'sequence.export') {
    const title = documentExportName(useDocuments.getState(), documentId, documentId)
    void runTask(title, (_id, watch) => exportSequence({ sequence, title, ...watch }))
    return true
  }
  if (command === 'sequence.exportCut') void exportOtio(documentId)
  else if (command === 'sequence.exportBundle') void exportOtioz(documentId)
  else if (command === 'sequence.exportEdl') void exportCutAs(documentId, 'montage.edl')
  else if (command === 'sequence.exportFcpxml') void exportCutAs(documentId, 'montage.fcpxml')
  else if (command === 'sequence.exportStems') void exportStems(documentId)
  else return false
  return true
}

export function useTimelineCanvasCommands(options: Options): void {
  const run = useCallback(
    (command: CommandId): void => {
      if (!options.history && (command === 'sequence.undo' || command === 'sequence.redo')) return
      if (runSequenceCommand(options.documentId, command) !== false) return
      const state = shownSequence(
        options.documentId,
        sequenceOf(useSequences.getState(), options.documentId),
      )
      if (runExport(command, options.documentId, state)) return
      const current = options.viewport()
      if (command === 'sequence.zoomIn')
        options.setViewport(zoomAt(current, ZOOM_STEP, options.width() / 2))
      else if (command === 'sequence.zoomOut')
        options.setViewport(zoomAt(current, 1 / ZOOM_STEP, options.width() / 2))
      else if (command === 'sequence.fit') options.setViewport(fitToWidth(state, options.width()))
    },
    [options],
  )
  useShortcuts({ scope: 'sequence', enabled: true, onCommand: run })
}
