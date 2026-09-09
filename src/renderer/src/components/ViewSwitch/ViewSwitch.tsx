import type { KeyboardEvent } from 'react'
import { cn } from '@/helpers/cn'
import { HINT_BOTTOM } from '@/helpers/tooltip'
import { fieldHandle } from '../scHandle'

export type ViewSwitchOption<Id extends string> = {
  id: Id
  /** Already translated — the word on the segment. */
  label: string
  /** Already translated. What showing this view gives, never a repeat of the label (WCAG 2.5.3). */
  hint: string
}

export type ViewSwitchProps<Id extends string> = {
  /** Already translated. What the whole run of segments chooses between. */
  label: string
  options: readonly ViewSwitchOption<Id>[]
  value: Id
  onChange: (id: Id) => void
  /**
   * What the tabs are named by, so the panel under them can point back: each segment takes
   * `${baseId}${option.id}`. The host owns it — the panel and its tab must agree.
   */
  baseId: string
  /** The panel these segments show, as an `id`. */
  panelId: string
  scId?: string
}

/**
 * Several views of ONE thing, one of them shown — the same document read as a form, as a text,
 * as a picture.
 *
 * A trough with the segments touching inside it, and NOT a row of separated pills: the tab strip
 * above the centre is separated pills lit in `elevated`, so a chip row under it read as a second
 * strip of documents. What tells the two apart is the box, which no tab strip draws.
 *
 * A real `tablist`, therefore: `Chip` carries `aria-pressed` and says in its own contract that it
 * is not one, and three readings of a single file are tabs by every definition a reader has.
 */
export function ViewSwitch<Id extends string>({
  label,
  options,
  value,
  onChange,
  baseId,
  panelId,
  scId,
}: ViewSwitchProps<Id>) {
  // The arrows walk the run and the tab key leaves it, which is what a `tablist` promises; with
  // none of this, Tab stepped through three buttons before reaching the form they show.
  const walk = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const at = options.findIndex(option => option.id === value)
    const to =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : step === 0
            ? -1
            : (at + step + options.length) % options.length
    const picked = options[to]
    if (!picked) return
    event.preventDefault()
    onChange(picked.id)
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={walk}
      className="bg-panel border-border inline-flex shrink-0 gap-0.5 rounded-(--radius-sc-md) border p-0.5"
    >
      {options.map(option => {
        const shown = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            id={`${baseId}${option.id}`}
            aria-selected={shown}
            aria-controls={panelId}
            tabIndex={shown ? 0 : -1}
            data-sc={scId && fieldHandle(`${scId}.${option.id}`)}
            {...HINT_BOTTOM(option.hint)}
            onClick={() => onChange(option.id)}
            className={cn(
              'h-(--sc-control) cursor-pointer rounded-(--radius-sc-sm) border-none px-3 text-xs',
              // The accent, because a shown view is a control that is ON — the reading
              // `rule-interface` gives an active tool. `elevated` is what the tabs above already
              // wear, and the whole point of this control is not to be mistaken for one.
              shown
                ? 'bg-accent text-accent-content hover:bg-accent'
                : 'text-muted hover:text-text bg-transparent',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
