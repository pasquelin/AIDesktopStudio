import type { ReactNode, RefObject } from 'react'
import { cn } from '@/helpers/cn'

export type GhostTextProps = {
  /** What the hand has written, painted invisible so the tail starts where the caret is. */
  typed: string
  /**
   * What is painted ahead of the caret. Empty while nothing completes.
   *
   * 🛑 Composed by the HOST: what the grey words mean — the rest of a sentence, or a whole one
   * offered in its place — and which key writes them belong to the field that offers them. A
   * mirror that knew would be one caller's composer wearing the name of a shared primitive.
   */
  tail: ReactNode
  /** The host field's own type and gutters. */
  metrics: string
  /** 🛑 Required: a mirror the host cannot scroll draws its tail against the wrong line. */
  ref: RefObject<HTMLDivElement | null>
  className?: string
}

/** 🛑 The tail never enters the field's value: put there it is what the form submits. */
export function GhostText({ typed, tail, metrics, ref, className }: GhostTextProps) {
  return (
    <div
      ref={ref}
      // The field beneath already carries these words; a mirror read on top says them twice.
      aria-hidden
      className={cn(
        metrics,
        'pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap',
        className,
      )}
    >
      <span className="invisible">{typed}</span>
      {tail}
    </div>
  )
}
