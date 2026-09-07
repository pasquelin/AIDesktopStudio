import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/helpers/cn'

export type WindowButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

const VARIANT: Record<WindowButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-ghost',
  quiet: '',
  danger: 'btn-error btn-outline',
}

const SIZE: Record<'window' | 'dialog' | 'row', string> = {
  window: 'btn-sm',
  dialog: '',
  row: 'btn-xs',
}

export type WindowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: WindowButtonVariant
  /** `row` for a button repeated down a list. NOT the `compact` DENSITY, which it does not follow. */
  size?: 'window' | 'dialog' | 'row'
  ref?: Ref<HTMLButtonElement>
}

/** A labelled action in an application window, distinct from the compact dock `Button`. */
export function WindowButton({
  variant = 'primary',
  size = 'window',
  type = 'button',
  className,
  ref,
  ...rest
}: WindowButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('btn', SIZE[size], VARIANT[variant], className)}
      {...rest}
    />
  )
}
