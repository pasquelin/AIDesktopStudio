import { rename } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { roleForAsset, type Asset } from '@shared/domain/asset'
import { isPrivatePath } from '@shared/domain/folder'
import { resourceFolderOf } from '@shared/domain/project'
import { localizedError } from '@shared/localizedError'
import { freeAssetPath } from './assetFile'

export type HideResourceDeps = {
  projectPath: () => string
  find: (assetId: string) => Promise<Asset | null>
  repath: (from: string, to: string) => Promise<void>
}

/**
 * Takes a file INTO the durable internal store — the pair of `createShowResource`, and what a
 * generation a document asked for needs (§6.3, D7 and E-26).
 *
 * MOVED, never copied, for the reason the other direction gives: the project weighs the same
 * afterwards, and the document goes on drawing it because it cites an identity rather than a
 * path. The catalogue row follows the file through `repath`.
 *
 * A file already in the store is answered rather than renamed onto itself — the same shape the
 * showing has, so calling either twice is harmless.
 */
export function createHideResource({ projectPath, find, repath }: HideResourceDeps): {
  hide: (assetId: string) => Promise<Asset>
} {
  return {
    hide: async assetId => {
      const asset = await find(assetId)
      if (!asset?.path) throw localizedError('assetNotCatalogued', { name: assetId })
      if (isPrivatePath(asset.path)) return asset

      const relative = await freeAssetPath(
        projectPath(),
        resourceFolderOf(roleForAsset(asset)),
        asset.name,
        extname(asset.path).toLowerCase(),
      )
      await rename(join(projectPath(), asset.path), join(projectPath(), relative))
      await repath(asset.path, relative)
      return { ...asset, path: relative }
    },
  }
}
