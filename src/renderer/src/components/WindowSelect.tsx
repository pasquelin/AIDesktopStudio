import type { Ref, SelectHTMLAttributes } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle } from './scHandle'

export type WindowSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  controlSize?: 'xs' | 'sm'
  'data-sc'?: string
  ref?: Ref<HTMLSelectElement>
}

export function WindowSelect({
  controlSize = 'sm',
  className,
  ref,
  'data-sc': sc,
  ...rest
}: WindowSelectProps) {
  return (
    <select
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      className={cn('select', `select-${controlSize}`, className)}
      {...rest}
    />
  )
}
