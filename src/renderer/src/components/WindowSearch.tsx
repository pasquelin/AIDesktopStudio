import { WindowInput } from './WindowInput'

export type WindowSearchProps = {
  /** Names the field AND stands in it. Already translated, as every design component takes its words. */
  label: string
  value: string
  onChange: (value: string) => void
}

/**
 * The field that filters the column of a window that is NOT a dock. Pinned by its caller ABOVE
 * what scrolls: inside the list it narrowed as the scrollbar took the width, and scrolled away
 * with the sections it filters. Not `…Field` — `pilotable.test.ts` asks those for a `data-sc`.
 */
export function WindowSearch({ label, value, onChange }: WindowSearchProps) {
  return (
    <WindowInput
      data-sc="field:window.search"
      type="search"
      controlSize="xs"
      className="w-full shrink-0"
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  )
}
