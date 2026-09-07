import { mdiChevronDown } from '@mdi/js'
import { useId, type ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { FormField } from './FormField'
import { PropertyLine } from './PropertyLine'
import { fieldHandle } from './scHandle'
import { CONTROL, FIELD, NATIVE_SELECT } from './styles'
import { UiIcon } from './UiIcon'
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

type SelectControlProps<V extends string> = SelectFieldProps<V> & {
  id: string
  unnamed: boolean
  named: boolean
}

function selectOptions<V extends string>({ options }: Pick<SelectFieldProps<V>, 'options'>) {
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

const selectedValue = (value: string | null, unnamed: boolean): string =>
  unnamed ? UNNAMED : (value ?? UNNAMED)

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
  const skin =
    layout === 'bar'
      ? cn(CONTROL, 'w-full cursor-pointer appearance-none border-none pr-6 pl-2')
      : layout === 'stacked'
        ? cn(FIELD, 'appearance-none pr-6')
        : NATIVE_SELECT
  return (
    <select
      id={id}
      aria-label={named ? undefined : label}
      data-sc={scId && fieldHandle(scId)}
      value={selectedValue(value, unnamed)}
      onChange={event => {
        const picked = options.find(option => option.value === event.target.value)
        if (picked) onChange(picked.value)
      }}
      {...hint}
      className={cn(skin, 'min-w-0 flex-1', layout === 'bar' && !value && 'text-muted')}
    >
      {unnamed && (
        <option value={UNNAMED} disabled>
          {unnamedLabel}
        </option>
      )}
      {selectOptions({ options })}
    </select>
  )
}

type SelectLayoutProps = Pick<
  SelectFieldProps<string>,
  'label' | 'layout' | 'leading' | 'actions' | 'className'
> & { id: string; children: ReactNode; compactActions?: boolean }

function stackedSelectLayout({
  label,
  className,
  id,
  leading,
  children,
  actions,
}: SelectLayoutProps) {
  return (
    <FormField label={label} htmlFor={id} className={className}>
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        {children}
        {actions}
      </div>
    </FormField>
  )
}

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
  if (layout === 'stacked')
    return stackedSelectLayout({ label, className, id, leading, children, actions })
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
        {leading}
        {children}
        {actions}
      </PropertyLine>
    )
  return (
    <div className={cn('relative flex min-w-0 items-center', className)}>
      {leading}
      {children}
      <UiIcon
        path={mdiChevronDown}
        size={12}
        className="text-muted pointer-events-none absolute right-2"
      />
      {actions}
    </div>
  )
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
    leading,
    actions,
    scId,
    className,
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
