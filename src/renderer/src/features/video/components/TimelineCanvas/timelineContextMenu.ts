import { mdiContentCut, mdiDeleteOutline, mdiLinkVariantOff } from '@mdi/js'
import type { PointerEvent } from 'react'
import type { Command } from '@/engines/core/history'
import { removeClip, splitClip, unlinkClip } from '@/engines/timeline/commands'
import { clipById, clipEnd, type SequenceState } from '@/engines/timeline/timelineState'
import { hitTest, type Viewport } from '@/engines/timeline/timelineGeometry'
import { showContextMenu } from '@/helpers/contextMenu'
import { selectClipIn, sequenceOf, useSequences } from '@/stores/sequences'
import { shownSequence } from './sequenceCommands'

type Labels = {
  split: string
  splitHelp: string
  unlink: string
  unlinkHelp: string
  remove: string
  removeHelp: string
}
type Options = {
  documentId: string
  viewport: Viewport
  pointAt: (event: PointerEvent<HTMLCanvasElement>) => { x: number; y: number }
  labels: Labels
}

export function createTimelineContextMenu({ documentId, viewport, pointAt, labels }: Options) {
  return (event: PointerEvent<HTMLCanvasElement>): void => {
    event.preventDefault()
    const store = useSequences.getState()
    const state = shownSequence(documentId, sequenceOf(store, documentId))
    const target = hitTest(state, viewport, pointAt(event))
    if (!target || !('clipId' in target)) return
    const clip = clipById(state, target.clipId)
    if (!clip) return
    selectClipIn(documentId, clip.id)
    const run = (command: Command<SequenceState>) => (): void =>
      useSequences.getState().runCommand(documentId, command)
    void showContextMenu([
      {
        label: labels.split,
        icon: mdiContentCut,
        tooltip: labels.splitHelp,
        disabled: state.playhead <= clip.start || state.playhead >= clipEnd(clip),
        onSelect: run(splitClip(clip.id, state.playhead)),
      },
      {
        label: labels.unlink,
        icon: mdiLinkVariantOff,
        tooltip: labels.unlinkHelp,
        disabled: !clip.linkId,
        onSelect: run(unlinkClip(clip.id)),
      },
      {
        label: labels.remove,
        icon: mdiDeleteOutline,
        tooltip: labels.removeHelp,
        onSelect: run(removeClip(clip.id)),
      },
    ])
  }
}
