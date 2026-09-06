import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { NumberField } from '@/components/NumberField'
import { QuietNote } from '@/components/QuietNote'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'

export function RetargetSettings({
  scale,
  setScale,
  rootMotion,
  setRootMotion,
  name,
  setName,
}: RetargetWorkspaceState) {
  const { t } = useTranslation()
  return (
    <PropertySection
      title={t('character.retarget.settings')}
      scId="retarget.settings"
      defaultOpen={false}
    >
      <NumberField
        scId="retarget.scale"
        label={t('character.retarget.scale')}
        value={scale ?? 1}
        min={0.01}
        max={100}
        step={0.01}
        onChange={setScale}
        onReset={() => setScale(undefined)}
      />
      <QuietNote>
        {t(scale === undefined ? 'character.retarget.autoScale' : 'character.retarget.manualScale')}
      </QuietNote>
      <SelectField
        scId="retarget.root"
        label={t('character.retarget.root')}
        value={rootMotion}
        options={[
          { value: 'travel', label: t('character.retarget.travel') },
          { value: 'inPlace', label: t('character.retarget.inPlace') },
        ]}
        onChange={setRootMotion}
      />
      <TextField
        scId="retarget.name"
        label={t('character.retarget.name')}
        value={name}
        onChange={setName}
      />
    </PropertySection>
  )
}
