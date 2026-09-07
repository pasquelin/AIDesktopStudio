import { useTranslation } from 'react-i18next'
import type { MaterialSettings } from '@shared/domain/material'
import { MATERIAL_BOUNDS } from '@shared/domain/material'
import { PropertySection } from '@/components/PropertySection'
import { SliderField } from '@/components/SliderField'
import type { GestureProps } from '@/components/styles'
import { ToggleField } from '@/components/ToggleField'

type ReliefKey = 'normalScale' | 'invertNormalGreen' | 'heightScale'

type MaterialInspectorReliefSectionProps = GestureProps & {
  material: MaterialSettings
  onChange: <K extends ReliefKey>(key: K, value: MaterialSettings[K]) => void
  onReset: (key: 'normalScale' | 'heightScale') => (() => void) | undefined
}

export function MaterialInspectorReliefSection({
  material,
  onChange,
  onReset,
  ...gesture
}: MaterialInspectorReliefSectionProps) {
  const { t } = useTranslation()
  return (
    <PropertySection title={t('material.relief')} scId="material.relief">
      <SliderField
        label={t('material.normalScale')}
        scId="material.normalScale"
        value={material.normalScale}
        {...MATERIAL_BOUNDS.normalScale}
        onChange={value => onChange('normalScale', value)}
        onReset={onReset('normalScale')}
        {...gesture}
      />
      <ToggleField
        label={t('material.invertNormalGreen')}
        scId="material.invertNormalGreen"
        value={material.invertNormalGreen}
        onChange={value => onChange('invertNormalGreen', value)}
      />
      <SliderField
        label={t('material.heightScale')}
        scId="material.heightScale"
        value={material.heightScale}
        {...MATERIAL_BOUNDS.heightScale}
        onChange={value => onChange('heightScale', value)}
        onReset={onReset('heightScale')}
        {...gesture}
      />
    </PropertySection>
  )
}
