import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import { CharacterMotionList } from '@/features/character/components/Character/Motion/CharacterMotionList'
import type { ModelNode } from '@/engines/scene/sceneState'
import { rigPlaysMotion } from '@/engines/scene/rigState'
import { rigOfNode, useModelFiles } from '@/stores/modelFiles'

export type MotionsSectionProps = {
  documentId: string
  node: ModelNode
}

/**
 * What this model of the scene knows how to play — nothing at all where a motion would drive no
 * joint, `RigSection` above being the door to giving it a skeleton. 🛑 The FILE decides: a rig
 * fitted on the character tab reaches a scene once ⌘S has written it into the container.
 */
export function MotionsSection({ documentId, node }: MotionsSectionProps) {
  const { t } = useTranslation()
  const rig = useModelFiles(state => rigOfNode(state, documentId, node.id))
  if (!rig || !rigPlaysMotion(rig.status)) return null

  return (
    <PropertySection title={t('character.motions')} scId="character.motions">
      <CharacterMotionList assetId={node.model.assetId} documentId={documentId} nodeId={node.id} />
    </PropertySection>
  )
}
