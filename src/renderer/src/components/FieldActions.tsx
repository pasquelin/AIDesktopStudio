import type { ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { ROW_ACTIONS } from './styles'

export type FieldActionsProps = {
  /** The buttons this line ends with, if any. Right-aligned, and never more than two. */
  children?: ReactNode
  compact?: boolean
}

/**
 * The room every property line keeps at its end, drawn into or not — which is what makes one
 * column out of the six the panel used to end on.
 */
export function FieldActions({ children, compact }: FieldActionsProps) {
  return (
    <span
      aria-hidden={children === undefined}
      className={cn(ROW_ACTIONS, compact && 'w-(--sc-control)')}
    >
      {children}
    </span>
  )
}
