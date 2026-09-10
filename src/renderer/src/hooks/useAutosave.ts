import { useEffect } from 'react'
import { useSettings } from '@/stores/settings'
import { keepUnsavedWorkSafe } from '@/features/shell/unsavedWork'

/** The gap between two passes — and the most work a crash can cost, which the help text names. */
export const AUTOSAVE_INTERVAL_MS = 30_000

/**
 * Puts unsaved work somewhere a crash cannot take it, so one costs at most half a minute.
 *
 * 🛑 It does NOT write the user's files. That is what it used to do, and it is how opening a
 * video came to leave an `.otio` beside it — see `documentRecovery.ts`.
 *
 * On a timer rather than on each edit: what a document holds changes on every stroke of a
 * pointer, and a save armed by each of them would either fire constantly or need a notion of
 * "done editing" that no editor here has.
 *
 * Rearmed AFTER each pass rather than on an interval, which is the whole reason this is not
 * three lines: a pass slower than the gap — a large scene, a montage — would otherwise start
 * again on top of itself, capturing the same editors twice at once.
 */
export function useAutosave(): void {
  const enabled = useSettings(state => state.settings.general.autosave)

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setTimeout>
    let stopped = false

    const arm = (): void => {
      timer = setTimeout(() => {
        // Caught here as well as per document inside the pass: what fails here is the schedule
        // itself, and a clock that stops on the first failure would go quiet exactly when the
        // disk is full — which is when the net is worth having.
        void keepUnsavedWorkSafe()
          .catch(() => {})
          .finally(() => {
            if (!stopped) arm()
          })
      }, AUTOSAVE_INTERVAL_MS)
    }

    arm()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [enabled])
}
