import { exportTargetOf, SCENE_TARGET_OF_FORMAT } from '@shared/domain/exportRegistry'
import type { ExportFormat } from '@shared/domain/scene'
import type { FolderExportRequest } from '@shared/ipc'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'

/**
 * A scene, encoded to one file — the half of an export that has nothing to do with where it lands.
 *
 * The engine is fetched from `sceneEngineOf` rather than passed in, which is what lets an outside
 * client ask for this at all: only the viewport holds the live renderer, and a tab whose viewport
 * is not mounted has none.
 *
 * A folder for a single file, like every other door onto this writer. It costs one level of
 * nesting and buys one channel instead of two, the second of which would exist only to say
 * "actually just one file".
 */
export async function sceneExportFiles(
  documentId: string,
  format: ExportFormat,
  scope: 'scene' | 'selection',
): Promise<FolderExportRequest> {
  const engine = sceneEngineOf(documentId)
  if (!engine) throw new Error('this scene has no viewport mounted to export from')

  // Refused where BOTH doors pass, and not at the menu row alone: the menu greys the row, but the
  // assistant asks for this scope straight out — and an empty one wrote a glTF holding no node.
  if (scope === 'selection' && sceneOf(useScenes.getState(), documentId).selectedIds.length === 0)
    throw new Error('this scene has nothing selected to export')

  const name = documentExportName(useDocuments.getState(), documentId, 'scene')
  return {
    folder: name,
    target: SCENE_TARGET_OF_FORMAT[format],
    files: [
      {
        name,
        extension: exportTargetOf(SCENE_TARGET_OF_FORMAT[format]).extension,
        bytes: await engine.exportTo(format, scope),
      },
    ],
  }
}
