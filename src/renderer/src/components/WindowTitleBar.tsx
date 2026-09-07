import type { ReactNode } from 'react'
import { DRAGGABLE } from '@/helpers/appRegion'

export type WindowTitleBarProps = {
  /** Already translated, as every design component takes its words. */
  title: string
  /** What sits at the right of the bar — a period picker, a filter. Dragged, so a control inside needs `CLICKABLE`. */
  actions?: ReactNode
}

/**
 * The top of every window of the studio that is not a dock: it names what the window is on, it
 * drags the window, and its left inset is the room the native traffic lights float in.
 *
 * Apart from `WindowShell` because the skeleton window needs this half and none of the other —
 * no navigation column, no DaisyUI ground under it. Copying the header there instead would have
 * left the two free to drift, and the inset that clears the traffic lights is exactly the kind
 * nobody notices has drifted until a window ships with its title under a button.
 *
 * 🛑 No full-screen switch, and that is why every window wearing this is `fullscreenable: false`
 * — see `auxiliaryWindow`. macOS takes the traffic lights away in full screen, and the inset
 * would then be 96 px of nothing.
 *
 * Its height is `--sc-title-bar`, the studio's own, which `main/window/theme.test.ts` ties to
 * where the main process places the lights: that is what centres a title on them.
 */
export function WindowTitleBar({ title, actions }: WindowTitleBarProps) {
  return (
    <header
      style={DRAGGABLE}
      className="text-body flex h-(--sc-title-bar) shrink-0 items-center pr-6 pl-24 font-medium"
    >
      {/* A heading rather than bare words: it is the only thing naming the window to a reader,
          and Tailwind's preflight leaves an `h1` at the size its container gives it. */}
      <h1>{title}</h1>
      {actions}
    </header>
  )
}
