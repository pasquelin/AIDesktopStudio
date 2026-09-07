import { workshopIdOf } from '@shared/domain/character'
import {
  activeAudioId,
  activeCharacterAssetId,
  activeSceneId,
  activeSequenceId,
  useDocuments,
} from '@/stores/documents'
import { AnimationActions } from '../../../animation/components/Animation/Actions/AnimationActions'
import { ProgramTransport } from '../ProgramTransport'
import { SequenceActions } from '../SequenceActions'
import { SoundActions } from '../Sound/SoundActions'

/**
 * What the timeline panel puts on its own title bar — the montage tools for a sequence, the
 * transport and the settings for a scene's animation.
 *
 * Split off from the panel so its hooks never run without a document, as the layer panel does.
 */
export function TimelineActions() {
  const sceneId = useDocuments(activeSceneId)
  const characterAssetId = useDocuments(activeCharacterAssetId)
  const audioId = useDocuments(activeAudioId)
  const documentId = useDocuments(activeSequenceId)

  if (sceneId) return <AnimationActions documentId={sceneId} />
  // The model tab's band is its workshop's; no camera can stand in it, so nothing films it.
  if (characterAssetId)
    return <AnimationActions documentId={workshopIdOf(characterAssetId)} filmable={false} />
  // The sound montage carries its own transport: the Audio workspace has no monitor to hold one.
  if (audioId) return <SoundActions documentId={audioId} />
  if (!documentId) return null

  // The three bands open on the same row — back to the start, play, the time. Video's player is
  // the programme monitor's, so this one only asks it; the two others carry their own.
  return (
    <SequenceActions documentId={documentId} lead={<ProgramTransport documentId={documentId} />} />
  )
}
