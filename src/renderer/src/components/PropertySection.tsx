import type { ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { useSectionFold } from '@/hooks/useSectionFold'
import { PropertySectionHead } from './PropertySectionHead'
import { FIELD_HELP, PROPERTY_BODY } from './styles'

export type PropertySectionProps = {
  title: string
  children: ReactNode
  /**
   * Buttons the SECTION owns, at the end of its heading. Beside the fold, never inside it: a
   * button within a button is not markup a browser keeps.
   */
  actions?: ReactNode
  /**
   * Already translated, one line: what this group of properties DOES, for a reader who has never
   * seen the format. Drawn under the heading and only while unfolded — a sentence about rows
   * nobody can see is noise.
   */
  description?: string
  /**
   * A section standing on its own plate rather than stacked under the one above it.
   *
   * What a DOCUMENT needs and a dock panel does not: an inspector's sections are a single run of
   * properties divided by rules, whereas a file opened in the centre is a page of separate
   * blocks, and a fold with no ground of its own read as part of the block above it.
   */
  plate?: boolean
  /** Sections a node rarely needs open on sight can start folded. */
  defaultOpen?: boolean
  /** The handle the MCP folds this section by. Never a translated word. */
  scId?: string
}

/** One group of properties under a heading that folds. What is open is session state. */
export function PropertySection({
  title,
  children,
  actions,
  description,
  plate,
  defaultOpen = true,
  scId,
}: PropertySectionProps) {
  const { open, toggle } = useSectionFold(defaultOpen)

  return (
    <section
      className={cn(
        'border-border',
        plate ? 'bg-panel rounded-(--radius-sc-md) border' : 'border-b last:border-b-0',
      )}
    >
      <PropertySectionHead
        title={title}
        open={open}
        toggle={toggle}
        actions={actions}
        plate={plate}
        scId={scId}
      />

      {open && description && <p className={cn(FIELD_HELP, 'm-0 px-2 pb-1')}>{description}</p>}

      {/* Unmounted rather than hidden: a folded section keeps no field mounted, and a scene with
          six sections folded costs nothing to render. */}
      {open && <div className={PROPERTY_BODY}>{children}</div>}
    </section>
  )
}
