import { mdiChevronDown } from '@mdi/js'
import type { ComponentProps } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle, type ScHandle } from './scHandle'
import { UiIcon } from './UiIcon'

export type SelectProps = ComponentProps<'select'> & {
  /**
   * Worn by the BOX, not by the list — width, and the ink an empty value reads in. The chevron is
   * pinned to that box, so a width written on the control itself would leave the glyph standing
   * beside it rather than inside it.
   */
  className?: string
} & ScHandle

/**
 * The studio's `<select>`: daisyUI's list wearing the studio's gauges, with the chevron the
 * plugin draws replaced by the studio's own.
 *
 * `bg-none` removes the plugin's own chevron, which it draws as a pair of background gradients:
 * `RowChevron`, `MenuButton` and `TitleBarSelect` all open a list with the mdi glyph, and a fifth
 * shape for the same gesture is what this component exists to stop. The room the glyph stands in
 * is daisyUI's own `padding-inline: .75rem 1.75rem`, which is why none is added.
 */
export function Select({ className, children, ref, 'data-sc': sc, ...rest }: SelectProps) {
  return (
    <span
      className={cn(
        // The ink is the box's, and `text-inherit` below is why: a colour written on the list
        // itself is one the caller could not have got past — the filter bars read `text-muted`
        // while nothing is chosen.
        'text-text relative inline-flex min-w-0 items-center',
        className,
      )}
    >
      <select
        ref={ref}
        data-sc={windowFieldHandle(sc)}
        className="select select-sm w-full bg-none text-inherit"
        {...rest}
      >
        {children}
      </select>
      <UiIcon
        path={mdiChevronDown}
        size={12}
        className="text-muted pointer-events-none absolute end-3"
      />
    </span>
  )
}
