import { useTranslation } from 'react-i18next'
import type { ActionField } from '@shared/domain/assistantAction'
import type { JsonValue } from '@shared/domain/component'
import { NumberField } from '@/components/NumberField'
import { ResetButton } from '@/components/ResetButton'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { ToggleField } from '@/components/ToggleField'
import type { GestureProps } from '@/components/styles'
import { ScriptField } from './ScriptField'

export type ComponentFieldProps = {
  /** What the row SHOWS. Handed over rather than read off a component: a script's settings live
   * in a bag beside the declared fields, and the row is the same either way. */
  value: JsonValue | undefined
  /** Already translated — a script's own setting is named by its author, and nothing translates
   * a word somebody wrote in their file. */
  label: string
  field: ActionField
  onChange: (value: JsonValue) => void
  gesture: GestureProps
  scId: string
  /** The nodes a `picks: 'node'` field may be pointed at, already named. Empty elsewhere. */
  named?: readonly string[]
  /**
   * What the registry declares for this field. 🛑 Shown when the document carries NOTHING: a
   * component written before a field existed read as 0 while the engine ran on the real default.
   */
  fallback?: JsonValue
  /** Puts the field back to what the registry declares. Absent while it already stands there. */
  onReset?: () => void
}

/**
 * One field of one component, drawn from the descriptor that declares it.
 *
 * **Controlled from the document, not from a form library.** `DynamicForm` renders the same
 * `ActionField` list, and it was the first idea — but it owns its values in react-hook-form and
 * merges them back on reset, so a ⌘Z would leave the panel showing what was just undone. The
 * inspector's own controls read the state on every render, which is what makes undo instant.
 *
 * A `kind` nothing here draws falls back to raw text rather than vanishing — the same rule the
 * generation forms follow, and for the same reason.
 */
export function ComponentField({
  value: held,
  label,
  field,
  onChange,
  gesture,
  scId,
  named = [],
  fallback,
  onReset,
}: ComponentFieldProps) {
  const { t } = useTranslation()
  const booleanField = () => (
    <ToggleField
      label={label}
      value={held === true}
      scId={scId}
      onReset={onReset}
      onChange={value => onChange(value)}
    />
  )
  const selectField = () => (
    <SelectField
      label={label}
      value={typeof held === 'string' && held !== '' ? held : null}
      options={optionsOf(field, named, held).map(one => ({
        value: one,
        label: field.kind === 'choice' ? t(`game.values.${one}`, one) : one,
      }))}
      onChange={value => onChange(value)}
      // A value no option carries reads as the FIRST one otherwise, so the panel would show
      // `X` while the document held something else — and the next edit would save that reading.
      unnamedLabel={t('game.values.unknown')}
      scId={scId}
      // 🛑 Through `actions` and not a prop of its own: every other select of the app would else
      // grow an inert reset button it never had.
      actions={<ResetButton onReset={onReset} />}
    />
  )
  const numberField = () => (
    <NumberField
      label={label}
      value={numberShown(held, fallback)}
      min={field.min}
      max={field.max}
      step={field.kind === 'integer' ? 1 : undefined}
      scId={scId}
      onReset={onReset}
      onChange={value => onChange(value)}
      {...gesture}
    />
  )
  const textField = () => (
    <TextField
      label={label}
      value={typeof held === 'string' ? held : ''}
      scId={scId}
      onReset={onReset}
      onChange={value => onChange(value)}
    />
  )
  if (field.kind === 'boolean') return booleanField()
  // The row a texture and a typeface are picked by, so a file is chosen the same way everywhere.
  if (field.picks === 'script')
    return (
      <ScriptField
        label={label}
        value={typeof held === 'string' ? held : ''}
        onChange={value => onChange(value)}
        scId={scId}
      />
    )
  if (field.kind === 'choice' || field.picks === 'node') return selectField()
  if (field.kind === 'number' || field.kind === 'integer') return numberField()
  return textField()
}

/**
 * What the row offers. 🛑 The held value is kept in the list when nothing else names it — an arm
 * pointed OUTSIDE its module is the author's, and a select that dropped it could not type it back.
 */
function optionsOf(
  field: ActionField,
  named: readonly string[],
  held: JsonValue | undefined,
): string[] {
  if (field.kind === 'choice')
    return (field.options ?? []).flatMap(option => (typeof option === 'string' ? [option] : []))

  // Deduplicated, and never the empty name: two nodes may share one, and `''` is the row a
  // `SelectField` keeps for a value nothing names.
  const names = [...new Set(named.filter(one => one !== ''))]
  if (typeof held === 'string' && held !== '' && !names.includes(held)) names.push(held)
  return names
}

/** A number the document does not carry reads as what the registry declares, never as zero. */
function numberShown(held: JsonValue | undefined, fallback: JsonValue | undefined): number {
  if (typeof held === 'number') return held
  return typeof fallback === 'number' ? fallback : 0
}
