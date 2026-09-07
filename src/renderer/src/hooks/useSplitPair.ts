import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { fitSplit } from '@pasquelin/panels'

export type SplitPair = {
  /** Goes on the element holding both panes: it is what everything else is measured against. */
  pairRef: RefObject<HTMLDivElement | null>
  /** The leading pane: an equal share of the pair until the divider is dragged, its own size after. */
  leadStyle: CSSProperties
  /** What the divider STARTS FROM — the leading pane's size, which is what a drag moves. */
  leadSize: number
  onLeadSize: (size: number, room: number) => void
}

/**
 * Two panes cut by a draggable divider, as both monitor pairs read it — the picture pair side by
 * side, the sound pair stacked, which carried the same twenty lines each.
 *
 * The axis is the one its `ResizeHandle` takes, and for the same reason that component gives:
 * `vertical` moves up and down and sets a height, `horizontal` sets a width. It is the dimension
 * being read, not a second behaviour — the decision is one.
 *
 * The pair changes size without any drag — the window, a panel, the timeline being opened. A size
 * kept in pixels through that either overflows the pair or leaves the trailing pane nothing, so it
 * is re-clamped the way the shell re-clamps its zones after a window resize.
 */
export function useSplitPair(axis: 'vertical' | 'horizontal'): SplitPair {
  const pairRef = useRef<HTMLDivElement>(null)
  /** Null until the divider is dragged: the two panes share the pair equally before that. */
  const [draggedSize, setDraggedSize] = useState<number | null>(null)
  /** The pair's own size, so the handle starts a drag from where the divider actually is. */
  const [available, setAvailable] = useState(0)
  const lying = axis === 'vertical'

  useEffect(() => {
    const pair = pairRef.current
    if (!pair) return

    const observer = new ResizeObserver(() => {
      const room = lying ? pair.clientHeight : pair.clientWidth
      setAvailable(room)
      setDraggedSize(current => (current === null ? null : fitSplit(current, room)))
    })
    observer.observe(pair)
    return () => observer.disconnect()
  }, [lying])

  const onLeadSize = useCallback(
    (size: number, room: number) => setDraggedSize(fitSplit(size, room)),
    [],
  )

  return {
    pairRef,
    leadStyle: leadStyleOf(draggedSize, lying),
    leadSize: draggedSize ?? available / 2,
    onLeadSize,
  }
}

function leadStyleOf(size: number | null, lying: boolean): CSSProperties {
  if (size === null) return { flex: 1 }
  return lying ? { height: size, flexShrink: 0 } : { width: size, flexShrink: 0 }
}
