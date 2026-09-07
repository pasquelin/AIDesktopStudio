import { mdiLayersOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { activeImageId, useDocuments } from '@/stores/documents'
import { LayerList } from '../Layer/List/LayerList'

/**
 * The layer stack of whatever image is in front. A panel has no props — it sits on the edge,
 * outside Dockview — so it follows the active tab rather than being handed one, and asks for
 * the image kind: a scene handed to `useCanvases` would grow a phantom stack of its own.
 *
 * It renders no header of its own: the chassis draws the title bar, and a second copy shows up
 * as a doubled one. The scrolling belongs to `Collection`, which has to own it to virtualize.
 */
export function LayersPanel() {
  const { t } = useTranslation()
  const documentId = useDocuments(activeImageId)

  if (!documentId) return <EmptyState icon={mdiLayersOutline} message={t('layers.noDocument')} />
  return <LayerList documentId={documentId} />
}
