import type { TaskWatch } from '@shared/domain/taskProgress'
import { MATERIAL_TARGET_OF } from '@shared/domain/exportRegistry'
import type { MaterialExportTarget } from '@shared/domain/materialExport'
import type { FolderExportRequest } from '@shared/ipc'
import { loadTexture } from '@/engines/scene/textureCache'
import { exportChannelsOf } from '@/engines/material/export/channels'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'
import { materialOf, useMaterials } from '@/stores/materials'
import type { MaterialExportPort } from '@/engines/material/export/exportPort'
import { lendable } from '@/helpers/lendable'

/** The GPU pass, which a headless run has not got — lent for the length of a run, see its sky twin. */
const port = lendable<MaterialExportPort | null>(null)

export const lendMaterialExportPort = port.lend

async function materialExportPort(): Promise<MaterialExportPort> {
  const lent = port.current()
  if (lent) return lent
  const { createMaterialExportPort } = await import('@/engines/material/export/exportPort')
  return createMaterialExportPort({ loadTexture })
}

/**
 * A material, baked to the files one target asks for — the half of an export that has nothing to
 * do with where it lands.
 *
 * Split out for the reason its skybox twin was: two destinations, one rendering. The port is
 * reached through `import()` for the chunk after the first screen — statically imported,
 * `GLTFExporter` would be downloaded by anyone who opens a material tab.
 */
export async function materialExportFiles(
  documentId: string,
  target: MaterialExportTarget,
  watch?: TaskWatch,
): Promise<FolderExportRequest> {
  const state = materialOf(useMaterials.getState(), documentId)
  const name = documentExportName(useDocuments.getState(), documentId, 'material')

  const bake = await materialExportPort()
  const files = await bake(
    {
      target,
      channels: exportChannelsOf(state),
      name,
      material: state.material,
      shape: state.preview.shape,
    },
    watch,
  )

  // A material with no channels resolves to no file, and a destination asked for nothing is a
  // question nobody can answer — whoever asked it.
  if (files.length === 0) throw new Error('this material has no channel to export')

  return { folder: name, target: MATERIAL_TARGET_OF[target], files }
}
