import type { Ref, TextareaHTMLAttributes } from 'react'
import { cn } from '@/helpers/cn'
import { windowFieldHandle } from './scHandle'

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** How tall it stands and whether it can be dragged taller — the skin is the plugin's. */
  className?: string
  /** On the tag rather than spread in, for the reason `Select` gives. */
  'data-sc'?: string
  ref?: Ref<HTMLTextAreaElement>
}

/**
 * Several lines one types: a commit message, the body of a context card, a document read as raw
 * JSON.
 *
 * Not every text area of the studio, and that is a decision rather than an omission: the
 * assistant's composer, the note on a generated image and the text being edited on the canvas are
 * TRANSPARENT — the card, the note and the picture behind them carry the frame, and a bordered
 * field inside a bordered card reads as two boxes.
 *
 * `w-full` over the plugin's `clamp(3rem, 20rem, 100%)`, for the reason `Input` gives.
 */
export function TextArea({ className, ref, 'data-sc': sc, ...rest }: TextAreaProps) {
  return (
    <textarea
      ref={ref}
      data-sc={windowFieldHandle(sc)}
      className={cn('textarea textarea-sm w-full', className)}
      {...rest}
    />
  )
}
