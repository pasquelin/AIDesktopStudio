import { useCallback } from 'react'
import type { CommandId } from '@shared/domain/command'
import { runAudioCommand } from './audioCommands'
import { ResizeHandle } from '@/components/ResizeHandle'
import type { Us } from '@/engines/timeline/timelineState'
import { useRestoredDocument } from '@/hooks/useRestoredDocument'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useSoundTransport } from '@/hooks/useSoundTransport'
import { useSplitPair } from '@/hooks/useSplitPair'
import { isAudioEditDirty, useAudioEdits } from '@/stores/audioEdits'
import { useDocumentIsInFront } from '@/stores/documents'
import { isClipMonitorShown, useMonitorPair } from '@/stores/monitorPair'
import { playbackHeadOf, usePlayback } from '@/stores/playback'
import { isSequenceDirty, sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'
import { exportOtio, exportOtioz, exportStems } from '@/features/shell/components/otioExport'
import { ProgramMonitor } from './ProgramMonitor'
import { TakeEditor } from './TakeEditor/TakeEditor'

export type AudioDocumentProps = { documentId: string }

/**
 * Two monitors, stacked: the montage above, the take being edited below. The montage itself is
 * the `timeline` tool window — a strip the width of the app, not a corner of this tab.
 *
 * The pair is what the space was missing. An editor alone showed one take while the strip below
 * showed several, and nothing on screen said how the two were related — the centre simply did
 * not resemble the state of the timeline.
 */
export function AudioDocument({ documentId }: AudioDocumentProps) {
  const sequence = useSequences(state => sequenceOf(state, documentId))
  // The head belongs to the clock while it plays, and the montage no longer carries it — read
  // back exactly as the picture pair reads it.
  const clockHead = usePlayback(state => playbackHeadOf(state, documentId))
  const program = clockHead === undefined ? sequence : { ...sequence, playhead: clockHead }
  const active = useDocumentIsInFront(documentId)

  // Both halves, as closing this document already asks of both: a take's file holds the chain of
  // edits over its sample AND the montage under it, and either alone leaves work unaccounted for.
  const editsDirty = useAudioEdits(state => isAudioEditDirty(state, documentId))
  const montageDirty = useSequences(state => isSequenceDirty(state, documentId))
  useDocumentTitle(documentId, editsDirty || montageDirty)

  useRestoredDocument(documentId)

  /**
   * The player of the montage, owned by the monitor that shows it — as the picture pair does.
   *
   * It used to hang off the strip's title bar, for a reason this tab has just taken away: the
   * workspace had no monitor to hold one. The strip now reads it from the registry instead.
   */
  const transport = useSoundTransport(documentId, sequence)

  const { pairRef, leadStyle, leadSize, onLeadSize } = useSplitPair('vertical')

  const takeShown = useMonitorPair(state => isClipMonitorShown(state, documentId))
  const takeStyle = takeShown ? leadStyle : undefined
  const toggleTake = useCallback(
    () => useMonitorPair.getState().toggleClipMonitor(documentId),
    [documentId],
  )

  const seek = useCallback(
    (playhead: Us) => {
      const store = useSequences.getState()
      // Closing a tab drops the document BEFORE React unmounts this tab, and writing then would
      // build the montage back out of the store's default: a picture track, in a space that has
      // nothing to show one on. `SequenceDocument` carries the same line, for the same reason.
      if (!sequenceStore.hasState(store, documentId)) return

      // Scrubbing is not an edit: the head goes through `replace`, which skips the history.
      store.replaceView(documentId, { ...sequenceOf(store, documentId), playhead })
    },
    [documentId],
  )

  /**
   * ⌘Z, for a document holding TWO stories: the chain over the take, and the sound montage under
   * it. One key, one document, so it has to choose — and it chooses the chain whenever the chain
   * has anything to give back, the montage otherwise.
   *
   * The montage cannot answer for itself: its own scope is `sequence`, and a second listener on
   * that scope would undo BOTH halves on one press — the studio's "two diverging undo stacks",
   * which is why `SoundPanel` mounts the strip with its shortcuts off.
   */
  const onCommand = useCallback(
    (command: CommandId): boolean => runAudioCommand(documentId, command),
    [documentId],
  )

  // Both the keyboard and the Edit menu land here. `enabled` for the same reason the scene
  // gives: Dockview keeps hidden tabs mounted, and a background take would eat ⌘Z.
  useShortcuts({ scope: 'audio', enabled: active, documentId, onCommand })

  // The space bar, which the programme monitor answers here as it does in the picture pair —
  // and the montage export, this space holding the same `SequenceState` the video one does.
  const onMontage = useCallback(
    (command: CommandId) => {
      if (command === 'sequence.playPause') return transport.toggle()
      // The chain of an edited take is NOT in it, and that is not a loss of the export: the
      // programme monitor does not hear it either — it becomes real when the take is applied.
      if (command === 'sequence.exportCut') void exportOtio(documentId)
      if (command === 'sequence.exportBundle') void exportOtioz(documentId)
      if (command === 'sequence.exportStems') void exportStems(documentId)
    },
    [documentId, transport],
  )
  useShortcuts({ scope: 'sequence', enabled: active, documentId, onCommand: onMontage })

  return (
    /*
     * Stacked, where the picture pair sits side by side — and the difference is the thing being
     * looked at. A frame is judged at the largest size the tab can give it, so two of them share
     * the width; a waveform is READ along time, and half a width is half the montage's detail for
     * height nothing does anything with. Both keep the full width here, one above the other.
     *
     * The inset belongs to the COLUMN, not to each monitor: carried by both, it doubled around
     * the handle and the pair read as two panes pushed apart rather than two panels stacked.
     */
    <div ref={pairRef} className="flex h-full min-h-0 flex-col p-(--sc-gutter)">
      {/* The whole above the part, and the part above the strip it sits on: what one is making
          reads top to bottom, and the take being worked on stays next to the montage it lands
          in rather than a monitor's width away from it. */}
      {/* The montage takes the whole tab while the take editor is away: a `leadStyle` height held
          over a pane with nothing under it would leave the rest of the column empty. */}
      <div className={takeShown ? 'flex min-h-0' : 'flex min-h-0 flex-1'} style={takeStyle}>
        <ProgramMonitor
          sequence={program}
          transport={transport}
          onSeek={seek}
          clipHalf={{ shown: takeShown, onToggle: toggleTake }}
        />
      </div>

      {takeShown && (
        <>
          {/* The same handle the shell splits its zones with, so the gesture is the one gesture. */}
          <ResizeHandle axis="vertical" size={leadSize} onSize={onLeadSize} />

          <div className="flex min-h-0 flex-1">
            <TakeEditor documentId={documentId} />
          </div>
        </>
      )}
    </div>
  )
}
