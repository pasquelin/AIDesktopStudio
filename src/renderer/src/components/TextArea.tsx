import type { ComponentProps } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle, type ScHandle } from './scHandle'

export type TextAreaProps = ComponentProps<'textarea'> & ScHandle

/**
 * Several lines one types: a commit message, the body of a context card, a document read as raw
 * JSON. `resize-y py-1 text-xs` is the shape both panels asked for, so it is here rather than at
 * the two calls; a host that wants another one writes over it.
 *
 * Not every text area of the studio, and that is a decision: the assistant's composer, the note
 * on a generated image and the text edited on the canvas are TRANSPARENT — the card, the note and
 * the picture behind them carry the frame, and a bordered field inside a bordered card reads as
 * two boxes.
 */
export function TextArea({ className, ref, 'data-sc': sc, ...rest }: TextAreaProps) {
  return (
    <textarea
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      className={cn('textarea textarea-sm w-full resize-y py-1 text-xs', className)}
      {...rest}
    />
  )
}
