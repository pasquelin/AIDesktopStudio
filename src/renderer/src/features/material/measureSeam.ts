import { localizedError } from '@shared/localizedError'
import { assetUrl } from '@shared/domain/asset'
import { loadTexture } from '@/engines/scene/textureCache'
import { createSeamPort, type SeamPort } from '@/engines/material/derive/seamPort'
import { reportFailure } from '@/services/diagnostics'
import { materialOf, useMaterials } from '@/stores/materials'
import { useMaterialViews } from '@/stores/materialViews'

/** The GPU port, built once. It holds nothing: a context is made and released per measurement. */
const gpuSeam = createSeamPort({ loadTexture })

/**
 * How visible the wrap edge of this material is, measured and remembered for the session.
 *
 * The base colour and nothing else: it is the channel a seam is seen in, and the eight are laid
 * out together — a normal map whose edges disagree disagrees at the same places. Measuring all
 * eight would open eight contexts to answer the same question.
 *
 * Answers whether it ran. Failures are reported rather than thrown: the caller is a button.
 */
export async function measureMaterialSeam(
  documentId: string,
  measure: SeamPort = gpuSeam,
): Promise<boolean> {
  const source = materialOf(useMaterials.getState(), documentId).channels.baseColor
  if (!source) {
    reportFailure('material.seam', 'baseColor', localizedError('baseColorEmpty'))
    return false
  }

  try {
    const ratio = await measure(assetUrl(source.assetId))
    // The asset it was read off travels with it: replace the base colour and the words on screen
    // would otherwise describe pixels the document no longer points at.
    useMaterialViews.getState().setSeam(documentId, { assetId: source.assetId, ratio })
    return true
  } catch (error) {
    reportFailure('material.seam', 'baseColor', error)
    return false
  }
}
