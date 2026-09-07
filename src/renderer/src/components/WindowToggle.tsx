import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle } from './scHandle'

export type WindowToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  'data-sc'?: string
  ref?: Ref<HTMLInputElement>
}

export function WindowToggle({ className, ref, 'data-sc': sc, ...rest }: WindowToggleProps) {
  return (
    <input
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      type="checkbox"
      className={cn('toggle toggle-sm', className)}
      {...rest}
    />
  )
}
