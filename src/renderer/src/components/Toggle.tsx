import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle } from './scHandle'

export type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Room and alignment only: the gauge is `--size-selector`'s, at every density. */
  className?: string
  /** On the tag rather than spread in, for the reason `Select` gives. */
  'data-sc'?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * A switch one FLIPS: a setting that takes effect where it stands — the preferences, an option
 * of a window. `Checkbox` is the other half, for a value something else will act on.
 *
 * `toggle-md` rather than `-sm`, and it is the gauge that says so: the plugin measures a switch
 * at `--size-selector * 5` on `-md` and `* 4` on `-sm`, so `-md` is the step that lands on the
 * 16px a ticked box takes. Reading the class as a size rather than as a multiplier is how the
 * two would drift apart again.
 */
export function Toggle({ className, ref, 'data-sc': sc, ...rest }: ToggleProps) {
  return (
    <input
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      type="checkbox"
      className={cn('toggle toggle-md shrink-0', className)}
      {...rest}
    />
  )
}
