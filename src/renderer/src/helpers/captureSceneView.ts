import type { CaptureQuality } from '@shared/domain/sceneCapture'
import { bytesToBase64 } from '@shared/base64'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'
import { sceneEngineOf, sceneEngineSettled } from '@/stores/sceneEngines'

/**
 * A still of the view, into the project's pictures. Answers whether it landed: the menu row can
 * live with a silence and an outside client cannot.
 */
export async function captureSceneView(
  documentId: string,
  quality: CaptureQuality,
): Promise<boolean> {
  // Waited here rather than at each door: the still is drawn by the ENGINE, which is handed the
  // scene a render after the store holds it — so a lot that added a node and captured drew the
  // scene without it. The menu row, the workshop and the assistant all come through here.
  await sceneEngineSettled(documentId)
  const bridge = getBridge()
  const engine = sceneEngineOf(documentId)
  if (!bridge || !engine) return false

  try {
    const png = await engine.captureStill(quality)
    await bridge.assets.savePicture({
      name: documentExportName(useDocuments.getState(), documentId, 'scene'),
      png: bytesToBase64(png),
    })
    return true
  } catch (error) {
    reportFailure('scene.capture', quality, error)
    return false
  }
}
