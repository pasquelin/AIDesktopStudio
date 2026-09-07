import { useTranslation } from 'react-i18next'
import { SliderField } from '@/components/SliderField'

export function WorldToolsMaskRange({
  minScId,
  maxScId,
  value,
  min,
  max,
  step,
  onChange,
  onReset,
}: {
  minScId: string
  maxScId: string
  value: { min: number; max: number }
  min: number
  max: number
  step: number
  onChange: (next: { min: number; max: number }) => void
  onReset: (edge: 'min' | 'max') => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <SliderField
        label={t('world.maskMin')}
        scId={minScId}
        value={value.min}
        min={min}
        max={max}
        step={step}
        onChange={next => onChange({ min: next, max: value.max })}
        onReset={() => onReset('min')}
      />
      <SliderField
        label={t('world.maskMax')}
        scId={maxScId}
        value={value.max}
        min={min}
        max={max}
        step={step}
        onChange={next => onChange({ min: value.min, max: next })}
        onReset={() => onReset('max')}
      />
    </>
  )
}
