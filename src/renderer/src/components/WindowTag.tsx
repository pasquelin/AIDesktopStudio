import type { ReactNode } from 'react'
import { cn } from '@/helpers/cn'

export type WindowTagTone = 'neutral' | 'success' | 'error'

export type WindowTagProps = {
  children: ReactNode
  tone?: WindowTagTone
}

const TONE: Record<WindowTagTone, string> = {
  neutral: '',
  success: 'badge-success',
  error: 'badge-error',
}

/**
 * `Tag` for windows that are not docks — DaisyUI's `badge`. A window that reached for `Tag`
 * would paint studio tokens DaisyUI cannot resolve.
 */
export function WindowTag({ children, tone = 'neutral' }: WindowTagProps) {
  return <span className={cn('badge badge-sm', TONE[tone])}>{children}</span>
}
