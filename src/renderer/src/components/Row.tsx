import { createElement, type ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import {
  ROW_CONTROL,
  ROW_INK,
  ROW_LINE,
  ROW_MEDIA_CONTROL,
  ROW_MEDIA_PICTURE,
  ROW_MEDIA_STACKED,
  ROW_PICTURE,
  ROW_QUIET,
  ROW_STACKED,
  ROW_SUFFIX,
} from './styles'
import { TIP_RIGHT, type TooltipFactory } from '@/helpers/tooltip'
import { UiIcon } from './UiIcon'
export type RowProps = {
  media?: ReactNode
  icon?: string
  /**
   * What that glyph is inked in — a section's hue, where the row stands for something that has
   * one. Left out, it takes the ink of the words beside it, which is what a plain row wants.
   */
  iconInk?: string
  title: string
  suffix?: string
  clip?: 'end' | 'start'
  subtitle?: string
  leading?: ReactNode
  actions?: ReactNode
  muted?: boolean
  quiet?: boolean
  hint?: string
  tip?: TooltipFactory
}

function rowMedia({
  media,
  icon,
  iconInk,
  box,
}: Pick<RowProps, 'media' | 'icon' | 'iconInk'> & { box: string }) {
  if (media) return <div className={box}>{media}</div>
  return icon ? <UiIcon path={icon} size={14} className={cn('shrink-0', iconInk)} /> : null
}

function rowTitle({ title, suffix, clip, muted, quiet, hint, tip = TIP_RIGHT }: RowProps) {
  const clipping = suffix
    ? 'flex min-w-0 items-baseline'
    : clip === 'start'
      ? 'truncate-start'
      : 'truncate'
  const ink = muted ? cn(ROW_QUIET, 'line-through') : quiet ? ROW_QUIET : ROW_INK
  return (
    <p
      {...(hint ? tip(title, false, hint) : {})}
      className={cn(clipping, 'text-xs leading-tight', ink)}
    >
      {suffix ? (
        <span className={clip === 'start' ? 'truncate-start' : 'truncate'}>{title}</span>
      ) : (
        title
      )}
      {suffix && <span className={ROW_SUFFIX}>{suffix}</span>}
    </p>
  )
}
export function Row({
  media,
  icon,
  iconInk,
  title,
  suffix,
  clip,
  subtitle,
  leading,
  actions,
  muted,
  quiet,
  hint,
  tip = TIP_RIGHT,
}: RowProps) {
  const shape = media && subtitle ? 'picture' : subtitle ? 'stacked' : 'control'
  const line = { picture: ROW_PICTURE, stacked: ROW_STACKED, control: ROW_CONTROL }[shape]
  const box = {
    picture: ROW_MEDIA_PICTURE,
    stacked: ROW_MEDIA_STACKED,
    control: ROW_MEDIA_CONTROL,
  }[shape]
  return (
    <div className={cn(ROW_LINE, 'min-w-0 flex-1 gap-2', line)}>
      {leading}
      {createElement(rowMedia, { media, icon, iconInk, box })}
      <div className="min-w-0 flex-1 leading-tight">
        {createElement(rowTitle, { title, suffix, clip, muted, quiet, hint, tip })}

        {subtitle && (
          <p title={subtitle} className={cn(ROW_QUIET, 'text-mini truncate')}>
            {subtitle}
          </p>
        )}
      </div>
      {actions}
    </div>
  )
}
