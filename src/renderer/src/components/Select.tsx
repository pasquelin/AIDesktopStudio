import { mdiChevronDown } from '@mdi/js'
import type { Ref, SelectHTMLAttributes } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle } from './scHandle'
import { UiIcon } from './UiIcon'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /**
   * Worn by the BOX, not by the list — width, height, the ink an empty value reads in.
   *
   * The chevron is pinned to that box, so a width written on the control itself would leave the
   * glyph standing beside it rather than inside it. The list fills whatever the box measures,
   * which is also the one hook a host on another gauge has: `h-8` here reaches the select.
   */
  className?: string
  /**
   * Written on the tag rather than spread in with the rest: `pilotable.test.ts` reads the
   * OPENING TAG of every raw control, and a handle arriving through `...rest` is a field a
   * script cannot see the studio drive. Both spellings are taken — a full `field:` handle, or
   * the bare id a reusable control prefers.
   */
  'data-sc'?: string
  ref?: Ref<HTMLSelectElement>
}

/**
 * The studio's `<select>`: daisyUI's list wearing the studio's gauges, with the chevron the
 * plugin draws replaced by the studio's own.
 *
 * Every select goes through it — the four layouts of `SelectField`, the generation form, the
 * settings windows — because they had drifted into four apparences: bordered here, borderless
 * there, the browser's own glyph in the docks and daisyUI's two triangles in the windows.
 *
 * `bg-none` is what removes those triangles: the plugin draws its chevron as a pair of gradients
 * in the background, and `RowChevron`, `MenuButton` and `TitleBarSelect` all open a list with the
 * mdi glyph — a fifth shape for the same gesture is what this component exists to stop. The room
 * it stands in is daisyUI's own `padding-inline: .75rem 1.75rem`, which is why none is added.
 */
export function Select({ className, children, ref, 'data-sc': sc, ...rest }: SelectProps) {
  return (
    <span
      className={cn(
        // The ink is the box's, and `text-inherit` below is why: a colour written on the list
        // itself is one the caller could not have got past — the filter bars read `text-muted`
        // while nothing is chosen.
        'text-text relative inline-flex h-(--sc-control) min-w-0 items-center',
        className,
      )}
    >
      <select
        ref={ref}
        data-sc={windowFieldHandle(sc)}
        className="select select-sm h-full w-full bg-none text-inherit"
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
