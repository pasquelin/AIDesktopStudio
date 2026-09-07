import { byCodeUnit } from '../text'
import { hostedIdFromUrl, hostedUrl, type AssetGeneration, type AssetType } from './asset'

/**
 * A generation worth keeping, kept OUTSIDE any project.
 *
 * That is the whole point of the type: a project's catalogue would tie a recipe to the folder it
 * was made in, and a tag would disappear with it. What one pins is a way of making something —
 * the model, the words, the settings — and it has to survive changing project, which is the
 * moment one most wants it back.
 *
 * The still beside it is a copy on disk, never a URL: the library's own are signed and expire
 * within a fortnight, so a stored one would leave a wall of broken pictures with nothing to say
 * why.
 */
export type FavoriteRecipe = {
  id: string
  /** What the shelf shows. The model's name, since that is what one hunts a look down by. */
  label: string
  /** Which workspace makes this kind again — the recipe knows where it belongs. */
  type: AssetType
  generation: AssetGeneration
  pinnedAt: string
  /** Whether a still was copied beside the recipe. False for a kind that has no picture. */
  hasThumbnail: boolean
}

/**
 * How many recipes the studio keeps. A bound rather than a policy: nothing here evicts, and a
 * pin past this is refused — a favourite that quietly disappeared to make room would be worse
 * than one that was never taken.
 */
export const FAVORITES_MAX = 48

/**
 * How wide a kept still is. Twice a tile of the home's shelf, for a dense display — and shared,
 * because one process cuts the picture and the other draws it: the two are a pair, and neither
 * end could see the other's number.
 */
export const FAVORITE_THUMBNAIL_WIDTH = 264

export const FAVORITE_HOST = 'favorite'

/** Where the renderer loads a pinned recipe's still from. Served from outside every project. */
export function favoriteThumbnailUrl(id: string): string {
  return hostedUrl(FAVORITE_HOST, id)
}

/** `ai-desktop-studio://favorite/<id>` → `<id>`. */
export function favoriteIdFromUrl(url: string): string | null {
  return hostedIdFromUrl(url, FAVORITE_HOST)
}

/**
 * What makes two recipes the same one. The model and everything handed to it — a second pin of
 * an unchanged recipe is the same intention twice, and the shelf should show it once.
 */
export function sameRecipe(one: AssetGeneration, other: AssetGeneration): boolean {
  return (
    one.modelId === other.modelId &&
    one.prompt === other.prompt &&
    // By sorted key: the same settings written in another order are the same settings, and the
    // order is whatever the model's own schema happened to hand back.
    normalized(one.params) === normalized(other.params)
  )
}

function normalized(params: Record<string, unknown>): string {
  return JSON.stringify(Object.entries(params).sort(([one], [other]) => byCodeUnit(one, other)))
}
