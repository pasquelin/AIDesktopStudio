import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import { saveWorkshopMotion } from '@/character/characterMotion'
import { characterOf, useCharacters } from '@/stores/character'
import { CharacterMotionList } from '../Motion/CharacterMotionList'

export type CharacterInspectorMotionsProps = {
  assetId: string
  /** The workshop scene this tab drives, which is where a motion is tried out. */
  documentId: string
  nodeId: string
}

/**
 * What this character knows how to play — nothing at all until it has a skeleton, the section
 * above being where one is created.
 */
export function CharacterInspectorMotions({
  assetId,
  documentId,
  nodeId,
}: CharacterInspectorMotionsProps) {
  const { t } = useTranslation()
  const rig = useCharacters(state => characterOf(state, assetId).rig)
  if (!rig) return null

  return (
    <PropertySection title={t('character.motions')} scId="character.motions">
      <CharacterMotionList
        assetId={assetId}
        documentId={documentId}
        nodeId={nodeId}
        onSave={asNew => saveWorkshopMotion(assetId, asNew)}
      />
    </PropertySection>
  )
}
