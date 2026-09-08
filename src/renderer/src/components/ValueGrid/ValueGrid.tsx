import { cn } from '@/helpers/cn'
import { fieldHandle } from '../scHandle'
import { BUTTON_BASE } from '../styles'

type ValueGridOption = {
  value: number
  /** Already formatted and translated: the grid prints what it is handed and looks nothing up. */
  label: string
}

export type ValueGridProps = {
  options: readonly ValueGridOption[]
  chosen: number
  /** Names the group. Already translated — a grid of bare figures says nothing on its own. */
  label: string
  onChoose: (value: number) => void
  /** The handle a script drives this grid by. Never a translated word — see `pilotable.test.ts`. */
  scId?: string
}

/**
 * A choice among figures, on the track `--sc-value-grid` declares — count and cell width both, so
 * every value menu of the studio is exactly as wide as its neighbour.
 *
 * The chosen cell CARRIES the mark, in `accent-soft`: designated content, never a control one
 * actions. Radios rather than menu items — one value out of several is what a `radiogroup` means.
 */
export function ValueGrid({ options, chosen, label, onChoose, scId }: ValueGridProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      // `text-tiny` here and not on the cells alone: `ch` resolves against the font of the element
      // the track is declared on, so a grid left at the default size sizes its columns for it.
      className="text-tiny grid grid-cols-(--sc-value-grid) gap-0.5"
    >
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === chosen}
          // One handle per FIGURE: a script says which value it wants, not "the third cell".
          data-sc={scId && fieldHandle(`${scId}.${option.value}`)}
          className={cn(
            BUTTON_BASE,
            'text-tiny h-(--sc-control) min-w-0 bg-transparent px-1 text-center tabular-nums',
            'text-muted hover:bg-elevated hover:text-text',
            option.value === chosen && 'bg-accent-soft text-text',
          )}
          onClick={() => onChoose(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
