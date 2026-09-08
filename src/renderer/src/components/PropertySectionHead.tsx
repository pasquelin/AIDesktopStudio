import { mdiChevronDown, mdiChevronRight } from '@mdi/js'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/helpers/cn'
import { HINT_LEFT } from '@/helpers/tooltip'
import { FieldActions } from './FieldActions'
import { sectionHandle } from './scHandle'
import { UiIcon } from './UiIcon'

export type PropertySectionHeadProps = {
  title: string
  open: boolean
  toggle: () => void
  /** Beside the fold, never inside it: a button within a button is not markup a browser keeps. */
  actions?: ReactNode
  /**
   * On a plate the section IS its own edge, so the end column's bleed — which exists to land a
   * glyph on the column the fields end on, inside a panel that has no edge — hangs the bin one
   * pixel from that border. The gutter is given back, and the bleed with it.
   */
  plate?: boolean
  scId?: string
}

/**
 * The line a titled group of properties folds by.
 *
 * 🛑 The fold sits INSIDE a heading, which is how a reader jumps between sections rather than
 * tabbing through every control. The eight surfaces that merged into `PropertySection` drew an
 * `<h3>` before they folded, and would have lost that navigation silently.
 */
export function PropertySectionHead({
  title,
  open,
  toggle,
  actions,
  plate,
  scId,
}: PropertySectionHeadProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex items-center',
        plate && 'pe-[calc(var(--sc-gutter)+var(--sc-row-action-bleed))]',
      )}
    >
      <h3 className="m-0 min-w-0 flex-1 font-normal text-inherit">
        <button
          type="button"
          aria-expanded={open}
          data-sc={scId && sectionHandle(scId)}
          {...HINT_LEFT(t(open ? 'inspector.sectionFoldHint' : 'inspector.sectionUnfoldHint'))}
          onClick={toggle}
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
  )
}
