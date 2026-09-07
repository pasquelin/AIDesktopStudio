import { mdiVideoVintage } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import {
  activeAudioId,
  activeCharacterAssetId,
  activeSceneId,
  activeSequenceId,
  useDocuments,
} from '@/stores/documents'
import { AnimationPanel } from '../../../animation/components/Animation/AnimationPanel'
import { workshopIdOf } from '@shared/domain/character'
import { MontagePanel } from '../MontagePanel'
import { SoundPanel } from '../Sound/SoundPanel'

/**
 * The montage of whatever sequence is in front. A tool window has no props — it sits on the
 * edge, outside Dockview — so it follows the active tab rather than being handed one, and asks
 * for the sequence kind: another document would give `useSequences` a montage of its own.
 */
export function TimelinePanel() {
  const { t } = useTranslation()
  const documentId = useDocuments(activeSequenceId)
  const sceneId = useDocuments(activeSceneId)
  const audioId = useDocuments(activeAudioId)
  const characterAssetId = useDocuments(activeCharacterAssetId)

  // A scene reads its time along the same band, and it is a different timeline entirely: tracks
  // that add up rather than clips that take turns.
  if (sceneId) return <AnimationPanel documentId={sceneId} />
  // A character reads the SAME band, on the workshop its tab lays the model on: a motion is
  // posed exactly as a scene animates a node.
  if (characterAssetId) return <AnimationPanel documentId={workshopIdOf(characterAssetId)} />
  // A take reads its time along the same band as a sequence — and it IS the same band: sound laid
  // beside sound is what makes Audio a place music is built rather than one take trimmed.
  if (audioId) return <SoundPanel documentId={audioId} />
  if (!documentId) return <EmptyState icon={mdiVideoVintage} message={t('timeline.noDocument')} />

  return <MontagePanel documentId={documentId} />
}
