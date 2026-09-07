import { aiRoleId } from '@shared/domain/aiRole'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ModelFamily } from '@shared/domain/model'
import {
  COLLECTION_PERSIST_VERSION,
  DEFAULT_COLLECTION_STATE,
  setFacetValue,
} from '@/helpers/collectionState'
import { ORIGIN_FACET } from '@/features/models/modelFilters'
import { useModels } from './models'

beforeEach(() => {
  useModels.setState({ selected: {}, collections: {}, preset: {} })
})

describe('choosing a model', () => {
  it('files it under the family it belongs to', () => {
    useModels.getState().select(aiRoleId('image', 'txt2img'), 'model_flux')

    expect(useModels.getState().selected[aiRoleId('image', 'txt2img')]).toBe('model_flux')
  })

  it('leaves the other families alone', () => {
    useModels.setState({ selected: { [aiRoleId('image', 'txt2img')]: 'model_flux' } })

    useModels.getState().select(aiRoleId('video', 'txt2video'), 'model_kling')

    expect(useModels.getState().selected[aiRoleId('image', 'txt2img')]).toBe('model_flux')
  })

  /**
   * A choice is global to its family, so picking an image model from anywhere replaces the one
   * Image was on. See `select` for why the distinction is not recorded.
   */
  it('replaces the choice already filed under that family', () => {
    useModels.setState({ selected: { [aiRoleId('image', 'txt2img')]: 'model_flux' } })

    useModels.getState().select(aiRoleId('image', 'txt2img'), 'model_sdxl')

    expect(useModels.getState().selected[aiRoleId('image', 'txt2img')]).toBe('model_sdxl')
  })

  /**
   * Asserted on what actually lands on disk rather than on the shape handed to `partialize`:
   * this is the only place that says what a restart restores.
   */
  describe('what survives a restart', () => {
    const stored = (family: ModelFamily): { selections?: Record<string, readonly string[]> } => {
      const raw = localStorage.getItem('ai-desktop-studio:models')
      return raw ? (JSON.parse(raw).state?.collections?.[family] ?? {}) : {}
    }

    const narrowTo = (family: ModelFamily, facet: string, value: string): void =>
      useModels
        .getState()
        .setCollection(family, setFacetValue(DEFAULT_COLLECTION_STATE, facet, value))

    it('keeps the facets the user did set by hand', () => {
      narrowTo('image', ORIGIN_FACET, 'official')

      expect(stored('image').selections).toEqual({ [ORIGIN_FACET]: ['official'] })
    })

    /**
     * THE defect the split was made for. One state was shared by all seven spaces AND persisted,
     * so "Official" ticked under Image narrowed the Skyboxes space too — where, its models
     * carrying no `sc:scenario` tag, it matched nothing at all — and went on doing so across
     * restarts, in a space the user had never filtered and could not think to unfilter.
     */
    it('leaves the spaces the user did not filter alone', () => {
      narrowTo('image', ORIGIN_FACET, 'official')

      expect(stored('skybox').selections).toBeUndefined()
    })
  })
})

/**
 * `texture` named the material family until 2026-08-26, and this blob keys BOTH halves of the
 * browser by it. A key nothing reads reddens nowhere: the generator opens on no model, and
 * `searchless` drops the browser's own state for that family at the first write.
 */
describe('a blob written before the material family was renamed', () => {
  it('restores the choice and the browser state under the name they have now', async () => {
    localStorage.setItem(
      'ai-desktop-studio:models',
      JSON.stringify({
        version: COLLECTION_PERSIST_VERSION + 1,
        state: {
          selected: { 'texture/txt2img_texture': 'model_sdxl' },
          collections: { texture: DEFAULT_COLLECTION_STATE },
        },
      }),
    )

    await useModels.persist.rehydrate()

    expect(useModels.getState().selected[aiRoleId('material', 'txt2img_texture')]).toBe(
      'model_sdxl',
    )
    expect(useModels.getState().collections.material).toEqual(DEFAULT_COLLECTION_STATE)
  })

  /**
   * The older shape still, where `selected` was keyed per FAMILY. `withRoleKeys` walks
   * `MODEL_FAMILIES` to re-file it per employment, so a family it no longer names is a choice it
   * cannot see — the rename has to land before it, not after.
   */
  it('restores a choice filed per family, under the name that family has now', async () => {
    localStorage.setItem(
      'ai-desktop-studio:models',
      JSON.stringify({
        version: COLLECTION_PERSIST_VERSION,
        state: { selected: { texture: 'model_sdxl', image: 'model_flux' } },
      }),
    )

    await useModels.persist.rehydrate()

    expect(useModels.getState().selected[aiRoleId('material', 'txt2img_texture')]).toBe(
      'model_sdxl',
    )
    expect(useModels.getState().selected[aiRoleId('image', 'txt2img')]).toBe('model_flux')
  })
})
