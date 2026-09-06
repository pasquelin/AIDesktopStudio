import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import { QuietNote } from '@/components/QuietNote'
import { SliderField } from '@/components/SliderField'
import { characterViewOf, useCharacterView } from '@/stores/characterView'
import { morphNamesOfNode, useModelFiles } from '@/stores/modelFiles'

export type CharacterInspectorMorphsProps = {
  assetId: string
  documentId: string
  nodeId: string
}

const WEIGHT = { min: 0, max: 1, step: 0.01 }

/** One slider per morph target the file carries. The weights are a preview of the view, not an edit. */
export function CharacterInspectorMorphs({
  assetId,
  documentId,
  nodeId,
}: CharacterInspectorMorphsProps) {
  const { t } = useTranslation()
  const names = useModelFiles(state => morphNamesOfNode(state, documentId, nodeId))
  const weights = useCharacterView(state => characterViewOf(state, assetId).morphs)
  const weigh = useCharacterView(state => state.setCharacterMorph)

  return (
    <PropertySection title={t('character.morphs')} scId="character.morphs">
      {names.length === 0 && <QuietNote>{t('character.morphsEmpty')}</QuietNote>}
      {names.length > 0 && <QuietNote>{t('character.morphsHint')}</QuietNote>}
      {names.map(name => (
        <SliderField
          key={name}
          label={name}
          value={weights[name] ?? 0}
          {...WEIGHT}
          onChange={value => weigh(assetId, name, value)}
          onReset={() => weigh(assetId, name, 0)}
          scId="character.morph"
        />
      ))}
    </PropertySection>
  )
}
