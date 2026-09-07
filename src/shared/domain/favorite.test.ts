import { describe, expect, it } from 'vitest'
import { assetIdFromUrl, assetUrl, type AssetGeneration } from './asset'
import { favoriteIdFromUrl, favoriteThumbnailUrl, sameRecipe } from './favorite'

const GENERATION: AssetGeneration = {
  modelId: 'flux_2',
  modelLabel: 'FLUX.2',
  prompt: 'a mossy boulder',
  params: { width: 1024, steps: 30 },
}

/**
 * One scheme, two hosts. A still kept outside every project cannot be resolved like a catalogue
 * row, so the two must never be mistaken for one another — the wrong resolver would answer 404
 * on a file that is plainly there.
 */
describe('where a pinned still is served from', () => {
  it('names a host of its own, and reads its id back', () => {
    const url = favoriteThumbnailUrl('favorite_1')

    expect(url).toBe('ai-desktop-studio://favorite/favorite_1')
    expect(favoriteIdFromUrl(url)).toBe('favorite_1')
  })

  it('refuses to read an asset URL as a favourite, and the other way round', () => {
    expect(favoriteIdFromUrl(assetUrl('asset_1'))).toBeNull()
    expect(assetIdFromUrl(favoriteThumbnailUrl('favorite_1'))).toBeNull()
  })

  it('survives an id that needs escaping', () => {
    expect(favoriteIdFromUrl(favoriteThumbnailUrl('a b/c'))).toBe('a b/c')
  })

  it('answers null for anything that is not one of ours', () => {
    expect(favoriteIdFromUrl('https://example.com/favorite_1')).toBeNull()
    expect(favoriteIdFromUrl('not a url at all')).toBeNull()
    expect(favoriteIdFromUrl('ai-desktop-studio://favorite/')).toBeNull()
  })
})

describe('what makes two recipes the same one', () => {
  it('reads the same settings written in another order as the same settings', () => {
    const reordered: AssetGeneration = { ...GENERATION, params: { steps: 30, width: 1024 } }

    expect(sameRecipe(GENERATION, reordered)).toBe(true)
  })

  it('tells apart a changed model, a changed prompt and a changed setting', () => {
    expect(sameRecipe(GENERATION, { ...GENERATION, modelId: 'flux_1' })).toBe(false)
    expect(sameRecipe(GENERATION, { ...GENERATION, prompt: 'a dry riverbed' })).toBe(false)
    expect(sameRecipe(GENERATION, { ...GENERATION, params: { width: 512, steps: 30 } })).toBe(false)
  })

  /** The label is what a build happened to call the model, not part of the recipe. */
  it('ignores what the model was called at the time', () => {
    expect(sameRecipe(GENERATION, { ...GENERATION, modelLabel: 'FLUX 2 (beta)' })).toBe(true)
  })
})
