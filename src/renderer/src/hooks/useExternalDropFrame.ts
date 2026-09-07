import { useState, type DragEvent, type DragEventHandler } from 'react'
import { cn } from '@/helpers/cn'
import { warnsDropTone, type DropTone } from '@/helpers/drag'

type ExternalDropFrame = {
  className: string
  onDragOver: DragEventHandler<HTMLDivElement>
  onDragLeave: DragEventHandler<HTMLDivElement>
  onDropCapture: DragEventHandler<HTMLDivElement>
}

export function useExternalDropFrame(
  toneOf: (event: DragEvent<HTMLDivElement>) => DropTone | null,
): ExternalDropFrame {
  const [tone, setTone] = useState<DropTone | null>(null)
  return {
    className: cn(
      'h-full',
      tone === 'accepted' && 'outline-accent outline-2 -outline-offset-2',
      warnsDropTone(tone) && 'outline-danger outline-2 -outline-offset-2',
    ),
    onDragOver: event => setTone(toneOf(event)),
    onDragLeave: event => {
      const next = event.relatedTarget
      if (!(next instanceof Node) || !event.currentTarget.contains(next)) setTone(null)
    },
    onDropCapture: () => setTone(null),
  }
}
