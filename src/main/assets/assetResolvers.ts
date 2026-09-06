import type { Asset } from '@shared/domain/asset'
import { ASSET_HOST, MASTER_HOST, POSTER_HOST, THUMB_HOST } from '@shared/domain/asset'
import { FILE_HOST } from '@shared/domain/assetAccess'
import { ANIMATION_HOST } from '@shared/domain/animationLibrary'
import { CHARACTER_HOST } from '@shared/domain/bundledCharacter'
import { TEMPLATE_HOST } from '@shared/domain/sceneTemplate'
import { FAVORITE_HOST } from '@shared/domain/favorite'
import { MODEL_HOST } from '@shared/domain/localModel'
import { TEXTURE_HOST } from '@shared/domain/checkerTexture'
import { orWhenGone } from '@main/project/store'
import {
  conversionNeighbourPath,
  exportFileOf,
  posterFileOf,
  servedFileOf,
  type AssetResolvers,
} from './protocol'

/** What the hosts read, each behind the narrowest port that answers for it. */
export type AssetResolverDeps = {
  /** The open project's folder, or nothing — every path a host serves is relative to it. */
  projectPath: () => string | null
  /** Rejects rather than answering while a project is being left; that is absorbed here. */
  findAsset: (assetId: string) => Promise<Asset | null>
  favouriteThumbnail: (favoriteId: string) => string | null
  thumbnailOf: (relative: string) => Promise<string | null>
  /** A folder shipped beside the app, which is why no project takes part in answering. */
  bundledAnimation: (id: string) => Promise<string | null>
  /** The same, for the still drawn of a scene template — named by its FILE, not by an id. */
  bundledTemplate: (file: string) => Promise<string | null>
  /** And for the picture of a local model, which is the same folder shape one level over. */
  bundledModel: (file: string) => Promise<string | null>
  /** And for a working texture, which a probe wears without any project having a row for it. */
  bundledTexture: (file: string) => Promise<string | null>
  /** And for the shipped character, which the welcome window wears before a project exists. */
  bundledCharacter: (file: string) => Promise<string | null>
}

/**
 * One resolver per host of the asset scheme, apart from the wiring so that the contract
 * `servedPath` now relies on — a rejection is a defect — is held by something other than reading.
 */
export function createAssetResolvers(deps: AssetResolverDeps): AssetResolvers {
  const fileOf = async (
    assetId: string,
    pick: (projectPath: string, asset: Asset) => string | null,
  ): Promise<string | null> => {
    const root = deps.projectPath()
    if (!root) return null

    // `projectPath()` was read a tick before the catalogue replies, and a project can be left in
    // between: the refusal that follows is the same fact, answered « no row » rather than thrown.
    const asset = await orWhenGone(() => deps.findAsset(assetId), null)
    return asset ? pick(root, asset) : null
  }

  return {
    [ASSET_HOST]: assetId => fileOf(assetId, servedFileOf),
    [MASTER_HOST]: assetId => fileOf(assetId, exportFileOf),
    [POSTER_HOST]: assetId => fileOf(assetId, posterFileOf),
    [FAVORITE_HOST]: favoriteId => Promise.resolve(deps.favouriteThumbnail(favoriteId)),
    // Named by a PATH rather than by an id, alone among the four: the explorer draws files, and
    // most of what it draws the catalogue has never heard of. `assetFilePath` refuses whatever
    // walks out of the project, exactly as it does for a row.
    [THUMB_HOST]: relative => deps.thumbnailOf(relative),
    // The asset id is the capability: only its own canonical `.sources` tree can be read.
    [FILE_HOST]: async requested => {
      const root = deps.projectPath()
      if (!root) return null
      const [assetId, ...parts] = requested.split('/')
      if (!assetId || parts.length === 0) return null
      const asset = await orWhenGone(() => deps.findAsset(assetId), null)
      return asset ? await conversionNeighbourPath(root, asset, parts.join('/')) : null
    },
    // A folder's name alone means its clip, a name going deeper means that very file: the
    // document holds the animation's NAME, and nothing in it says which file is inside.
    [ANIMATION_HOST]: id => deps.bundledAnimation(id),
    // Absent until someone has drawn it: the window then draws the template's glyph instead,
    // which is what makes shipping a picture per template optional rather than required.
    [TEMPLATE_HOST]: file => deps.bundledTemplate(file),
    [MODEL_HOST]: file => deps.bundledModel(file),
    [TEXTURE_HOST]: file => deps.bundledTexture(file),
    [CHARACTER_HOST]: file => deps.bundledCharacter(file),
  }
}
