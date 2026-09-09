import { useId, type ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { FormField } from './FormField'
import { PropertyLine } from './PropertyLine'
import { fieldHandle } from './scHandle'
import { Select } from './Select'
export type SelectOption<V extends string> = {
  value: V
  label: string
  disabled?: boolean
  group?: string
}
export type SelectFieldProps<V extends string> = {
  label: string
  value: V | null
  options: readonly SelectOption<V>[]
  onChange: (value: V) => void
  unnamedLabel?: string
  layout?: 'row' | 'stacked' | 'inline' | 'bar'
  hint?: Record<string, string>
  leading?: ReactNode
  actions?: ReactNode
  compactActions?: boolean
  scId?: string
  className?: string
}
const UNNAMED = ''
type OptionRun<V extends string> = {
  group?: string
  run: SelectOption<V>[]
}
function runsOf<V extends string>(options: readonly SelectOption<V>[]): OptionRun<V>[] {
  if (options.every(one => one.group === undefined)) return [{ run: [...options] }]
  const runs: OptionRun<V>[] = []
  for (const option of options) {
    const last = runs[runs.length - 1]
    if (last && last.group === option.group) last.run.push(option)
    else runs.push({ group: option.group, run: [option] })
  }
  return runs
}

type SelectControlProps<V extends string> = Pick<
  SelectFieldProps<V>,
  'label' | 'value' | 'options' | 'onChange' | 'unnamedLabel' | 'layout' | 'hint' | 'scId'
> & { id: string; unnamed: boolean; named: boolean }

function selectOptions<V extends string>(options: readonly SelectOption<V>[]) {
  return runsOf(options).map(({ group, run }, index) => {
    const entries = run.map(option => (
      <option key={option.value} value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    ))
    return group === undefined ? (
      entries
    ) : (
      <optgroup key={`${index}:${group}`} label={group}>
        {entries}
      </optgroup>
    )
  })
}

function selectControl<V extends string>({
  id,
  label,
  value,
  options,
  onChange,
  unnamedLabel,
  layout = 'row',
  hint,
  scId,
  unnamed,
  named,
}: SelectControlProps<V>) {
  return (
    <Select
      id={id}
      aria-label={named ? undefined : label}
      data-sc={scId && fieldHandle(scId)}
      value={unnamed ? UNNAMED : (value ?? UNNAMED)}
      onChange={event => {
        const picked = options.find(option => option.value === event.target.value)
        if (picked) onChange(picked.value)
      }}
      {...hint}
      // The skin is `Select`'s, text size included: daisyUI writes `font-size` on the control
      // itself, so a step set on the box here would be overwritten rather than inherited. What
      // is left is the room the layout gives it, and the ink a bar reads while nothing is chosen.
      className={cn('flex min-w-0 flex-1', layout === 'bar' && !value && 'text-muted')}
    >
      {unnamed && (
        <option value={UNNAMED} disabled>
          {unnamedLabel}
        </option>
      )}
      {selectOptions(options)}
    </Select>
  )
}

type SelectLayoutProps = Pick<
  SelectFieldProps<string>,
  'label' | 'layout' | 'leading' | 'actions' | 'compactActions' | 'className'
> & { id: string; children: ReactNode }

function selectLayout({
  label,
  layout = 'row',
  leading,
  actions,
  compactActions,
  className,
  id,
  children,
}: SelectLayoutProps) {
  const inner = (
    <>
      {leading}
      {children}
      {actions}
    </>
  )
  if (layout === 'stacked')
    return (
      <FormField label={label} htmlFor={id} className={className}>
        <div className="flex min-w-0 items-center gap-2">{inner}</div>
      </FormField>
    )
  if (layout === 'row')
    return (
      <PropertyLine
        label={label}
        root="div"
        htmlFor={id}
        nameProps={{ as: 'label' }}
        actions={actions}
        compactActions={compactActions}
        className={className}
      >
        {leading}
        {children}
      </PropertyLine>
    )
  if (layout === 'inline')
    return (
      <PropertyLine label={label} root="div" name="none" actions={false} className={className}>
        {inner}
      </PropertyLine>
    )
  return <div className={cn('flex min-w-0 items-center', className)}>{inner}</div>
}
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  unnamedLabel,
  layout = 'row',
  hint,
  leading,
  actions,
  compactActions,
  scId,
  className,
}: SelectFieldProps<V>) {
  const id = useId()
  const unnamed =
    unnamedLabel !== undefined && (value === null || !options.some(one => one.value === value))
  const named = layout === 'row' || layout === 'stacked'
  const children = selectControl({
    label,
    value,
    options,
    onChange,
    unnamedLabel,
    layout,
    hint,
    scId,
    id,
    unnamed,
    named,
  })
  return selectLayout({
    label,
    layout,
    leading,
    actions,
    compactActions,
    className,
    id,
    children,
  })
}
