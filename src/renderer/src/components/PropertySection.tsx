import { mdiChevronDown, mdiChevronRight } from '@mdi/js'
import { useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { useSectionFolds } from '@/stores/sectionFolds'
import { SectionFoldScope } from './SectionFoldScope'
import { FieldActions } from './FieldActions'
import { FIELD_HELP, PROPERTY_BODY } from './styles'
import { UiIcon } from './UiIcon'
import { HINT_LEFT } from '@/helpers/tooltip'
import { useTranslation } from 'react-i18next'
import { sectionHandle } from './scHandle'

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
  const { t } = useTranslation()
  const id = useId()
  // Whether the panel-wide order reaches this section at all — see `SectionFoldScope`.
  const ordered = useContext(SectionFoldScope)
  const stamp = useSectionFolds(state => state.stamp)
  const wanted = useSectionFolds(state => state.wanted)
  const [held, setHeld] = useState({ stamp, open: defaultOpen })

  // Adjusted during the render rather than in an effect, the way `useCatalogueAssets` takes a new
  // question: an effect would fold the section one frame after the press, visibly.
  if (ordered && held.stamp !== stamp) setHeld({ stamp, open: wanted })

  const open = held.open
  // What the title button reads to know whether it has anything left to fold. The subscription is
  // dropped when the face changes, so sections that went away stop answering for it.
  useEffect(
    () => (ordered ? useSectionFolds.getState().noteSection(id, open) : undefined),
    [ordered, id, open],
  )

  return (
    <section
      className={cn(
        'border-border',
        plate ? 'bg-panel rounded-(--radius-sc-md) border' : 'border-b last:border-b-0',
      )}
    >
      {/* The fold sits INSIDE a heading, which is how a reader jumps between sections rather than
          tabbing through every control. The eight surfaces that merged into this component drew
          an `<h3>` before they folded, and would have lost that navigation silently. */}
      <div className="flex items-center">
        <h3 className="m-0 min-w-0 flex-1 font-normal text-inherit">
          <button
            type="button"
            aria-expanded={open}
            data-sc={scId && sectionHandle(scId)}
            {...HINT_LEFT(t(open ? 'inspector.sectionFoldHint' : 'inspector.sectionUnfoldHint'))}
            onClick={() => setHeld(current => ({ ...current, open: !current.open }))}
            className={cn(
              'text-text flex h-(--sc-control) w-full cursor-pointer items-center gap-2',
              'text-tiny border-none bg-transparent px-2 text-start font-medium tracking-wide uppercase',
            )}
          >
            <UiIcon path={open ? mdiChevronDown : mdiChevronRight} size={14} />
            {title}
          </button>
        </h3>
        {/* Only while unfolded: a button acting on rows nobody can see is a press with no reading.
            `FieldActions` rather than a box of its own — the end column of a property line and the
            end of its heading answer to one gauge. */}
        {open && actions && <FieldActions>{actions}</FieldActions>}
      </div>

      {open && description && <p className={cn(FIELD_HELP, 'm-0 px-2 pb-1')}>{description}</p>}

      {/* Unmounted rather than hidden: a folded section keeps no field mounted, and a scene with
          six sections folded costs nothing to render. */}
      {open && <div className={PROPERTY_BODY}>{children}</div>}
    </section>
  )
}
