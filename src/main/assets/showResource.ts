import { rename } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { roleForAsset, type Asset } from '@shared/domain/asset'
import { isPrivatePath } from '@shared/domain/folder'
import type { FolderRole } from '@shared/domain/folderRole'
import { localizedError } from '@shared/localizedError'
import { freeAssetPath } from './assetFile'

export type ShowResourceDeps = {
  projectPath: () => string
  folderFor: (role: FolderRole) => Promise<string>
  find: (assetId: string) => Promise<Asset | null>
  repath: (from: string, to: string) => Promise<void>
}

/**
 * Brings a DURABLE INTERNAL resource out into the project's own tree — §6.7, T7.
 *
 * MOVED, never copied, which is what makes the gesture answerable: the project weighs the same
 * afterwards, and the document that cites the resource goes on drawing it because it cites an
 * identity rather than a path. The catalogue row follows the file through `repath`.
 *
 * The pair of the hiding, and it has to exist: a resource nothing can bring back out is a
 * resource the user has lost, which is the very complaint the hiding would otherwise create.
 */
export function createShowResource({ projectPath, folderFor, find, repath }: ShowResourceDeps): {
  show: (assetId: string) => Promise<Asset>
} {
  return {
    show: async assetId => {
      const asset = await find(assetId)
      if (!asset?.path) throw localizedError('assetNotCatalogued', { name: assetId })
      // Already out in the open: nothing to move, and saying so beats a rename onto itself.
      if (!isPrivatePath(asset.path)) return asset

      const folder = await folderFor(roleForAsset(asset))
      const relative = await freeAssetPath(
        projectPath(),
        folder,
        asset.name,
        extname(asset.path).toLowerCase(),
      )
      await rename(join(projectPath(), asset.path), join(projectPath(), relative))
      await repath(asset.path, relative)
      return { ...asset, path: relative }
    },
  }
}
