import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useTranslation } from 'react-i18next'
import { resetTo } from '@/helpers/resetTo'
import { ColorField } from '@/components/ColorField'
import { NumberField } from '@/components/NumberField'
import { SliderField } from '@/components/SliderField'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { ToggleField } from '@/components/ToggleField'
import { VectorField } from '@/components/VectorField'
import { PictureField } from './PictureField'
import type { GestureProps } from '@/components/styles'
import { isVector3 } from '@shared/domain/scene'
import type { FieldValue, PropertyField } from '@/engines/scene/propertyFields'
export type PropertyControlProps = {
  field: PropertyField
  label: string
  onChange: (value: FieldValue) => void
  gesture: GestureProps
  section: string
  action?: ReactNode
}

type ControlContext = PropertyControlProps & {
  scId: string
  onReset: (() => void) | undefined
  t: ReturnType<typeof useTranslation>['t']
}

function booleanControl({ field, label, onChange, scId, action, onReset }: ControlContext) {
  if (typeof field.value !== 'boolean') return null
  return (
    <ToggleField
      label={label}
      value={field.value}
      onChange={onChange}
      scId={scId}
      actions={action}
      onReset={onReset}
    />
  )
}

function numericControl(context: ControlContext) {
  const { field, label, onChange, scId, action, onReset, gesture } = context
  if (typeof field.value !== 'number') return null
  const spec = field.spec
  if (spec?.control === 'slider')
    return (
      <SliderField
        label={label}
        value={field.value}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        onChange={onChange}
        scId={scId}
        onReset={onReset}
        actions={action}
        {...gesture}
      />
    )
  const { min, max } = spec?.control === 'number' ? spec : {}
  return (
    <NumberField
      label={label}
      value={field.value}
      min={min}
      max={max}
      step={spec?.control === 'number' ? spec.step : undefined}
      onChange={onChange}
      scId={scId}
      onReset={onReset}
      actions={action}
      {...gesture}
    />
  )
}

function vectorControl({ field, label, onChange, scId, gesture }: ControlContext) {
  if (!isVector3(field.value)) return null
  return (
    <VectorField
      label={label}
      value={field.value}
      step={field.spec?.control === 'vector3' ? field.spec.step : undefined}
      onChange={onChange}
      scId={scId}
      defaults={isVector3(field.fallback) ? field.fallback : undefined}
      {...gesture}
    />
  )
}

function stringControl(context: ControlContext) {
  const { field, label, onChange, scId, action, onReset, gesture, t } = context
  const { value, spec } = field
  if (typeof value !== 'string') return null
  if (spec?.control === 'asset')
    return (
      <PictureField
        label={label}
        value={value === '' ? null : value}
        onChange={assetId => onChange(assetId ?? '')}
        scId={scId}
      />
    )
  if (spec?.control === 'choice')
    return (
      <SelectField
        label={label}
        value={value}
        options={spec.options.map(option => ({
          value: option,
          label: t(`${spec.labelPrefix}${option}`, option),
        }))}
        onChange={onChange}
        scId={scId}
        actions={action}
      />
    )
  if (spec?.control === 'color' || value.startsWith('#'))
    return (
      <ColorField
        label={label}
        value={value}
        onChange={onChange}
        scId={scId}
        onReset={onReset}
        actions={action}
        {...gesture}
      />
    )
  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      scId={scId}
      onReset={onReset}
      actions={action}
      {...gesture}
    />
  )
}
export function PropertyControl({
  field,
  label,
  onChange,
  gesture,
  section,
  action,
}: PropertyControlProps) {
  const { t } = useTranslation()
  const { value, fallback } = field
  const scId = `${section}.${field.name}`
  const onReset = resetTo(value, fallback, onChange)
  const context = { field, label, onChange, gesture, section, action, scId, onReset, t }
  if (typeof value === 'boolean') return createElement(booleanControl, context)
  if (typeof value === 'number') return createElement(numericControl, context)
  if (isVector3(value)) return createElement(vectorControl, context)
  return createElement(stringControl, context)
}
