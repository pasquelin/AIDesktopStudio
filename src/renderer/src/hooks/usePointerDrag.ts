import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'

/** What one drag holds, and the pointer it belongs to. Mutable in place: this IS the ref. */
type Dragging<T> = T & { pointerId: number }

export type PointerDrag<T> = {
  /** Captures the pointer, so the gesture survives a cursor leaving the element it began on. */
  start: (event: ReactPointerEvent<Element>, held: T) => void
  /**
   * The drag this event belongs to, or `null`. A mouse has no implicit capture, so a move with the
   * button held from elsewhere reaches us too, and would be read from a stale origin.
   */
  matching: (event: ReactPointerEvent<Element>) => Dragging<T> | null
  /** Whatever is in flight, whichever pointer opened it — for a caller that reads before it ends. */
  held: () => Dragging<T> | null
  /** Ends the matching drag and hands back what it held, so a caller can act on how it ended. */
  end: (event: ReactPointerEvent<Element>) => Dragging<T> | null
  /** Ends it whatever the pointer, releasing nothing — for a capture the platform already took back. */
  cancel: () => void
}

/**
 * One drag, held against the pointer that opened it. What a gesture MEANS stays with its caller;
 * this holds the pointer, the identity guard and the capture. Stable across renders, so a caller
 * may put it in the deps of a memoised handler.
 */
export function usePointerDrag<T extends object>(): PointerDrag<T> {
  const drag = useRef<Dragging<T> | null>(null)

  return useMemo(() => {
    const matching = (event: ReactPointerEvent<Element>): Dragging<T> | null =>
      drag.current?.pointerId === event.pointerId ? drag.current : null

    return {
      start: (event, held) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { ...held, pointerId: event.pointerId }
      },
      matching,
      held: () => drag.current,
      end: event => {
        const ending = matching(event)
        if (!ending) return null

        drag.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        return ending
      },
      cancel: () => {
        drag.current = null
      },
    }
  }, [])
}
