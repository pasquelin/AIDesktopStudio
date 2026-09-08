import { localizedError } from '@shared/localizedError'
import type { SoundPort } from '@/engines/timeline/soundSchedule'

/**
 * A sound port that opens no output.
 *
 * For the video return, which replays an edit the studio is ALREADY playing: two outputs on the
 * same take are heard as one echo a few milliseconds wide, and the second screen is watched, not
 * listened to.
 *
 * `now` answers null, which is what the engine reads as "no output clock" — it then drives the
 * playhead from its own frame loop, exactly as it does before any gesture has resumed the audio
 * context. The refusal to load is the honest answer rather than a resolved promise holding
 * nothing: a caller that awaits one would wait for a sound that is never coming.
 */
export function silentSound(): SoundPort {
  return {
    now: () => null,
    // Nothing goes out here, so there is nothing to listen to: a meter fed by this port would
    // read a flat zero over an edit the other window is playing aloud.
    tap: () => null,
    resume: () => undefined,
    load: () => Promise.reject(localizedError('videoReturnSilent')),
  }
}
