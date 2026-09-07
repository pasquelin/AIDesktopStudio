import type { Us } from '@shared/domain/time'
import { playbackOf, usePlayback } from '@/stores/playback'
import { sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'

/**
 * Where a transport reports its time. Running, the clock owns the head and publishes it ALONE;
 * stopped, the head is the montage's again — one left published hides every later scrub, since
 * every surface reads `clockHead ?? playhead`. `owner` names the PLAYER, never the document.
 */
export function reportMontageHead(documentId: string, owner: string, playhead: Us): void {
  const store = useSequences.getState()
  // Closing a tab drops the document BEFORE React unmounts its host, and `dispose` pauses — which
  // reports one last time. Writing then would build the montage back out of the store's default.
  if (!sequenceStore.hasState(store, documentId)) return

  const playback = usePlayback.getState()
  // Replacing the montage sixty times a second woke the strip, the monitors and the take editor
  // for a number they read from the transport instead.
  if (playbackOf(playback, owner)) return playback.setHead(documentId, playhead)

  playback.clearHead(documentId)
  // Playback is not an edit: the playhead goes through `replace`, which skips the history.
  store.replaceView(documentId, { ...sequenceOf(store, documentId), playhead })
}
