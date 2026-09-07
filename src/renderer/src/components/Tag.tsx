import type { ReactNode } from 'react'

export type TagProps = {
  children: ReactNode
}

/**
 * A read-only label in a dock. Not `Chip`: that one is a pressed exclusive button, and a tag
 * folded into it would be tabbable and announce a choice nobody can pick.
 */
export function Tag({ children }: TagProps) {
  return (
    <span className="bg-surface text-muted text-tiny rounded-(--radius-sc-sm) px-2 py-1">
      {children}
    </span>
  )
}
