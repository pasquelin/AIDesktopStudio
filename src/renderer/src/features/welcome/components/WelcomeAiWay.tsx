import type { ReactNode } from 'react'
import { UiIcon } from '@/components/UiIcon'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { cn } from '@/helpers/cn'

/**
 * How each door is told apart at a glance. Three hues and an INVERSION rather than four hues: the
 * theme publishes three that clear both modes, and `info` is the same blue as `primary`.
 */
export type WelcomeAiTone = 'local' | 'ollama' | 'cloud' | 'studio'

const TILE: Record<WelcomeAiTone, string> = {
  local: 'bg-base-200 text-success',
  ollama: 'bg-base-200 text-warning',
  cloud: 'bg-base-200 text-primary',
  studio: 'bg-primary text-primary-content',
}

export type WelcomeAiWayProps = {
  glyph: string
  tone: WelcomeAiTone
  title: string
  body: string
  /** What the way OFFERS, where it offers something — the Ollama install, and nothing else today. */
  children?: ReactNode
}

/** One of the ways an AI reaches the studio, or the studio reaches an AI. */
export function WelcomeAiWay({ glyph, tone, title, body, children }: WelcomeAiWayProps) {
  return (
    <li className="border-base-300 flex flex-col gap-2 rounded-(--radius-sc-md) border p-3">
      <span className="flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-(--radius-sc-md)',
            TILE[tone],
          )}
        >
          <UiIcon path={glyph} size={18} />
        </span>
        <span className="text-sm font-semibold">{title}</span>
      </span>
      <span className={WINDOW_CAPTION}>{body}</span>
      {children}
    </li>
  )
}
