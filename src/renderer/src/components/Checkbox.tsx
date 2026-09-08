import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle } from './scHandle'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Room, alignment and nothing else: the gauge is `--size-selector`'s, at every density. */
  className?: string
  /** On the tag rather than spread in, for the reason `Select` gives. */
  'data-sc'?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * A box one TICKS: a value inside a form, or a line picked out of a list — a staged file, a
 * context card, an option of the generator.
 *
 * The counterpart is `Toggle`, and the difference is what the answer DOES: a checkbox holds a
 * value that something else will act on, a toggle takes effect where it stands. A list also
 * decides it here: ticked boxes read as a column, and twenty toggles down a panel do not.
 *
 * It replaced six call sites that each wrote `cn(CHECKBOX, 'size-3')` or `size-4` — two gauges
 * for one control, neither of which followed the density setting.
 */
export function Checkbox({ className, ref, 'data-sc': sc, ...rest }: CheckboxProps) {
  return (
    <input
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      type="checkbox"
      className={cn('checkbox checkbox-sm shrink-0', className)}
      {...rest}
    />
  )
}
