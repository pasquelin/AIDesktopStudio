import type { ReactNode } from 'react'
import { Input } from './Input'
import { PropertyLine } from './PropertyLine'
import { ResetButton } from './ResetButton'
import { fieldHandle } from './scHandle'
import type { GestureProps, FieldHandle, FieldReset } from './styles'

export type TextFieldProps = GestureProps &
  FieldHandle &
  FieldReset & {
    label: string
    value: string
    onChange: (value: string) => void
    /**
     * Tooltip attributes from the host's own factory, already resolved — `HINT_LEFT` in the
     * inspector. For a field whose label says WHAT it is and whose contents need saying HOW: a CEL
     * expression naming its wires is the case that asked for it.
     */
    hint?: Record<string, string>
    /** Buttons for the row's end column, drawn before the reset — a padlock, say. */
    actions?: ReactNode
  }

/**
 * A line of text in a property row — a node's name, or any descriptor value no table describes.
 * A field the inspector cannot type is still one the user must see and edit.
 */
export function TextField({
  label,
  value,
  onChange,
  hint,
  scId,
  onReset,
  actions,
  onGestureStart,
  onGestureEnd,
}: TextFieldProps) {
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
      <Input
        type="text"
        data-sc={scId && fieldHandle(scId)}
        value={value}
        onChange={event => onChange(event.target.value)}
        // One entry per session at the field, not one per keystroke.
        onFocus={() => onGestureStart?.()}
        onBlur={() => onGestureEnd?.()}
        className="min-w-0 flex-1"
        {...hint}
      />
    </PropertyLine>
  )
}
