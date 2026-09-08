import { mdiMagnify } from '@mdi/js'
import { Input } from './Input'
import { cn } from '@/helpers/cn'
import { fieldHandle } from './scHandle'
import { UiIcon } from './UiIcon'

export type SearchFieldProps = {
  /** Names the field AND stands in it, already translated. */
  label: string
  value: string
  onChange: (value: string) => void
  /** The name a script drives the field by. Required: an unnamed one is invisible to every pilot. */
  scId: string
  /** What the host sizes the field with. Replaces the default width, it does not add to it. */
  className?: string
  /** Attributes of the studio tooltip, when the host has something to explain — as every field. */
  hint?: Record<string, string>
}

/**
 * The one search box of a dock. The glyph is what says « search » once the placeholder is typed
 * over, and the padding keeping the text off it belongs here rather than at each host.
 */
export function SearchField({ label, value, onChange, scId, className, hint }: SearchFieldProps) {
  return (
    <label className={cn('relative flex items-center', className ?? 'w-full')}>
      <UiIcon
        path={mdiMagnify}
        size={14}
        className="text-muted pointer-events-none absolute start-2"
      />
      <Input
        type="search"
        value={value}
        placeholder={label}
        aria-label={label}
        onChange={event => onChange(event.target.value)}
        // The left inset is the magnifier's room; the rest of the skin is the field's own.
        className="ps-7 pe-2"
        data-sc={fieldHandle(scId)}
        {...hint}
      />
    </label>
  )
}
