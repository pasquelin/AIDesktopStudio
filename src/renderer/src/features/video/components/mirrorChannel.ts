import type { SequenceState, Us } from '@/engines/timeline/timelineState'

/**
 * What the studio publishes to the video return, and how.
 *
 * A `BroadcastChannel` and not the IPC bridge, which would be the reflex here: every window of
 * the studio loads the SAME renderer bundle, so both ends already share `SequenceState` as a
 * type. Routing it through the main process would mean restating that type in `shared/`, where
 * it does not belong — a sequence is the video space's own shape, and the main process has no
 * use for one. The bridge keeps what only it can do: opening the window.
 *
 * Two kinds of message rather than one, and the split is what keeps it cheap:
 *
 * - `edit` carries the whole sequence, and only when the edit itself changes. It is the big one.
 * - `time` carries a number, and is sent for every playhead move — a scrub is a few hundred of
 *   those a second, and each would otherwise re-post every track and every clip.
 *
 * Playback is NOT streamed frame by frame: `playing` tells the return to run its own transport
 * from the time it already has. A message per frame would put the return one IPC hop behind the
 * picture it is meant to mirror, and would still drift.
 */
export type MirrorMessage =
  | { kind: 'edit'; sequence: SequenceState }
  | { kind: 'time'; playhead: Us }
  | { kind: 'playing'; playing: boolean; playhead: Us }
  /** The studio is going away: the return has nothing left to mirror and says so. */
  | { kind: 'gone' }
  /**
   * The return asking for the edit, which it must: a channel replays nothing, and the window is
   * opened LONG after the studio published. Without it the return sat on its empty state until
   * the next edit — measured, and the whole point of the handshake.
   */
  | { kind: 'ask' }

const CHANNEL = 'ai-desktop-studio.mirror'

/** Opens the channel. Both ends call this; the studio only posts, the return only listens. */
export function openMirrorChannel(): BroadcastChannel {
  return new BroadcastChannel(CHANNEL)
}

/**
 * Reads a message off the wire, or nothing.
 *
 * A `BroadcastChannel` is reachable by anything running on this origin, so what arrives is
 * checked rather than trusted — the return would otherwise hand an arbitrary object to an engine
 * that expects a sequence.
 */
export function mirrorMessageOf(data: unknown): MirrorMessage | null {
  if (typeof data !== 'object' || data === null || !('kind' in data)) return null

  if (data.kind === 'gone') return { kind: 'gone' }
  if (data.kind === 'ask') return { kind: 'ask' }
  if (data.kind === 'edit' && 'sequence' in data) {
    const { sequence } = data
    return isSequence(sequence) ? { kind: 'edit', sequence } : null
  }
  if (data.kind === 'time' && 'playhead' in data) {
    const { playhead } = data
    return typeof playhead === 'number' ? { kind: 'time', playhead } : null
  }
  if (data.kind === 'playing' && 'playing' in data && 'playhead' in data) {
    const { playing, playhead } = data
    if (typeof playing !== 'boolean' || typeof playhead !== 'number') return null
    return { kind: 'playing', playing, playhead }
  }
  return null
}

/** The shape the engine needs, checked at the depth it is read at — tracks and settings. */
function isSequence(value: unknown): value is SequenceState {
  if (typeof value !== 'object' || value === null) return false
  // The cast asserts NOTHING: it names the three fields as `unknown` so they can be read, and
  // every one of them is tested below before this answers true.
  const candidate = value as { tracks?: unknown; settings?: unknown; playhead?: unknown }
  return (
    Array.isArray(candidate.tracks) &&
    typeof candidate.settings === 'object' &&
    candidate.settings !== null &&
    typeof candidate.playhead === 'number'
  )
}
