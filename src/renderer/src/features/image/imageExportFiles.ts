import { localizedError } from '@shared/localizedError'
import { exportTargetOf } from '@shared/domain/exportRegistry'
import type { FolderExportRequest } from '@shared/ipc'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'
import { canvasHost } from './canvasHosts'

/**
 * The stack, flattened to one picture — the half of an export that has nothing to do with where it
 * lands. Composited by the GPU on the way out, the same pass the screen shows, so what is written
 * is what was judged.
 *
 * `flatten`, not `snapshot`: this writer takes BYTES, and the port has had both all along. Going
 * through base64 encoded the whole picture to a string and decoded it back one closure per byte —
 * for a 20 MB PNG, twenty million calls and three copies of it in memory, to reach a field that
 * never wanted a string.
 */
export async function imageExportFiles(documentId: string): Promise<FolderExportRequest> {
  const host = canvasHost(documentId)
  if (!host) throw localizedError('imageExportEngineMissing')

  const bytes = await host.flatten()
  if (!bytes) throw localizedError('imageExportEmptyContent')

  // The tab's own title, so the file is findable afterwards — an opaque id is not.
  const name = documentExportName(useDocuments.getState(), documentId, 'image')
  return {
    folder: name,
    target: 'picture.png',
    files: [
      {
        name,
        extension: exportTargetOf('picture.png').extension,
        bytes,
      },
    ],
  }
}
