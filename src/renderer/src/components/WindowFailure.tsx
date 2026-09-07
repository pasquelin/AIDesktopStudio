import type { ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { HINT_RIGHT } from '@/helpers/tooltip'
import { WindowButton } from './WindowButton'

/** The way out of a failure: what it offers, what the label leaves unsaid, and what it does. */
export type WindowFailureAction = {
  label: string
  hint: string
  onClick: () => void
}

export type WindowFailureProps = {
  /** Already translated, as every component of `design/` takes its words. */
  children: ReactNode
  /** Offered where the failure can be retried, absent where nothing here undoes it. */
  action?: WindowFailureAction
  className?: string
}

/**
 * What a window that is NOT a dock says when something went wrong.
 *
 * `role="alert"` and `text-error` together, never one without the other: three windows said this
 * three ways, two of them on the same screen, and one of the three said it in no colour and to
 * nobody — which reads as an ordinary caption on the one line somebody was waiting for.
 */
export function WindowFailure({ children, action, className }: WindowFailureProps) {
  const sentence = (
    <p role="alert" className={cn('text-error text-xs', !action && className)}>
      {children}
    </p>
  )

  if (!action) return sentence

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      {sentence}
      <WindowButton variant="secondary" {...HINT_RIGHT(action.hint)} onClick={action.onClick}>
        {action.label}
      </WindowButton>
    </div>
  )
}
