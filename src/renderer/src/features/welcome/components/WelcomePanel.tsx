import type { ReactNode } from 'react'
import { cn } from '@/helpers/cn'

/**
 * A frosted sheet over the viewport. Its ground is a surface token at an alpha — a scrim owes no
 * ratio; what is written on it is measured against `base-100`.
 */
export function WelcomePanel({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={cn(
        'bg-base-100/85 border-base-300/70 w-full rounded-(--radius-sc-lg) border px-8 py-6 shadow-(--sc-shadow-floating) backdrop-blur-md',
        // Two columns of models need the room — all of it the stage leaves, which is what caps
        // this. A question with three chips under it does not, and read that wide it would be a
        // band rather than a sheet.
        wide ? 'max-w-4xl' : 'max-w-md',
      )}
    >
      {children}
    </div>
  )
}
