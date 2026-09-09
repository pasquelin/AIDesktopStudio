import type { ComponentProps } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle, type ScHandle } from './scHandle'

export type RadioProps = Omit<ComponentProps<'input'>, 'type'> & ScHandle

/**
 * One answer out of a list, and only one — `Checkbox` is the other half, for a list that keeps
 * several. Which of the two a list wears is what tells a reader how many answers are allowed,
 * before they press anything.
 */
export function Radio({ className, ref, 'data-sc': sc, ...rest }: RadioProps) {
  return (
    <input
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      type="radio"
      className={cn('radio radio-sm shrink-0', className)}
      {...rest}
    />
  )
}
