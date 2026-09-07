import type { ExportFormat } from '@shared/domain/scene'
import { captureSceneView } from '@/helpers/captureSceneView'
import { useExportMenu } from '@/hooks/useExportMenu'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { sceneExportFiles } from '../sceneExportFiles'

async function exportScene(documentId: string, format: ExportFormat, scope: 'scene' | 'selection') {
  const bridge = getBridge()
  if (!bridge) return
  try {
    const { folder, files } = await sceneExportFiles(documentId, format, scope)
    const encoded = files[0]
    if (encoded) await bridge.scene.export({ name: folder, format, data: encoded.bytes })
  } catch (error) {
    reportFailure('scene.export', format, error)
  }
}

export function useSceneDocumentExports(active: boolean, documentId: string): void {
  useExportMenu(active, bridge =>
    bridge.menu.onSceneExport(({ format, scope }) => void exportScene(documentId, format, scope)),
  )
  useExportMenu(active, bridge =>
    bridge.menu.onSceneCapture(({ quality }) => void captureSceneView(documentId, quality)),
  )
}
