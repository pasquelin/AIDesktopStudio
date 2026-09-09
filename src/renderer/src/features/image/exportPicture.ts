import { localizedError } from '@shared/localizedError'
import { exportTargetOf } from '@shared/domain/exportRegistry'
import type { LayerPixels } from '@/engines/canvas/CanvasEngine'
import { bytesToBase64 } from '@shared/base64'
import { getBridge } from '@/services/bridge'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'

/** The engine seen from an export: the flatten, plus every layer's pixels for the layered way. */
export type ExportHost = {
  snapshot: () => Promise<string | null>
  pixelSnapshots: () => Promise<readonly LayerPixels[]>
  flatten: () => Promise<Uint8Array<ArrayBuffer> | null>
}

/**
 * The document flattened by the GPU, wherever the user points. `null` for a dismissed dialog.
 */
export async function exportPicture(documentId: string, host: ExportHost): Promise<string | null> {
  const bridge = getBridge()
  if (!bridge) return null

  // THROWS rather than answering `null`, and the difference is a message: `null` here means the
  // user dismissed the dialog, and an engine whose context is not up yet would look exactly the
  // same. The caller reports a rejection; it reports nothing at all for a dismissal.
  const image = await host.snapshot()
  if (!image) throw localizedError('imageExportEmpty')

  // The tab's own title, so the file is findable afterwards. A word rather than the id when there
  // is no title left to clean: an id is no more findable than a word, and shorter to read.
  const name = documentExportName(useDocuments.getState(), documentId, 'image')
  return bridge.dialog.exportPicture(`${name}${exportTargetOf('picture.png').extension}`, image)
}

/**
 * The same document with its layers intact, as a `.psd`, through `exportPicture`'s own door.
 */
export async function exportLayeredPicture(
  documentId: string,
  host: ExportHost,
): Promise<string | null> {
  const bridge = getBridge()
  if (!bridge) return null

  const merged = await host.flatten()
  // The same refusal the save makes, and for the same reason: a stack read while the engine is
  // booting its GPU context is empty, and an empty PSD is a file that opens on nothing.
  if (!merged) throw localizedError('imageExportEmpty')

  const { psdBytesOf } = await import('./psdDocument')
  const { oraStackOf, oraSurfacesOf } = await import('@/engines/canvas/oraDocument')

  const surfaces = oraSurfacesOf(await host.pixelSnapshots(), merged)
  const bytes = await psdBytesOf({
    stack: oraStackOf(canvasOf(useCanvases.getState(), documentId), surfaces),
    surfaces,
  })

  const name = documentExportName(useDocuments.getState(), documentId, 'image')
  return bridge.dialog.exportPicture(
    `${name}${exportTargetOf('picture.psd').extension}`,
    bytesToBase64(bytes),
  )
}
