import type { ReactNode } from 'react'

export type ToastStackProps = { children: ReactNode }

/**
 * Where the studio's notices hang: above the docks, out of the way of the status line, which is
 * where the count lives.
 *
 * It lets the pointer through and each toast takes it back, so the empty room under a single
 * notice — most of a column eighty wide — does not swallow clicks meant for the document.
 */
export function ToastStack({ children }: ToastStackProps) {
  return (
    <div
      className="pointer-events-none fixed end-3 bottom-9 z-50 flex w-80 flex-col gap-1.5"
      role="status"
      aria-live="polite"
    >
      {children}
    </div>
  )
}
