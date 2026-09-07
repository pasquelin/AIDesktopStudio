import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle } from './scHandle'

export type WindowInputProps = InputHTMLAttributes<HTMLInputElement> & {
  controlSize?: 'xs' | 'sm'
  'data-sc'?: string
  ref?: Ref<HTMLInputElement>
}

export function WindowInput({
  controlSize = 'sm',
  className,
  ref,
  'data-sc': sc,
  ...rest
}: WindowInputProps) {
  return (
    <input
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      className={cn('input', `input-${controlSize}`, className)}
      {...rest}
    />
  )
}
