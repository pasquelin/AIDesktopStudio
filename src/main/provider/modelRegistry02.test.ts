import { describe, expect, it } from 'vitest'

import { PROVIDER_MAINTAINER, SYSTEM_TAG_PREFIX } from '@shared/domain/model'

import { createCredentialsWatch } from './credentialsWatch'

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

export const VEO: RemoteModel = { id: 'model_veo', name: 'Veo', capabilities: ['txt2video'] }

/** Shaped after `model_ideogram-remove-background`: a cutout model answers `img2img` too. */
export const CUTOUT: RemoteModel = {
  ...PROVIDER_OWNED,
  id: 'model_cutout',
  name: 'Ideogram Remove Background',
  capabilities: ['img2img'],
  tags: ['remove-background'],
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

export function manyModels(count: number, prefix = 'model'): RemoteModel[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}_${index}`,
    name: `${prefix} ${index}`,
    capabilities: ['txt2img'],
  }))
}

describe('model registry', () => {
  /**
   * The three edit families are as sparse as the skyboxes and are found the same way. Measured:
   * nine models carry `remove-background`, thirteen `image-upscale`, four `vectorize`.
   */
  it('asks the API for the tag of every family the endpoint indexes', async () => {
    const spied = spiedCatalog({ public: [CUTOUT] })
    const registry = registryOf({ catalog: spied.catalog })

    const cutouts = await registry.search({ family: 'background-removal' })
    expect(spied.lists.at(-1)?.tag).toBe('remove-background')
    expect(cutouts.items.map(item => item.id)).toEqual(['model_cutout'])

    await registry.search({ family: 'upscale' })
    expect(spied.lists.at(-1)?.tag).toBe('image-upscale')

    await registry.search({ family: 'vectorization' })
    expect(spied.lists.at(-1)?.tag).toBe('vectorize')
  })

  // A tagged listing holds fewer models than the plain one, so its page is a page of its own.
  // Without the tag in the cache key, those nine cutouts answered the Image listing that came
  // next. The families resolving to no tag share one page instead, which is the point of keying
  // by the tag rather than by the family.
  it('does not serve a tagged page back to another family', async () => {
    const spied = spiedCatalog({ public: [CUTOUT, FLUX] })
    const registry = registryOf({ catalog: spied.catalog })

    await registry.search({ family: 'background-removal' })
    const images = await registry.search({ family: 'image' })

    expect(images.items.map(item => item.id)).toEqual(['model_flux'])
  })

  // Resolved here, against the main process's clock: a date built in the renderer would move
  // on every render and make a new cache key each time.
  it('turns the requested span into a date, against its own clock', async () => {
    const spied = spiedCatalog({ public: [FLUX] })
    const noon = Date.parse('2026-08-06T12:00:00.000Z')
    const registry = registryOf({ catalog: spied.catalog, now: () => noon })

    await registry.search({ since: 'week' })

    expect(spied.lists.at(-1)?.createdAfter).toBe('2026-07-30T12:00:00.000Z')
  })

  it('asks for no date bound when no span is wanted', async () => {
    const spied = spiedCatalog({ public: [FLUX] })
    const registry = registryOf({ catalog: spied.catalog })

    await registry.search({})

    expect(spied.lists.at(-1)?.createdAfter).toBeUndefined()
  })

  /**
   * `tags=sc:scenario` answers zero models too, so authorship is read off the records and the
   * origin no longer changes what is asked for. The pages are therefore the same pages, and
   * ticking "Official" used to redownload what the listing had in hand a second earlier.
   */
  it('reuses the pages already walked when only the origin changes', async () => {
    const spied = spiedCatalog({ public: [FLUX, VEO] })
    const registry = registryOf({ catalog: spied.catalog })

    await registry.search({})
    const walked = spied.lists.length
    const officials = await registry.search({ origin: 'official' })

    expect(officials.items.map(item => item.id)).toEqual(['model_flux'])
    expect(spied.lists).toHaveLength(walked)
  })

  /**
   * A filter the API cannot apply — family, capability — can empty page after page. The walk
   * has to stop and hand its cursor back, or one IPC call freezes the main process over the
   * whole catalogue.
   */
  it('bounds how many pages one request walks, and keeps its cursor', async () => {
    const spied = spiedCatalog({ public: manyModels(5000) })
    const registry = registryOf({ catalog: spied.catalog })

    const page = await registry.search({ family: 'video', limit: 24 })

    expect(page.items).toEqual([])
    expect(page.cursor).not.toBeNull()
    expect(spied.lists.length).toBeLessThanOrEqual(5)
  })

  it('sends a text query to the search index rather than sifting the catalogue', async () => {
    const spied = spiedCatalog({ public: [FLUX, VEO] })
    const registry = registryOf({ catalog: spied.catalog })

    const page = await registry.search({ search: 'flu' })

    expect(page.items.map(summary => summary.id)).toEqual(['model_flux'])
    expect(spied.searches).toHaveLength(1)
    expect(spied.lists).toHaveLength(0)
  })

  it('paginates the search index by offset', async () => {
    const spied = spiedCatalog({ public: manyModels(60, 'flux') })
    const registry = registryOf({ catalog: spied.catalog })

    const first = await registry.search({ search: 'flux', limit: 24 })
    await registry.search({ search: 'flux', limit: 24, cursor: first.cursor ?? undefined })

    expect(spied.searches.map(request => request.offset)).toEqual([0, 24])
  })

  it('serves an identical query from cache', async () => {
    const spied = spiedCatalog({ public: [FLUX] })
    const registry = registryOf({ catalog: spied.catalog })

    await registry.search({ family: 'image' })
    await registry.search({ family: 'image' })

    // Two calls, not one: an empty private pass still has to be walked before the public one.
    expect(spied.lists).toHaveLength(2)
  })

  it('refetches once the cache has expired', async () => {
    let clock = 0
    const spied = spiedCatalog({ public: [FLUX] })
    const registry = registryOf({ catalog: spied.catalog, ttlMs: 1000, now: () => clock })

    await registry.search({})
    clock = 999
    await registry.search({})
    expect(spied.lists).toHaveLength(2)

    clock = 1001
    await registry.search({})
    expect(spied.lists).toHaveLength(4)
  })

  /**
   * Subscribed where it is built, and reachable no other way: a public `invalidate` would let a
   * later caller drop this cache by hand and leave every other one holding the old account's
   * contents — which is the failure the watch exists to make impossible.
   */
  it('drops every cache on an account switch, without being told', async () => {
    const watch = createCredentialsWatch()
    const spied = spiedCatalog({ public: [FLUX] })
    const registry = createModelRegistry({
      catalog: spied.catalog,
      watch: watch.watch,
      localModels: () => [],
      isInstalled: () => true,
      translate: key => key,
    })

    await registry.search({})
    await registry.previews(['asset_a'])
    watch.changed()

    await registry.search({})
    await registry.previews(['asset_a'])

    expect(spied.lists).toHaveLength(4)
    expect(spied.bulks).toHaveLength(2)
  })

  describe('previews', () => {
    it('resolves a whole screenful of cards in one request', async () => {
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({ catalog: spied.catalog })

      const resolved = await registry.previews(['asset_a', 'asset_b'])

      expect(resolved).toEqual({ asset_a: 'https://cdn/asset_a', asset_b: 'https://cdn/asset_b' })
      expect(spied.bulks).toEqual([['asset_a', 'asset_b']])
    })

    /**
     * Video, 3D and audio examples cannot be shown directly — the API renders a still for each
     * and puts it in `thumbnail`. Reading `url` alone leaves those workspaces without a card.
     */
    it('uses the rendered still when the example is not an image', async () => {
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({ catalog: spied.catalog })

      expect(await registry.previews(['asset_video'])).toEqual({
        asset_video: 'https://cdn/asset_video-still',
      })
    })

    it('drops an example that is neither a picture nor has a still', async () => {
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({ catalog: spied.catalog })

      expect(await registry.previews(['asset_text', 'asset_a'])).toEqual({
        asset_a: 'https://cdn/asset_a',
      })
    })

    /**
     * The URLs the API signs expire. Holding them for the life of the process leaves every
     * card already seen on a dead link, with no request ever made to refresh it.
     */
    it('asks again once a resolved picture has gone stale', async () => {
      let clock = 0
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({
        catalog: spied.catalog,
        ttlMs: 1000,
        now: () => clock,
      })

      await registry.previews(['asset_a'])
      clock = 999
      await registry.previews(['asset_a'])
      expect(spied.bulks).toHaveLength(1)

      clock = 1001
      await registry.previews(['asset_a'])
      expect(spied.bulks).toHaveLength(2)
    })

    // Asking again on every scroll would cost a request per screen, forever.
    it('remembers which assets have no picture and stops asking', async () => {
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({ catalog: spied.catalog })

      await registry.previews(['asset_missing'])
      await registry.previews(['asset_missing'])

      expect(spied.bulks).toHaveLength(1)
    })

    it('asks only for the assets it has not resolved yet', async () => {
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({ catalog: spied.catalog })

      await registry.previews(['asset_a'])
      await registry.previews(['asset_a', 'asset_b'])

      expect(spied.bulks).toEqual([['asset_a'], ['asset_b']])
    })
  })
})
