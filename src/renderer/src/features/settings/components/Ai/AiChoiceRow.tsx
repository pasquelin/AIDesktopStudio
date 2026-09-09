import type { ReactNode } from 'react'
import type { AiRoleId } from '@shared/domain/aiRole'
import { Radio } from '@/components/Radio'
import { fieldHandle } from '@/components/scHandle'
import { WINDOW_CAPTION, WINDOW_HELP, WINDOW_ROW } from '@/components/windowStyles'
import { cn } from '@/helpers/cn'

export type AiChoiceRowProps = {
  /** The radio group: one provider serves a role, so picking one drops the last. */
  role: AiRoleId
  /** Which choice this is, within the role — a model id, or `none`, or `scenario`. */
  choice: string
  label: string
  /** The figures beside the name — a size, a verdict. */
  caption?: string
  /** Said under them when the caption alone would leave a dimmed row unexplained. */
  hint?: string
  checked: boolean
  disabled?: boolean
  onChoose: () => void
  /** Drawn between the radio and the name, for a choice that HAS a picture. */
  picture?: ReactNode
  /** What the row offers on its right: install, cancel, remove, load. */
  children?: ReactNode
}

/** One thing a role can be served by. Dimmed by the radio's own `disabled`, never by a second read. */
export function AiChoiceRow({
  role,
  choice,
  label,
  caption,
  hint,
  checked,
  disabled,
  onChoose,
  picture,
  children,
}: AiChoiceRowProps) {
  return (
    <li className={cn(WINDOW_ROW, 'items-center')}>
      <label className="flex flex-1 items-start gap-2 has-[:disabled]:opacity-60">
        <Radio
          name={`ai-role-${role}`}
          data-sc={fieldHandle(`ai.${role}.${choice}`)}
          className="mt-0.5"
          checked={checked}
          disabled={disabled}
          onChange={onChoose}
        />
        {picture}
        <span className="flex flex-col">
          <span>{label}</span>
          {caption && <span className={WINDOW_CAPTION}>{caption}</span>}
          {hint && <span className={WINDOW_HELP}>{hint}</span>}
        </span>
      </label>

      {children}
    </li>
  )
}
