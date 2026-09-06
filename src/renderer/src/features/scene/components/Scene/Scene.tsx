import { mdiFileTreeOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { activeCharacterAssetId, activeSceneId, useDocuments } from '@/stores/documents'
import { workshopIdOf } from '@shared/domain/character'
import { SceneTree } from './SceneTree'

/**
 * The outliner of the scene in front. Its own tool rather than a face of the Explorer: the
 * Explorer lists the documents of the project, which is a different question asked everywhere
 * workspaces — and the panel that answered both answered neither outside 3D.
 */
export function Scene() {
  const { t } = useTranslation()
  const documentId = useDocuments(activeSceneId)
  const characterAssetId = useDocuments(activeCharacterAssetId)
  const shownId = documentId ?? (characterAssetId ? workshopIdOf(characterAssetId) : null)

  if (!shownId) return <EmptyState icon={mdiFileTreeOutline} message={t('scene.noDocument')} />
  return <SceneTree documentId={shownId} modelContents={characterAssetId !== null} />
}
