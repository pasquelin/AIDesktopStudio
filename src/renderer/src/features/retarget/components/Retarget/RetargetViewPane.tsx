import type { CSSProperties, ReactNode } from 'react'
import { PanelHeader } from '@pasquelin/panels'
import { cn } from '@/helpers/cn'

type Props = {
  label: string
  title: string
  active: boolean
  style?: CSSProperties
  grow?: boolean
  onActivate: () => void
  children: ReactNode
}

export function RetargetViewPane({
  label,
  title,
  active,
  style,
  grow,
  onActivate,
  children,
}: Props) {
  return (
    <section
      tabIndex={0}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      style={style}
      className={cn(
        'flex min-h-0 min-w-0 flex-col',
        grow && 'flex-1',
        active && 'ring-border ring-1 ring-inset',
      )}
    >
      <PanelHeader title={title} />
      {children}
    </section>
  )
}
