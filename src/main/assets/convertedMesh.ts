import { rename, rmdir } from 'node:fs/promises'
import { join, posix } from 'node:path'
import type { Asset } from '@shared/domain/asset'
import { extensionOf } from '@shared/domain/fileName'
import { GLB_EXTENSION, isConvertibleType, SOURCES_FOLDER } from '@shared/domain/meshImport'
import type { ConvertMeshRequest } from '@shared/ipcExports'
import { orElse } from '@shared/promises'
import { freeAssetPath } from './assetFile'
import type { LocalBackend } from './localBackend'

export type ConvertedMeshDeps = {
  projectPath: () => string
  find: (assetId: string) => Promise<Asset | null>
  add: (asset: Asset) => Promise<Asset>
  remove: (assetId: string) => Promise<void>
  replaceBytes: LocalBackend['replaceBytes']
  importFromBytes: LocalBackend['importFromBytes']
}

/**
 * Lands the `.glb` a 3D file was converted into, and keeps the file it came from.
 *
 * The original goes under `.sources` beside the new file, named after the row, out of every
 * walk of the project — a dot folder is what `isHiddenEntry` skips. When the content said
 * another role than the folder did, the row is refiled: an animation is a folder holding a
 * clip and a model is a flat file, so the two shapes cannot be told apart by an extension swap.
 */
export async function landConvertedMesh(
  request: ConvertMeshRequest,
  deps: ConvertedMeshDeps,
): Promise<Asset> {
  const existing = await deps.find(request.replaces)
  if (!existing?.path || existing.location !== 'local' || !isConvertibleType(existing.type)) {
    throw new Error(`asset ${request.replaces} is not a 3D file of the project`)
  }
  if (existing.convertedFrom !== undefined) {
    throw new Error(`asset ${request.replaces} was already converted`)
  }

  const root = deps.projectPath()
  const source = existing.path
  let written: Asset
  let kept: string
  if (request.type === existing.type) {
    // The original moves out FIRST: `replaceBytes` removes the file a row stops pointing at.
    kept = await keepOriginal(root, existing, source)
    written = await deps.replaceBytes(existing.id, request.glb, GLB_EXTENSION)
  } else {
    await deps.remove(existing.id)
    written = await deps.importFromBytes(
      {
        id: existing.id,
        name: existing.name,
        type: request.type,
        extension: GLB_EXTENSION,
        ...(existing.jobId ? { jobId: existing.jobId } : {}),
      },
      request.glb,
    )
    kept = await keepOriginal(root, existing, written.path ?? source)
    // An animation's own folder, emptied by the refile — gone only when nothing else is in it.
    await orElse(rmdir(join(root, posix.dirname(source))), undefined)
  }

  return deps.add({
    ...written,
    tags: existing.tags,
    createdAt: existing.createdAt,
    convertedFrom: kept,
    importLosses: request.losses,
  })
}

/** Moves the row's file under `.sources` beside `besidePath`, and answers where it now is. */
async function keepOriginal(root: string, existing: Asset, besidePath: string): Promise<string> {
  const source = existing.path ?? ''
  const folder = posix.join(posix.dirname(besidePath), SOURCES_FOLDER)
  const kept = await freeAssetPath(root, folder, existing.name, extensionOf(source))
  await rename(join(root, source), join(root, kept))
  return kept
}
