import { mdiTerrain } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { activeSceneId, useDocuments } from '@/stores/documents'
import { WorldList } from './WorldList'
import { WorldTools } from './WorldTools'

/**
 * The terrains of whatever scene is in front. A panel has no props — it sits on the edge,
 * outside Dockview — so it follows the active tab rather than being handed one.
 */
export function WorldPanel() {
  const { t } = useTranslation()
  const documentId = useDocuments(activeSceneId)

  if (!documentId) return <EmptyState icon={mdiTerrain} message={t('world.noDocument')} />
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorldList documentId={documentId} />
      <WorldTools documentId={documentId} />
    </div>
  )
}
