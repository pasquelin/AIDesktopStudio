import type { ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { UiIcon } from './UiIcon'

export type TagProps = {
  children: ReactNode
  /**
   * `@mdi/js` path, drawn before the words. Decorative on purpose: a tag is read, never pressed,
   * and what the glyph stands for is said in full by the sentence its list stands under.
   */
  icon?: string
  /**
   * The ink its words take — a TOKEN class from `helpers/workspaces`, never a colour written at
   * a call site. Absent, the tag is muted like every other label of a dock.
   *
   * 🛑 It never says the thing ALONE: `rule-interface` refuses a category told by colour only,
   * so whoever inks a tag gives it a glyph too.
   */
  ink?: string
}

/**
 * A read-only label in a dock. Not `Chip`: that one is a pressed exclusive button, and a tag
 * folded into it would be tabbable and announce a choice nobody can pick.
 */
export function Tag({ children, icon, ink }: TagProps) {
  return (
    <span
      className={cn(
        'bg-surface text-tiny inline-flex items-center gap-1 rounded-(--radius-sc-sm) px-2 py-1',
        ink ?? 'text-muted',
      )}
    >
      {icon !== undefined && <UiIcon path={icon} size={12} />}
      {children}
    </span>
  )
}
