import { describe, expect, it } from 'vitest'

import { PROVIDER_MAINTAINER, SKYBOX_TAG, SYSTEM_TAG_PREFIX } from '@shared/domain/model'

import {
  createModelRegistry,
  type ListRequest,
  type ModelCatalog,
  type ModelRegistry,
  type RegistryOptions,
  type RemoteModel,
  type SearchRequest,
} from './modelRegistry'

/**
 * The account switch is its own subject, below: everything else is built deaf to it. The local
 * catalogue is empty by default — the cases that care about it hand one in.
 */
export const registryOf = (
  options: Omit<RegistryOptions, 'watch' | 'localModels' | 'translate' | 'isInstalled'> &
    Partial<Pick<RegistryOptions, 'localModels' | 'translate' | 'isInstalled' | 'publishedModels'>>,
): ModelRegistry =>
  createModelRegistry({
    localModels: () => [],
    // Present by default: a case about the panel's shape should not have to say so, and the two
    // that care about the download hand in their own answer.
    isInstalled: () => true,
    // What a bundle would answer, without one: the labels of a local form are keys until a
    // language names them, and nothing here is a screen.
    translate: key => key,
    ...options,
    watch: () => () => {},
  })

/** What the catalogue answers for a model Scenario publishes — see `isOfficial`, which needs both. */
export const PROVIDER_OWNED = {
  privacy: 'public',
  complianceMetadata: { maintainer: PROVIDER_MAINTAINER },
}

export const FLUX: RemoteModel = {
  ...PROVIDER_OWNED,
  id: 'model_flux',
  name: 'Flux',
  capabilities: ['txt2img', 'img2img'],
  source: 'scenario',
  tags: ['Image'],
  shortDescription: 'A fast image model',
  thumbnail: { url: 'https://cdn.example/flux.png' },
  createdAt: '2026-01-02T00:00:00.000Z',
  inputs: [
    { name: 'prompt', type: 'string', prompt: true, required: { always: true } },
    { name: 'numInferenceSteps', type: 'number', min: 1, max: 50, default: 28 },
  ],
}

/**
 * Shaped after `model_scenario-skybox-flux`: a panorama model answers the image capabilities,
 * and it is maintained by Scenario while carrying no `sc:scenario` tag — see
 * `PROVIDER_MAINTAINER` for what that combination cost.
 */
export const SKY: RemoteModel = {
  ...PROVIDER_OWNED,
  id: 'model_sky',
  name: 'Scenario Skybox Flux.1',
  capabilities: ['txt2img', 'img2img'],
  tags: [SKYBOX_TAG, 'panorama'],
}

export type Catalogue = {
  private?: readonly RemoteModel[]
  public?: readonly RemoteModel[]
}

export type Spied = {
  catalog: () => ModelCatalog
  lists: ListRequest[]
  searches: SearchRequest[]
  bulks: string[][]
}

/**
 * Stands in for the SDK, paginating the way the real endpoints do: a token into the catalogue,
 * an offset into the search index. The registry's whole job is to walk those two, so a fake
 * that answered everything in one page would test nothing.
 */
export function spiedCatalog(catalogue: Catalogue): Spied {
  const lists: ListRequest[] = []
  const searches: SearchRequest[] = []
  const bulks: string[][] = []
  const everything = [...(catalogue.private ?? []), ...(catalogue.public ?? [])]

  const catalog = (): ModelCatalog => ({
    list: request => {
      lists.push(request)
      // Narrowed server-side, as the real endpoint does: a page fetched under a tag holds fewer
      // models than the same page without one, which is what makes it a page of its own rather
      // than a slice of the catalogue. And it answers NOTHING for Scenario's own namespace —
      // measured, `tags=sc:skybox` returns no model while the unfiltered listing serves all
      // three. A fake that honoured those would stay green on the defect that emptied the
      // skybox workspace.
      const held = request.tag?.startsWith(SYSTEM_TAG_PREFIX)
        ? []
        : (catalogue[request.privacy] ?? []).filter(
            model => !request.tag || (model.tags ?? []).includes(request.tag),
          )
      const start = request.token ? Number(request.token) : 0
      const models = held.slice(start, start + request.pageSize)
      const next = start + models.length
      return Promise.resolve({ models, token: next < held.length ? String(next) : null })
    },

    search: request => {
      searches.push(request)
      const hits = (catalogue.public ?? []).filter(model =>
        (model.name ?? '').toLowerCase().includes(request.query.toLowerCase()),
      )
      const models = hits.slice(request.offset, request.offset + request.limit)
      const next = request.offset + models.length
      return Promise.resolve({ models, token: next < hits.length ? String(next) : null })
    },

    retrieve: modelId => {
      const model = everything.find(candidate => candidate.id === modelId)
      return model ? Promise.resolve({ model }) : Promise.reject(new Error('unknown model'))
    },

    assetUrls: assetIds => {
      bulks.push([...assetIds])
      /**
       * Mirrors what the API really answers, per family: an image carries its picture in
       * `url`; a video carries an unusable `url` and a still in `thumbnail`; a text example
       * carries neither.
       */
      return Promise.resolve(
        assetIds.map(id => {
          if (id === 'asset_missing') return { id }
          if (id === 'asset_text') return { id, url: `https://cdn/${id}`, mimeType: 'text/plain' }
          if (id === 'asset_video') {
            return {
              id,
              url: `https://cdn/${id}`,
              mimeType: 'video/mp4',
              thumbnail: { url: `https://cdn/${id}-still` },
            }
          }
          return { id, url: `https://cdn/${id}`, mimeType: 'image/png' }
        }),
      )
    },
  })

  return { catalog, lists, searches, bulks }
}

describe('model registry', () => {
  /**
   * The API unions the tags it is given — `Video` alone answers 127 models, `Video,Kling` 139 —
   * so only one goes out, as a coarse narrowing, and the exact match is made locally.
   */
  it('sends one tag to the API as a coarse pre-filter', async () => {
    const spied = spiedCatalog({ public: [FLUX] })
    const registry = registryOf({ catalog: spied.catalog })

    await registry.search({ tags: ['I2V', 'Video'] })

    expect(spied.lists.at(-1)?.tag).toBe('I2V')
  })

  /**
   * MEASURED 2026-08-14: `GET /models?tags=sc:skybox` answers zero models, while the three that
   * carry the tag come out of the very same listing when it is asked for none. Narrowing by it
   * left the skybox workspace with nothing to choose from, so the walk goes wide instead and
   * `matches` keeps the family from the records. A chosen tag still wins over the family.
   */
  it('keeps the skybox family without asking for a tag the API does not index', async () => {
    const spied = spiedCatalog({ public: [SKY, FLUX] })
    const registry = registryOf({ catalog: spied.catalog })

    const skyboxes = await registry.search({ family: 'skybox' })
    expect(skyboxes.items.map(item => item.id)).toEqual(['model_sky'])
    expect(spied.lists.some(request => request.tag?.startsWith(SYSTEM_TAG_PREFIX))).toBe(false)

    await registry.search({ family: 'skybox', tags: ['panorama'] })
    expect(spied.lists.at(-1)?.tag).toBe('panorama')
  })
})
