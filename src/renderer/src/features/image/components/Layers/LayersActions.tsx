import { activeImageId, useDocuments } from '@/stores/documents'
import { LayerStackActions } from '../Layer/LayerStackActions'

/**
 * Add and delete, drawn on the panel's own title bar. Like the panel itself, it follows the
 * active tab; the stack is split off so its hooks never run without one.
 */
export function LayersActions() {
  const documentId = useDocuments(activeImageId)

  if (!documentId) return null
  return <LayerStackActions documentId={documentId} />
}
