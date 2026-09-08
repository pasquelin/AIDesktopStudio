import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import { QuietNote } from '@/components/QuietNote'
import { rigPlaysMotion } from '@/engines/scene/rigState'
import { characterOf, useCharacters } from '@/stores/character'
import { rigOfNode, useModelFiles } from '@/stores/modelFiles'
import { CharacterMotionList } from './CharacterMotionList'

export type CharacterMotionSectionProps = {
  assetId: string
  /** The scene this model stands in — the workshop for the character tab, the scene for a node. */
  documentId: string
  nodeId: string
  /** Files what the band plays. Absent where nothing can export it. */
  onSave?: (asNew: boolean) => Promise<void>
}

/**
 * What this model knows how to play, and the one gate on offering it a motion.
 *
 * 🛑 The FILE decides, on the workshop as in a scene: the stored `Rig` reads `null` on a fault the
 * engine tolerates, and gating on it took the section away from a character whose own skeleton
 * plays perfectly well. What is already LINKED stays listed whatever the answer — it is written
 * in the `.glb`, and this list holds the only way to unlink it.
 */
export function CharacterMotionSection({
  assetId,
  documentId,
  nodeId,
  onSave,
}: CharacterMotionSectionProps) {
  const { t } = useTranslation()
  const rig = useModelFiles(state => rigOfNode(state, documentId, nodeId))
  const motions = useCharacters(state => characterOf(state, assetId).motions)
  // Nothing has landed: a section describing a model the studio has not read would be wrong
  // rather than empty, which is what `RigSection` answers beside it.
  if (!rig) return null

  const plays = rigPlaysMotion(rig)
  if (!plays && motions.length === 0) return null

  return (
    <PropertySection title={t('character.motions')} scId="character.motions">
      {!plays && <QuietNote>{t('character.motionNeedsSkeleton')}</QuietNote>}
      <CharacterMotionList
        assetId={assetId}
        documentId={documentId}
        nodeId={nodeId}
        playable={plays}
        onSave={onSave}
      />
    </PropertySection>
  )
}
