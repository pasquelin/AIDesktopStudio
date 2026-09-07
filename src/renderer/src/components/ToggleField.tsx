import type { ReactNode } from 'react'
import { PropertyLine } from './PropertyLine'
import { ResetButton } from './ResetButton'
import { fieldHandle } from './scHandle'
import { CHECKBOX, type FieldHandle, type FieldReset } from './styles'
import { cn } from '@/helpers/cn'

export type ToggleFieldProps = FieldHandle &
  FieldReset & {
    label: string
    value: boolean
    onChange: (value: boolean) => void
    /**
     * Tooltip attributes from the host's own factory, already resolved — as `TextField` takes
     * them. For a switch whose label says WHAT it is and whose effect needs saying.
     */
    hint?: Record<string, string>
    /** Buttons for the row's end column, drawn before the reset — a padlock, say. */
    actions?: ReactNode
  }

/**
 * A property that is on or off. It carries no gesture props: a checkbox changes once per
 * click, so there is no drag to coalesce into a single history entry.
 */
export function ToggleField({
  label,
  value,
  onChange,
  hint,
  scId,
  actions,
  onReset,
}: ToggleFieldProps) {
  return (
    <PropertyLine
      label={label}
      root="label"
      actions={
        <>
          {actions}
          <ResetButton onReset={onReset} />
        </>
      }
    >
      {/* At the START of the control column like every other field, since 2026-08-19: pinned to
          the far end it was the one line of the panel that began nowhere the others did, and it
          held its name to a gauge that read « Projette une … ». */}
      <input
        type="checkbox"
        data-sc={scId && fieldHandle(scId)}
        checked={value}
        onChange={event => onChange(event.target.checked)}
        // `mr-auto` rather than a filler element: the box keeps its size and takes the column.
        className={cn(CHECKBOX, 'mr-auto size-4 shrink-0')}
        {...hint}
      />
    </PropertyLine>
  )
}
