import type { ReactNode } from 'react'
import { cn } from '@/helpers/cn'

export type FieldGridProps = {
  children: ReactNode
  className?: string
}

/**
 * Fields laid across as many columns as the surface affords, and never narrower than
 * `--sc-field-min` — the width below which a name column and its control stop being readable
 * side by side.
 *
 * What it exists for is the DOCUMENT, not the dock: a property line gives its control everything
 * the row has left, which is right in a 300px panel and absurd across a 2000px window, where
 * « Échelle » offered seventeen hundred pixels to write `-1`. One column at 300px, seven at 2000,
 * with no breakpoint written anywhere.
 */
export function FieldGrid({ children, className }: FieldGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[repeat(auto-fill,minmax(min(var(--sc-field-min),100%),1fr))]',
        'gap-x-4 gap-y-2',
        className,
      )}
    >
      {children}
    </div>
  )
}
