import type { ComponentProps } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle, type ScHandle } from './scHandle'

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & ScHandle

/**
 * A box one TICKS: a value inside a form, or a line picked out of a list — a staged file, a
 * context card, an option of the generator.
 *
 * `Toggle` is the other half, and what separates them is what the answer DOES: a checkbox holds a
 * value something else will act on, a toggle takes effect where it stands. A list decides it too:
 * ticked boxes read as a column, twenty switches down a panel do not.
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
