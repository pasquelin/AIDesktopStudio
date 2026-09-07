import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import { QuietNote } from '@/components/QuietNote'
import { VirtualFieldList } from '@/components/VirtualFieldList'
import { morphNamesOfNode, useModelFiles } from '@/stores/modelFiles'
import { CharacterInspectorMorphRow } from './CharacterInspectorMorphRow'

export type CharacterInspectorMorphsProps = {
  assetId: string
  documentId: string
  nodeId: string
}

/** One slider per morph target the file carries. The weights are a preview of the view, not an edit. */
export function CharacterInspectorMorphs({
  assetId,
  documentId,
  nodeId,
}: CharacterInspectorMorphsProps) {
  const { t } = useTranslation()
  // 🛑 The weights are NOT read here: each row subscribes to its own, or a drag re-rendered the
  // whole section — see `CharacterInspectorMorphRow`.
  const names = useModelFiles(state => morphNamesOfNode(state, documentId, nodeId))

  return (
    <PropertySection title={t('character.morphs')} scId="character.morphs">
      {names.length === 0 ? (
        <QuietNote>{t('character.morphsEmpty')}</QuietNote>
      ) : (
        <>
          <QuietNote>{t('character.morphsHint')}</QuietNote>
          <VirtualFieldList
            key={`${documentId}:${nodeId}`}
            items={names}
            keyOf={name => name}
            label={t('character.morphs')}
            renderItem={name => <CharacterInspectorMorphRow assetId={assetId} name={name} />}
          />
        </>
      )}
    </PropertySection>
  )
}
