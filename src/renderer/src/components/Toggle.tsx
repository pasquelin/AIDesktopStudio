import type { ComponentProps } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle, type ScHandle } from './scHandle'

export type ToggleProps = Omit<ComponentProps<'input'>, 'type'> & ScHandle

/**
 * A switch one FLIPS: a setting that takes effect where it stands. `Checkbox` is the other half,
 * for a value something else will act on.
 *
 * `-sm` like the checkbox, and the multiplier is why: the plugin measures both at
 * `--size-selector * 5` on that step, so the two stand at the same 16px. `-md` reads as the same
 * word and computes `* 6`.
 */
export function Toggle({ className, ref, 'data-sc': sc, ...rest }: ToggleProps) {
  return (
    <input
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      type="checkbox"
      className={cn('toggle toggle-sm shrink-0', className)}
      {...rest}
    />
  )
}
