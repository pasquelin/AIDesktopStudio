import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle } from './scHandle'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /**
   * Room, alignment, and whatever a host adds inside the field — the left inset a magnifier
   * needs, the coloured start border of an axis. The gauge and the border are the plugin's.
   */
  className?: string
  /** On the tag rather than spread in, for the reason `Select` gives. */
  'data-sc'?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * A value one TYPES: a name, a path, a number, a search. Every text field of the studio and of
 * the windows goes through it.
 *
 * It replaced three skins that had drifted apart — `FIELD_FILL` bordered in the inspectors,
 * `CONTROL` unbordered in the search bars, daisyUI's own `.input` in the settings — the second
 * of which meant the one field people type in most had no border at all.
 *
 * `w-full` by default, over the plugin's `clamp(3rem, 20rem, 100%)`: a field of this studio sits
 * in a row that has already decided its width, and the clamp cut it at 20rem inside wide panels.
 */
export function Input({ className, ref, 'data-sc': sc, ...rest }: InputProps) {
  return (
    <input
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      className={cn('input input-sm w-full', className)}
      {...rest}
    />
  )
}
