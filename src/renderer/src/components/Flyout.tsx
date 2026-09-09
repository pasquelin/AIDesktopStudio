import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clampAtLeast } from '@shared/numeric'
import { cn } from '@/helpers/cn'
import { holdPortalAnchor, PORTAL_MARK } from './portalAnchors'
import { useDismiss } from '@/hooks/useDismiss'
import { useMenuKeys } from '@/hooks/useMenuKeys'
import { MENU_FLOATING } from './styles'

/**
 * Which side of its anchor the menu hangs on.
 *
 * `under` is the one that belongs to a FIELD: it takes the anchor's left edge and its width, the
 * way a `<select>` does. The others hang from a control whose own width means nothing to the
 * rows: `right`, `above` and `below` align RIGHT edges, for the status line and the title bar
 * which anchor against the window edge — `below-left` is for a bar that does not, where a menu
 * hung from the right of a narrow button reads as belonging to whatever sits before it.
 */
type FlyoutPlacement = 'right' | 'above' | 'below' | 'below-left' | 'under'

export type FlyoutProps = {
  anchor: HTMLElement | null
  children: ReactNode
  placement?: FlyoutPlacement
  /**
   * Declared rather than assumed. `role="menu"` promises rows a screen reader can step through,
   * and the surface also serves panels and sliders — announcing a menu that has no menu items
   * sends a reader looking for something that is not there.
   */
  role?: 'menu'
  /**
   * Closes on a press outside, on `Escape`, and when the window loses focus. Optional for a
   * surface whose caller closes it another way — `useHoverFlyout` now passes it always, since a
   * menu it kept open for the keyboard has no pointer-out left to close it. Must be stable: it
   * is what the listeners hang off.
   */
  onDismiss?: () => void
  /**
   * Gives the surface a menu's keyboard: focus on the first row, arrows, `Home`/`End`, a roving
   * `tabindex`, and the focus handed back to the opener on the way out. The callback is what
   * `Tab` calls.
   *
   * Optional, the same shape as `onDismiss` and for the same reason — a flyout that opens under
   * the pointer would take the focus from whatever the caret was in. Rows are found by THEIR OWN
   * role inside the panel, not by the panel's: a surface holding sliders installs the walk and
   * finds nothing to walk, which costs a listener and hands the focus back to the opener as it
   * closes. Both are wanted, so there is no guard against it.
   */
  onKeyClose?: () => void
  /**
   * What the WINDOW losing focus does, when that is not what closing means. Defaults to
   * `onDismiss`: a surface holding a decision answers it itself rather than letting an alt-tab
   * answer for the user.
   */
  onWindowLeave?: () => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  /** Told which key the rows were walked with. `useMenuKeys` does the walking; this only reports. */
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * Gap between the bar and its rows. Kept small on purpose: every pixel here is a pixel the
 * pointer crosses over nothing, and `useHoverFlyout`'s grace period has to cover it.
 */
const OFFSET = 2

/** Kept inside the window: rows drawn past its edge cannot be reached, by pointer or by key. */
function clamped(wanted: number, size: number, within: number): number {
  return clampAtLeast(wanted, 0, within - size)
}

/**
 * The rows of a tool's modes, laid beside the bar.
 *
 * Portalled to the document root rather than rendered in place: a toolbar is a rounded surface
 * with its own overflow, and a menu drawn inside it gets clipped by its edge. Same rule as
 * map3D's anchored panels.
 */
export function Flyout({
  anchor,
  children,
  placement = 'right',
  role,
  onDismiss,
  onKeyClose,
  onWindowLeave,
  onPointerEnter,
  onPointerLeave,
  onKeyDown,
}: FlyoutProps) {
  const panel = useRef<HTMLDivElement | null>(null)

  // Who raised it, for `useDismiss` — see `portalAnchors.ts`.
  useEffect(() => {
    const node = panel.current
    return node && anchor ? holdPortalAnchor(node, anchor, Boolean(onDismiss)) : undefined
  }, [anchor, onDismiss])

  useDismiss(onDismiss, panel, anchor, onWindowLeave)
  useMenuKeys(panel, onKeyClose)

  // Placed through a callback ref rather than state: measuring in an effect and storing the
  // result would render the menu once at the wrong place, then move it.
  const place = useCallback(
    (node: HTMLDivElement | null) => {
      panel.current = node
      if (!node || !anchor) return
      const box = anchor.getBoundingClientRect()

      if (placement === 'right') {
        node.style.top = `${clamped(box.top, node.offsetHeight, window.innerHeight)}px`
        // Flipped to the other side when the anchor sits too near the right edge. A section
        // heading reaches the very edge of the window, and its menu was drawn outside it.
        const beside = box.right + OFFSET
        const fits = beside + node.offsetWidth <= window.innerWidth
        // Clamped like every other placement, the flip included: a menu wider than the room to
        // the left of its anchor lands at a negative x, and runs off the side it flipped to.
        const wanted = fits ? beside : box.left - node.offsetWidth - OFFSET
        node.style.left = `${clamped(wanted, node.offsetWidth, window.innerWidth)}px`
        return
      }

      if (placement === 'under') {
        // The field's own width, set BEFORE the left edge is clamped: the clamp reads
        // `offsetWidth`, and reading it first would measure the menu's content instead.
        node.style.width = `${box.width}px`
        node.style.top = `${box.bottom + OFFSET}px`
        node.style.left = `${clamped(box.left, box.width, window.innerWidth)}px`
        return
      }

      const above = placement === 'above'
      node.style.top = `${above ? box.top - node.offsetHeight - OFFSET : box.bottom + OFFSET}px`
      // Right edges by default — the status line and the title bar anchor against the window
      // edge, and a menu hung from their left would run off it. `below-left` is the other case.
      const edge = placement === 'below-left' ? box.left : box.right - node.offsetWidth
      node.style.left = `${clamped(edge, node.offsetWidth, window.innerWidth)}px`
    },
    [anchor, placement],
  )

  if (!anchor) return null

  return createPortal(
    <div
      ref={place}
      {...{ [PORTAL_MARK]: '' }}
      role={role}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
      className={cn(
        MENU_FLOATING,
        'min-w-40',
        // The scene's Add menu is 22 rows: unbounded it runs off the bottom of the window,
        // and the rows past the edge are unreachable.
        'max-h-[min(60vh,32rem)] overflow-y-auto',
      )}
    >
      {children}
    </div>,
    document.body,
  )
}
