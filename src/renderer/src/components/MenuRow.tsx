import { mdiCheck } from '@mdi/js'
import { cn } from '@/helpers/cn'
import { UiIcon } from './UiIcon'

/**
 * What a tick means, which is not the same question twice.
 *
 * `one-of` is a row among alternatives — a tool's mode, an account, the size of a shelf — and
 * ticking one unticks the rest. `on-off` is a row that answers for itself, like a layer's two
 * padlocks, where any number can be on at once.
 */
export type MenuTick = 'one-of' | 'on-off'

const ROLE: Record<MenuTick, 'menuitemradio' | 'menuitemcheckbox'> = {
  'one-of': 'menuitemradio',
  'on-off': 'menuitemcheckbox',
}

export type MenuRowBase = {
  /** Already translated: the row draws what it is handed and looks nothing up. */
  label: string
  /**
   * Absent for a row whose meaning is entirely in its tick — a filter that is on or off. The
   * column is KEPT when it is, exactly as the tick's is: a menu mixing rows with and without a
   * glyph would step its labels in and out by fourteen pixels, and the first caller to leave one
   * out did precisely that.
   */
  icon?: string
  /** The chord that runs the row, drawn at its right end. */
  shortcut?: string
  /** A figure the row reports there instead — an account's remaining credit. */
  note?: string
  disabled?: boolean
  /**
   * Tooltip attributes from the host's factory, already resolved. Required, like `ToolButton`'s
   * own: it was optional over thirty-three rows, and thirty-two of them said nothing. A row
   * whose label is already on screen wants `HINT_*` — `TIP_*` would set an `aria-label` over a
   * visible name (WCAG 2.5.3).
   */
  tip: Record<string, string>
  onSelect: () => void
}

/**
 * A row either has no tick at all, or has one AND says what it means. There is no default: a
 * guess would be wrong for exactly one caller — the padlocks — and wrong in silence, since a
 * reader hears "radio button" and takes the other rows for alternatives it does not have.
 */
export type MenuRowChoice =
  { checked?: undefined; tick?: undefined } | { checked: boolean; tick: MenuTick }

export type MenuRowProps = MenuRowBase & MenuRowChoice

/**
 * One row of a flyout menu, wherever the flyout hangs from — the toolbar's mode groups, a panel
 * title bar's add button. Written once so a row keeps one height, one tick column and one
 * disabled look across all of them.
 *
 * The role follows the tick, and it has to: `aria-checked` is not allowed on a plain `menuitem`,
 * so a row that drew the tick and kept the role announced nothing at all — which is what every
 * menu of the studio did.
 *
 * No `tabIndex` here on purpose. A menu is one stop in the tab sequence and `useMenuKeys` drives
 * which row holds it; written here as well, React would put it back on every render.
 */
export function MenuRow({
  label,
  icon,
  shortcut,
  note,
  disabled,
  checked,
  tick,
  tip,
  onSelect,
}: MenuRowProps) {
  return (
    <button
      type="button"
      role={tick ? ROLE[tick] : 'menuitem'}
      {...(tick ? { 'aria-checked': checked } : {})}
      disabled={disabled}
      {...tip}
      className={cn(
        // The tick marks what is armed; the accent marks what the pointer is on. Two
        // different questions, and colouring the armed row would answer neither.
        'group text-text hover:bg-accent hover:text-accent-content flex cursor-pointer items-center',
        // `shrink-0` next to the height, not instead of it: a row is a flex item of a column
        // that stops at `max-h`, so a full menu squeezed every row to 16.5px of the gauge's 28.
        'h-(--sc-control) shrink-0 gap-2 rounded-(--radius-sc-md) border-none bg-transparent px-2',
        'text-tiny text-start transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        'disabled:hover:text-text',
        // The keyboard walks these rows without the pointer being anywhere near them, so the
        // focused row has to light up on its own — `hover:` alone left the walk invisible. A FILL
        // and not a ring: the studio draws none any more, and `index.css` says why.
        'focus-visible:bg-accent focus-visible:text-accent-content',
      )}
      onClick={onSelect}
    >
      {/* The tick keeps its column even when absent: rows whose labels shift left by a glyph
          are unreadable as a list. */}
      <span className="flex w-3.5 shrink-0 justify-center">
        {checked && <UiIcon path={mdiCheck} size={12} />}
      </span>
      <span className="flex w-3.5 shrink-0 justify-center">
        {icon && <UiIcon path={icon} size={14} />}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {/* `group-focus-within` beside the hover: the keyboard walks these rows without a pointer
          anywhere near them, and the shortcut was the one thing left at `muted` on the accent —
          1.33:1 there, 2.03 on a picked yellow. The row's own fill already follows both. */}
      {(shortcut ?? note) && (
        <span
          className={cn(
            'text-muted text-mini shrink-0 ps-3',
            'group-hover:text-accent-content group-focus-within:text-accent-content',
          )}
        >
          {shortcut ?? note}
        </span>
      )}
    </button>
  )
}
