import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/helpers/cn'
import { BUTTON_BASE, BUTTON_NEUTRAL } from './styles'

type ButtonVariant = 'primary' | 'neutral'

// The hover is a token, not an alpha of the fill: an alpha lets the surface through, so it
// darkened this button on the dark theme and lightened it on the light one — 3.52:1 for the label.
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-content hover:bg-accent-hover',
  neutral: BUTTON_NEUTRAL,
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `primary` for the one action a surface exists for; `neutral` for the rest. */
  variant?: ButtonVariant
  ref?: Ref<HTMLButtonElement>
}

/** The labelled action button of the docks, next to `ToolButton` which carries a glyph. */
export function Button({
  variant = 'neutral',
  className,
  type = 'button',
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      ref={ref}
      className={cn(
        BUTTON_BASE,
        'h-(--sc-control) px-3 text-xs font-medium',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
