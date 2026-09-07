import { useState, type ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { TIP_LEFT } from '@/helpers/tooltip'
import { useDeferredPress } from '@/hooks/useDeferredPress'
import { useForgettableTimeout } from '@/hooks/useForgettableTimeout'
import { Flyout } from '../Flyout'
import { Spinner } from '../Spinner'
import { FIELD_THUMBNAIL } from '../styles'
import { Thumbnail } from '../Thumbnail'
import type { LinkOption } from './linkOption'
import type { LinkPress } from './linkPress'

const PREVIEW_DELAY = 400

type LinkThumbnailProps = {
  badge?: ReactNode
  busy?: boolean
  busyLabel?: string
  chosen?: LinkOption
  label: string
  open?: LinkPress
  press?: LinkPress
  shown?: string
}

function picture({
  busy,
  busyLabel,
  shown,
}: Pick<LinkThumbnailProps, 'busy' | 'busyLabel' | 'shown'>) {
  return (
    <span className={cn(FIELD_THUMBNAIL, 'relative shrink-0')}>
      <Thumbnail url={shown} className={FIELD_THUMBNAIL} />
      {busy && busyLabel && (
        <span className="bg-scrim absolute inset-0 grid place-items-center rounded-(--radius-sc-sm)">
          <Spinner label={busyLabel} />
        </span>
      )}
    </span>
  )
}

export function LinkFieldThumbnail(props: LinkThumbnailProps) {
  const { badge, chosen, label, open, press, shown } = props
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const resting = useForgettableTimeout()
  const availableOpen = chosen ? open : undefined
  const gestures = useDeferredPress(press?.run, availableOpen?.run)
  const named = press ?? availableOpen
  const thumbnail = picture(props)
  return (
    <span className="relative flex shrink-0">
      {named ? (
        <button
          type="button"
          {...gestures}
          {...TIP_LEFT(named.label, false, named.hint)}
          onPointerEnter={event => {
            const nextAnchor = event.currentTarget
            resting.after(PREVIEW_DELAY, () => setAnchor(nextAnchor))
          }}
          onPointerLeave={() => {
            resting.forget()
            setAnchor(null)
          }}
          className="cursor-pointer rounded-(--radius-sc-sm) border-none bg-transparent p-0"
        >
          {thumbnail}
        </button>
      ) : (
        thumbnail
      )}
      {badge}
      {anchor && shown && (
        <Flyout anchor={anchor} placement="right">
          <img
            src={shown}
            alt={chosen?.name ?? label}
            className="max-h-64 max-w-64 object-contain"
          />
        </Flyout>
      )}
    </span>
  )
}
