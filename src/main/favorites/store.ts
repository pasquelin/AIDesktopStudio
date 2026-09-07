import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { AssetGeneration, AssetType } from '@shared/domain/asset'
import { FAVORITES_MAX, sameRecipe, type FavoriteRecipe } from '@shared/domain/favorite'
import { isMissing } from '@main/persistence'
import { writeAtomic, writeQueue } from '@main/persistence'
import { parseFavoriteIndex } from './validation'

/** What a pin carries beyond the recipe itself: the still to keep, when there was one to copy. */
export type FavoriteDraft = {
  id: string
  label: string
  type: AssetType
  generation: AssetGeneration
  pinnedAt: string
  thumbnail: Uint8Array | null
}

export type FavoritesStore = {
  list: () => Promise<FavoriteRecipe[]>
  /** Answers the whole list, as the account channels do: one write, one truth back. */
  pin: (draft: FavoriteDraft) => Promise<FavoriteRecipe[]>
  unpin: (id: string) => Promise<FavoriteRecipe[]>
  /** The file behind `ai-desktop-studio://favorite/<id>`, or null for an id that is not one of ours. */
  thumbnailPath: (id: string) => string | null
}

const INDEX = 'favorites.json'
const THUMBNAIL_EXTENSION = '.png'

/**
 * The pinned recipes, in a folder of their own beside the settings — see `domain/favorite.ts`
 * for why they live outside every project.
 *
 * Written the way `jobStore` writes its notes, and for the same reason: through a staging copy
 * renamed into place, refusing to rewrite from an index that could not be read, and one write at
 * a time. What is at stake is what a favourite exists to promise — that it is still there.
 */
export function createFavorites(folder: string): FavoritesStore {
  const indexPath = join(folder, INDEX)
  const fileOf = (id: string): string => join(folder, `${id}${THUMBNAIL_EXTENSION}`)

  const queue = writeQueue()

  // What the last read or write settled on. The folder has one writer, so the copy cannot go
  // stale — and the protocol asks for a thumbnail path once per tile drawn, which used to parse
  // the whole index each time.
  let held: FavoriteRecipe[] | null = null

  /** The index, or `null` when the file is there and could not be read — not the same answer. */
  const read = async (): Promise<FavoriteRecipe[] | null> => {
    if (held) return held

    let content: string
    try {
      content = await readFile(indexPath, 'utf8')
    } catch (error) {
      // Nothing pinned yet. Anything else stops the write rather than rebuilding from a guess.
      if (!isMissing(error)) return null
      held = []
      return held
    }

    // Unparseable is not unreadable: the content is beyond recovery whatever we do, so writing
    // over it is the only way out. A single bad line is dropped, not the shelf with it.
    held = parseFavoriteIndex(content)
    return held
  }

  const write = async (recipes: readonly FavoriteRecipe[]): Promise<FavoriteRecipe[]> => {
    await mkdir(folder, { recursive: true })
    await writeAtomic(indexPath, JSON.stringify(recipes, null, 2))

    held = [...recipes]
    return [...recipes]
  }

  /** Runs one change against the index, after whichever change is already in flight. */
  const change = (
    body: (recipes: FavoriteRecipe[]) => Promise<FavoriteRecipe[]>,
  ): Promise<FavoriteRecipe[]> => {
    const run = async (): Promise<FavoriteRecipe[]> => {
      const recipes = await read()
      // Refusing beats rewriting from a list we could not read: the shelf would come back short
      // of everything the failed read did not see, and nothing would say so.
      if (recipes === null) throw new Error('favourites could not be read')
      return body(recipes)
    }

    return queue.next(run)
  }

  return {
    list: async () => (await read()) ?? [],

    pin: draft =>
      change(async recipes => {
        // Pinning the same recipe again is the same intention twice. It moves back to the front
        // rather than being refused: the gesture has to do something visible.
        const existing = recipes.find(recipe => sameRecipe(recipe.generation, draft.generation))
        if (existing) {
          return write([existing, ...recipes.filter(recipe => recipe.id !== existing.id)])
        }

        // Refused rather than evicting the oldest: a favourite that vanished to make room would
        // be a shelf that loses things on its own. The inspector disables its button at the
        // bound, so nobody reaches this without having been told.
        if (recipes.length >= FAVORITES_MAX) return recipes

        if (draft.thumbnail) {
          await mkdir(folder, { recursive: true })
          await writeFile(fileOf(draft.id), draft.thumbnail)
        }

        try {
          return await write([
            {
              id: draft.id,
              label: draft.label,
              type: draft.type,
              generation: draft.generation,
              pinnedAt: draft.pinnedAt,
              hasThumbnail: draft.thumbnail !== null,
            },
            ...recipes,
          ])
        } catch (error) {
          // The index is what `unpin` reads to know which stills to remove, so a picture whose
          // line never landed is one nothing can ever collect.
          try {
            await rm(fileOf(draft.id), { force: true })
          } catch {
            // The write that failed is what the caller has to hear about, not this tidy-up.
          }

          throw error
        }
      }),

    unpin: id =>
      change(async recipes => {
        const kept = recipes.filter(recipe => recipe.id !== id)
        if (kept.length === recipes.length) return recipes

        // The line first, the still after: an orphaned picture is invisible, while a recipe left
        // pointing at a file that is gone is a broken tile for good — the shelf reads
        // `hasThumbnail` and never checks again.
        const written = await write(kept)
        try {
          await rm(fileOf(id), { force: true })
        } catch {
          // An orphaned picture is invisible, per the note above; the line is already gone.
        }

        return written
      }),

    /**
     * Answered without reading the index: the window only builds this URL for a recipe whose
     * `hasThumbnail` it already holds, and a file that is not there is a 404 either way.
     *
     * Contained all the same, exactly as `assetFilePath` contains a catalogue path. The id here
     * comes off a URL and `new URL` does not decode `%2F`, so `ai-desktop-studio://favorite/..%2F..%2Fx`
     * reaches this as a real `../../x` — and the scheme is one the CSP lets the window fetch.
     */
    thumbnailPath: id => {
      const root = resolve(folder)
      const file = resolve(root, `${id}${THUMBNAIL_EXTENSION}`)
      return file.startsWith(root + sep) ? file : null
    },
  }
}
