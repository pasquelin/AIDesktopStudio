import { useEffect } from 'react'
import type { Us } from '@shared/domain/time'
import { clampPlayhead } from '@/engines/scene/animationEval'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'

/**
 * Runs the head forward while it plays. A `requestAnimationFrame` rather than the engine's own
 * loop: the head is session state React owns, and the engine is told where it stands — never the
 * other way round, which is invariant 4.
 *
 * Named for its domain, not for what it does: `usePlayback` is the playback STORE, and this hook
 * sat under that exact name inside `AnimationPanel` — an auto-import would have caught either.
 */
export function useAnimationPlayback(documentId: string, playing: boolean, duration: Us): void {
  useEffect(() => {
    if (!playing) return

    let frame = 0
    let last = performance.now()

    const step = (now: number): void => {
      // Read from the store rather than from a prop: the effect must not restart on the very
      // frames it causes, and a ref written during render is not allowed either.
      const views = useSceneViews.getState()
      // `performance.now()` counts milliseconds; the head counts microseconds.
      const next = sceneViewOf(views, documentId).playhead + (now - last) * 1000
      last = now

      if (next < duration) {
        views.setPlayhead(documentId, clampPlayhead(next, duration))
        frame = requestAnimationFrame(step)
        return
      }

      // Read at the end rather than watched: a loop turned on mid-play must not tear the frame
      // loop down and hang it again on the very frame it is about to wrap.
      if (!animationViewOf(useAnimationViews.getState(), documentId).looping) {
        views.setPlayhead(documentId, duration)
        views.setPlaying(documentId, false)
        return
      }

      // Wrapped, never set back to zero: what the last frame overshot is time the next pass owes,
      // and dropping it makes a loop run slower than the band says it does.
      views.setPlayhead(documentId, clampPlayhead(next - duration, duration))
      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [documentId, playing, duration])
}
