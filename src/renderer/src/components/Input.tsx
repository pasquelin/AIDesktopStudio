import type { ComponentProps } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle, type ScHandle } from './scHandle'

export type InputProps = ComponentProps<'input'> & ScHandle

/**
 * A value one TYPES: a name, a path, a number, a search. Every text field of the studio and of
 * the windows goes through it.
 *
 * `w-full min-w-0` over the plugin's `clamp(3rem, 20rem, 100%)`: a field here sits in a row that
 * has already decided its width, the clamp cut it at 20rem inside wide panels, and a flex child
 * sized to its content pushes the row wider than the panel holding it. What a host adds is the
 * room INSIDE the field — the inset a magnifier takes, the coloured start border of an axis.
 */
export function Input({ className, ref, 'data-sc': sc, ...rest }: InputProps) {
  return (
    <input
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      className={cn('input input-sm w-full min-w-0', className)}
      {...rest}
    />
  )
}
