import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/helpers/cn'
import { withoutTip, type TooltipFactory } from '@/helpers/tooltip'
import { BUTTON_BASE, TONE_TEXT, type StatusTone } from './styles'
import { UiIcon } from './UiIcon'
const HOSTS = {
  bar: { box: 'size-(--sc-control)', glyph: 16 },
  header: { box: 'size-(--sc-control)', glyph: 14 },
  row: { box: 'size-(--sc-control-inline)', glyph: 14 },
}
export type ToolButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'aria-pressed' | 'children' | 'title'
> & {
  icon?: string
  label: string
  description?: string
  tooltip: TooltipFactory
  tipHidden?: boolean
  shortcut?: string | false
  active?: boolean
  acts?: boolean
  told?: boolean
  accented?: boolean
  tone?: StatusTone
  variant?: keyof typeof HOSTS
  iconSize?: number
  children?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

function toolButtonClass({
  icon,
  children,
  variant = 'bar',
  tone,
  disabled,
  active,
  accented,
  className,
}: Pick<
  ToolButtonProps,
  'icon' | 'children' | 'variant' | 'tone' | 'disabled' | 'active' | 'accented' | 'className'
>): string {
  return cn(
    BUTTON_BASE,
    icon !== undefined && children !== undefined && 'gap-1.5',
    'text-muted shrink-0 bg-transparent',
    HOSTS[variant].box,
    'hover:bg-elevated',
    tone && !disabled ? TONE_TEXT[tone] : 'hover:text-text',
    active && 'bg-elevated text-text',
    accented && 'bg-accent hover:bg-accent text-accent-content',
    className,
  )
}
export function ToolButton({
  icon,
  label,
  description,
  tooltip,
  tipHidden,
  shortcut,
  active,
  acts,
  told,
  accented,
  tone,
  variant = 'bar',
  disabled,
  className,
  iconSize,
  children,
  ref,
  ...rest
}: ToolButtonProps) {
  const named = tooltip(label, shortcut, description)
  const naming = tipHidden ? withoutTip(named) : named
  return (
    <button
      type="button"
      ref={ref}
      aria-pressed={acts ? undefined : (told ?? active)}
      disabled={disabled}
      className={toolButtonClass({
        icon,
        children,
        variant,
        tone,
        disabled,
        active,
        accented,
        className,
      })}
      {...naming}
      {...rest}
    >
      {icon !== undefined && <UiIcon path={icon} size={iconSize ?? HOSTS[variant].glyph} />}
      {children}
    </button>
  )
}
