import { FIELD } from '@/components/styles'
import { UiIcon } from '@/components/UiIcon'
import { cn } from '@/helpers/cn'
import { HINT_BOTTOM } from '@/helpers/tooltip'

/**
 * The row these tiles are laid in — ONE line that scrolls, whatever the family holds. Here rather
 * than at each caller because it is the tile's own geometry seen from outside: the cell fixes the
 * width, and two rows written apart would drift.
 */
export const TEMPLATE_STRIP = 'm-0 flex list-none gap-1.5 overflow-x-auto p-0 pb-1'

export type NewDocumentTemplateTileProps = {
  /** The `data-sc` handle and the key alike — what a script picks this row by. */
  id: string
  caption: string
  hint: string
  icon: string
  /** What the glyph is inked in — the hue its section wears, handed over already resolved. */
  ink: string
  selected: boolean
  onPick: () => void
}

/**
 * One template to choose from, whatever kind is being named.
 *
 * The FIELD's skin, which is the one thing on this form that already draws a box one fills in —
 * the same ground, the same border, the same corner as the name above it. Three of its classes are
 * written over, and `cn` keeps the last of two that conflict: the height, a field being one line
 * where this squares itself off; the padding, which has to hold on all four sides; and the ground,
 * `accent-soft` saying CHOSEN the way every exclusive row of this studio does.
 *
 * No picture: a still would need the frame and the black band under the word that hold a
 * photograph, and eleven of those in a form read as eleven little windows.
 */
export function NewDocumentTemplateTile({
  id,
  caption,
  hint,
  icon,
  ink,
  selected,
  onPick,
}: NewDocumentTemplateTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-sc={`field:document.template.${id}`}
      {...HINT_BOTTOM(hint)}
      onClick={onPick}
      className={cn(
        FIELD,
        'flex aspect-square h-auto w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 p-2',
        selected ? 'bg-accent-soft' : 'hover:bg-elevated',
      )}
    >
      <UiIcon path={icon} size={32} className={cn('shrink-0', ink)} />
      <span className="text-tiny w-full truncate text-center">{caption}</span>
    </button>
  )
}
