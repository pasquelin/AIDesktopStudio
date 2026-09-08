import { localizedError } from '@shared/localizedError'
import type { TaskWatch } from '@shared/domain/taskProgress'
import type { FolderExportRequest, SkyboxExportCommand } from '@shared/ipc'
import { loadTexture } from '@/engines/scene/textureCache'
import { assetVersionOf } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'
import { skyboxOf, useSkyboxes } from '@/stores/skyboxes'
import type { SkyboxExportPort } from '@/engines/skybox/exportPort'
import { lendable } from '@/helpers/lendable'

/** The GPU pass, which a headless run has not got — lent for the length of a run, like the picture measurer. */
const port = lendable<SkyboxExportPort | null>(null)

export const lendSkyboxExportPort = port.lend

async function skyboxExportPort(): Promise<SkyboxExportPort> {
  const lent = port.current()
  if (lent) return lent
  const { createSkyboxExportPort } = await import('@/engines/skybox/exportPort')
  return createSkyboxExportPort({ loadTexture, assetVersion: assetVersionOf })
}

/**
 * A sky, rendered to its six faces — the half of an export that has nothing to do with where it
 * lands.
 *
 * Split out because there are now two destinations for the same bytes: the folder a person picks
 * from the native menu, and a folder an outside client names inside the project. What differs is
 * one call; what must not differ is any of this.
 */
export async function skyboxExportFiles(
  documentId: string,
  command: SkyboxExportCommand,
  watch?: TaskWatch,
): Promise<FolderExportRequest> {
  // Read once, before any `await`. Read twice — the picture here and the grading after the
  // `import()` — and a slider moved while the chunk downloads would export one sky's pixels
  // under another sky's settings, with nothing in the six files to say so.
  const sky = skyboxOf(useSkyboxes.getState(), documentId)
  if (!sky.source) throw localizedError('skyboxSourceMissing')

  const name = documentExportName(useDocuments.getState(), documentId, 'skybox')

  const target = command.kind === 'faces' ? 'sky.faces' : command.target

  const render = await skyboxExportPort()
  const files = await render(
    { assetId: sky.source.assetId, adjustments: sky.adjustments, name, command },
    watch,
  )

  // The same folder either way, and that is a decision rather than an oversight: the writer takes
  // a folder and only a folder — `pathSegment` refuses an empty one — so a panorama lands in one
  // of its own instead of beside whatever the person picked.
  return { folder: name, target, files }
}
