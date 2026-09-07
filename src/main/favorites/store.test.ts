import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AssetGeneration } from '@shared/domain/asset'
import { FAVORITES_MAX } from '@shared/domain/favorite'
import { createFavorites, type FavoriteDraft, type FavoritesStore } from './store'

const GENERATION: AssetGeneration = {
  modelId: 'flux_2',
  modelLabel: 'FLUX.2',
  prompt: 'a mossy boulder',
  params: { prompt: 'a mossy boulder', width: 1024 },
}

function draft(overrides: Partial<FavoriteDraft> = {}): FavoriteDraft {
  return {
    id: 'favorite_1',
    label: 'FLUX.2',
    type: 'image',
    generation: GENERATION,
    pinnedAt: '2026-08-09T10:00:00.000Z',
    thumbnail: new Uint8Array([1, 2, 3]),
    ...overrides,
  }
}

let folder: string
let favorites: FavoritesStore

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'favorites-'))
  favorites = createFavorites(folder)
})

describe('the favourites folder', () => {
  it('answers an empty shelf before anything has been pinned', async () => {
    await expect(favorites.list()).resolves.toEqual([])
  })

  it('keeps a recipe and the still beside it', async () => {
    const [recipe] = await favorites.pin(draft())

    expect(recipe).toMatchObject({ id: 'favorite_1', label: 'FLUX.2', hasThumbnail: true })
    expect(recipe?.generation).toEqual(GENERATION)
    await expect(readFile(join(folder, 'favorite_1.png'))).resolves.toEqual(Buffer.from([1, 2, 3]))
  })

  it('survives a reopening, which is the whole point of a favourite', async () => {
    await favorites.pin(draft())

    await expect(createFavorites(folder).list()).resolves.toHaveLength(1)
  })

  /** A sound has no still to copy; the shelf draws its glyph rather than a broken picture. */
  it('keeps a recipe that has no picture at all', async () => {
    const [recipe] = await favorites.pin(draft({ type: 'audio', thumbnail: null }))

    expect(recipe?.hasThumbnail).toBe(false)
    // Nothing written beside the index: the shelf reads `hasThumbnail` and draws the glyph.
    await expect(readdir(folder)).resolves.toEqual(['favorites.json'])
  })

  it('puts the newest first, which is the order the shelf reads', async () => {
    await favorites.pin(draft())
    const recipes = await favorites.pin(
      draft({ id: 'favorite_2', generation: { ...GENERATION, prompt: 'a dry riverbed' } }),
    )

    expect(recipes.map(recipe => recipe.id)).toEqual(['favorite_2', 'favorite_1'])
  })

  // The same intention twice. It moves back to the front rather than being refused: the gesture
  // has to do something visible.
  it('brings an already pinned recipe back to the front rather than doubling it', async () => {
    await favorites.pin(draft())
    await favorites.pin(draft({ id: 'favorite_2', generation: { ...GENERATION, prompt: 'other' } }))

    const recipes = await favorites.pin(draft({ id: 'favorite_3' }))

    expect(recipes.map(recipe => recipe.id)).toEqual(['favorite_1', 'favorite_2'])
  })

  /** The same settings written in another order are the same settings. */
  it('recognises a recipe whose parameters were written in another order', async () => {
    await favorites.pin(draft())

    const recipes = await favorites.pin(
      draft({
        id: 'favorite_2',
        generation: { ...GENERATION, params: { width: 1024, prompt: 'a mossy boulder' } },
      }),
    )

    expect(recipes).toHaveLength(1)
  })

  it('drops the still along with the line that named it', async () => {
    await favorites.pin(draft())

    await expect(favorites.unpin('favorite_1')).resolves.toEqual([])
    await expect(readdir(folder)).resolves.toEqual(['favorites.json'])
  })

  /**
   * The id reaches this off a URL, and `new URL` does not decode `%2F`: a crafted
   * `ai-desktop-studio://favorite/..%2F..%2Fsecret` arrives here as a real `../../secret`. The scheme is
   * one the window is allowed to fetch, so an unchecked join would hand it any file on disk.
   */
  it('refuses a still whose id would climb out of the folder', () => {
    expect(favorites.thumbnailPath('../../../secret')).toBeNull()
    expect(favorites.thumbnailPath('../sibling')).toBeNull()
    expect(favorites.thumbnailPath('/etc/passwd')).toBeNull()
    expect(favorites.thumbnailPath('favorite_1')).toBe(join(folder, 'favorite_1.png'))
  })

  it('says nothing changed when asked to drop something it does not hold', async () => {
    await favorites.pin(draft())

    await expect(favorites.unpin('favorite_absent')).resolves.toHaveLength(1)
  })

  /**
   * Refused rather than evicting the oldest: a favourite that vanished to make room would be a
   * shelf that loses things on its own, which is the one thing a favourite may not do.
   */
  it('refuses one past its bound rather than dropping the oldest', async () => {
    for (let index = 0; index < FAVORITES_MAX; index++) {
      await favorites.pin(
        draft({
          id: `favorite_${index}`,
          generation: { ...GENERATION, prompt: `prompt ${index}` },
        }),
      )
    }

    const recipes = await favorites.pin(
      draft({ id: 'one_too_many', generation: { ...GENERATION, prompt: 'one too many' } }),
    )

    expect(recipes).toHaveLength(FAVORITES_MAX)
    expect(recipes.some(recipe => recipe.id === 'one_too_many')).toBe(false)
  })

  /**
   * The file sits in the user's own folder. A line edited into something else drops out rather
   * than reaching the window as a half-recipe whose model is undefined.
   */
  it('drops an unreadable line instead of the whole shelf', async () => {
    await favorites.pin(draft())
    const stored: unknown[] = JSON.parse(await readFile(join(folder, 'favorites.json'), 'utf8'))
    await writeFile(
      join(folder, 'favorites.json'),
      JSON.stringify([{ id: 'broken' }, ...stored, 'not even an object']),
      'utf8',
    )

    // Through a fresh store: the one that wrote the file answers from what it holds, so asking
    // it would test the cache rather than the parsing.
    await expect(createFavorites(folder).list()).resolves.toHaveLength(1)
  })

  it('reads an unreadable file as an empty shelf, never as a failure', async () => {
    await writeFile(join(folder, 'favorites.json'), 'not json at all', 'utf8')

    await expect(favorites.list()).resolves.toEqual([])
  })

  /**
   * `texture` was an asset kind until 2026-08-26, and this file carries no version to migrate on.
   * Without the rename the enum drops the whole recipe — then the next `pin` writes the shortened
   * list back, and the entry is gone from the FILE, its thumbnail orphaned, with nothing said.
   */
  it('keeps a recipe pinned under the kind that has since been folded into pictures', async () => {
    await favorites.pin(draft())
    const stored: unknown[] = JSON.parse(await readFile(join(folder, 'favorites.json'), 'utf8'))
    const legacy = { ...(stored[0] as object), id: 'favorite_legacy', type: 'texture' }
    await writeFile(join(folder, 'favorites.json'), JSON.stringify([legacy, ...stored]), 'utf8')

    const read = await createFavorites(folder).list()

    expect(read.map(recipe => recipe.id)).toContain('favorite_legacy')
    expect(read.find(recipe => recipe.id === 'favorite_legacy')?.type).toBe('image')
  })
})
