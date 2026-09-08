import { useState } from 'react'
import { Input } from './Input'
import { fieldHandle } from './scHandle'
import { isComposing } from '@/helpers/composition'

export type NameFieldProps = {
  /** Accessible name and, when nothing is typed yet, what the field is for. */
  label: string
  placeholder: string
  /** Whether what is typed may be submitted. Enter does nothing while it answers false. */
  accepts: (name: string) => boolean
  onSubmit: (name: string) => void
  onCancel: () => void
  /** The handle the MCP steers this field by. Never a translated word. */
  scId?: string
}

/**
 * A name typed once, on the spot, in place of the control that asked for it. Leaving ABANDONS —
 * nothing here is a value being edited. `isComposing` is asked because a Japanese or Chinese
 * keyboard sends Enter to close its candidate list, and acting on that one would name a branch
 * after a half-composed word. It takes no `disabled` on purpose: a browser blurs what it
 * disables, the blur abandons, and a passing git command used to take the name away mid-word.
 */
export function NameField({
  label,
  placeholder,
  accepts,
  onSubmit,
  onCancel,
  scId,
}: NameFieldProps) {
  const [name, setName] = useState('')

  return (
    <Input
      // Focused on sight: the field replaced the control that was just clicked, and asking for a
      // second click to type into what one asked for reads as the gesture having failed.
      autoFocus
      type="text"
      data-sc={scId && fieldHandle(scId)}
      value={name}
      aria-label={label}
      placeholder={placeholder}
      className="flex-1"
      onChange={event => setName(event.target.value)}
      onKeyDown={event => {
        if (isComposing(event)) return

        if (event.key === 'Enter' && accepts(name)) onSubmit(name)
        if (event.key === 'Escape') onCancel()
      }}
      onBlur={onCancel}
    />
  )
}
