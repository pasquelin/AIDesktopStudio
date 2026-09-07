import { describe, expect, it } from 'vitest'

import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'

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

export const VEO: RemoteModel = { id: 'model_veo', name: 'Veo', capabilities: ['txt2video'] }

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

export function publicCatalog(models: readonly RemoteModel[]): () => ModelCatalog {
  return spiedCatalog({ public: models }).catalog
}

export function manyModels(count: number, prefix = 'model'): RemoteModel[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}_${index}`,
    name: `${prefix} ${index}`,
    capabilities: ['txt2img'],
  }))
}

describe('model registry', () => {
  it('summarizes what the panel needs and infers the family', async () => {
    const registry = registryOf({ catalog: publicCatalog([FLUX]) })

    expect((await registry.search({})).items).toEqual([
      {
        id: 'model_flux',
        name: 'Flux',
        family: 'image',
        runsOn: SCENARIO_CLOUD,
        source: 'scenario',
        origin: 'official',
        featured: false,
        capabilities: ['txt2img', 'img2img'],
        tags: ['Image'],
        description: 'A fast image model',
        thumbnail: 'https://cdn.example/flux.png',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ])
  })

  it('falls back to the id and to an unknown origin rather than dropping a model', async () => {
    const registry = registryOf({ catalog: publicCatalog([{ id: 'model_bare' }]) })

    expect((await registry.search({})).items).toEqual([
      {
        id: 'model_bare',
        name: 'model_bare',
        family: 'other',
        runsOn: SCENARIO_CLOUD,
        source: 'other',
        origin: 'community',
        featured: false,
        capabilities: [],
        tags: [],
      },
    ])
  })

  /**
   * The grade decides whether the picker offers the model at all, so it has to survive both
   * projections. Grade 0 is the trap: it is the free tier, and a truthiness test drops it to
   * "ungraded" — which reads as allowed, silently, for every model the free plan does cover.
   */
  it('carries the plan grade through, zero included', async () => {
    const registry = registryOf({
      catalog: publicCatalog([
        { id: 'model_pro', accessRestrictions: 50 },
        { id: 'model_free', accessRestrictions: 0 },
        { id: 'model_ungraded' },
      ]),
    })

    const { items } = await registry.search({})

    expect(items.map(item => item.requiredPlanLevel)).toEqual([50, 0, undefined])
  })

  /**
   * MEASURED, and the reason the grade is remembered at all: `GET /models` grades every model
   * with a number, while `POST /search/models` answers `null` on every hit — the search index
   * does not carry the field. Written straight through, that `null` landed in a `number` field
   * and the same model went from greyed out in the listing to freely pickable the moment the
   * user typed its name.
   */
  it('grades a search hit from what the listing already said', async () => {
    // The two endpoints answer the SAME model differently — that is the whole bug.
    const catalog = (): ModelCatalog => ({
      list: () =>
        Promise.resolve({
          models: [{ id: 'model_seedance', accessRestrictions: 50 }],
          token: null,
        }),
      search: () =>
        Promise.resolve({
          models: [{ id: 'model_seedance', name: 'Seedance', accessRestrictions: null }],
          token: null,
        }),
      retrieve: () => Promise.reject(new Error('not asked')),
      assetUrls: () => Promise.resolve([]),
    })
    const registry = registryOf({ catalog })

    // Listed first, as the panel does before anyone types.
    await registry.search({})
    const { items } = await registry.search({ search: 'seedance' })

    expect(items[0]?.requiredPlanLevel).toBe(50)
  })

  // Ungraded is the permissive answer; a grade invented at 0 would refuse nothing but would
  // also claim to know, and the free tier IS 0.
  it('leaves a search hit it has never listed ungraded', async () => {
    const catalog = (): ModelCatalog => ({
      list: () => Promise.resolve({ models: [], token: null }),
      search: () =>
        Promise.resolve({
          models: [{ id: 'model_unseen', name: 'Unseen', accessRestrictions: null }],
          token: null,
        }),
      retrieve: () => Promise.reject(new Error('not asked')),
      assetUrls: () => Promise.resolve([]),
    })
    const registry = registryOf({ catalog })

    const { items } = await registry.search({ search: 'unseen' })

    expect(items[0]?.requiredPlanLevel).toBeUndefined()
  })

  /** The tag `PROVIDER_MAINTAINER` replaces missed `SKY`, and with it the whole Skyboxes space. */
  it('reads authorship from the maintainer, which the official tag only half covers', async () => {
    const registry = registryOf({ catalog: publicCatalog([FLUX, SKY, VEO]) })

    const officials = await registry.search({ origin: 'official' })
    expect(officials.items.map(item => item.id)).toEqual(['model_flux', 'model_sky'])

    expect((await registry.search({ origin: 'community' })).items).toEqual([
      expect.objectContaining({ id: 'model_veo', origin: 'community' }),
    ])
  })

  /**
   * MEASURED 2026-08-15: the one model this account has trained answers `maintainer: Scenario`
   * like the catalogue does, so that field alone filed the user's own models as official — and
   * "Community" then hid the only models nobody else can see.
   */
  it('never calls a private model official, whoever maintains it', async () => {
    const mine: RemoteModel = { ...PROVIDER_OWNED, privacy: 'private', id: 'model_mine' }
    const registry = registryOf({
      catalog: spiedCatalog({ private: [mine], public: [FLUX] }).catalog,
    })

    expect((await registry.search({ origin: 'community' })).items).toEqual([
      expect.objectContaining({ id: 'model_mine', origin: 'community' }),
    ])
  })

  it('filters by family across pages', async () => {
    const registry = registryOf({ catalog: publicCatalog([FLUX, VEO]) })

    expect((await registry.search({ family: 'video' })).items).toEqual([
      expect.objectContaining({ id: 'model_veo' }),
    ])
  })

  it('answers one page at a time rather than walking the whole catalogue', async () => {
    const spied = spiedCatalog({ public: manyModels(400) })
    const registry = registryOf({ catalog: spied.catalog })

    const first = await registry.search({ limit: 24 })

    expect(first.items).toHaveLength(24)
    expect(first.cursor).not.toBeNull()
    // The empty private pass, then one public page — not the four hundred models.
    expect(spied.lists).toHaveLength(2)
  })

  /**
   * A server page holds four screenfuls, and the cursor comes back into it. Fetching it again
   * for each one cost 33 requests to walk 8 distinct pages, and reparsed 2 500 records.
   */
  it('downloads a server page once, however many screenfuls it serves', async () => {
    const spied = spiedCatalog({ public: manyModels(400) })
    const registry = registryOf({ catalog: spied.catalog })

    const first = await registry.search({ limit: 24 })
    const second = await registry.search({ limit: 24, cursor: first.cursor ?? undefined })
    await registry.search({ limit: 24, cursor: second.cursor ?? undefined })

    // The empty private pass, then ONE public page serving all three screenfuls.
    expect(spied.lists).toHaveLength(2)
  })

  it('resumes where the cursor left off, without repeating a model', async () => {
    const registry = registryOf({ catalog: publicCatalog(manyModels(400)) })

    const first = await registry.search({ limit: 24 })
    const second = await registry.search({ limit: 24, cursor: first.cursor ?? undefined })
    const ids = new Set([...first.items, ...second.items].map(summary => summary.id))

    expect(ids.size).toBe(48)
  })

  /**
   * The walk covers the private listing then the public one, and `privacy: 'public'` includes
   * community models — so a model the user trained AND published comes out of both.
   */
  it('lists a model once even when both passes carry it', async () => {
    const mine = { ...FLUX, id: 'model_shared' }
    const registry = registryOf({
      catalog: spiedCatalog({ private: [mine], public: [mine, VEO] }).catalog,
    })

    const page = await registry.search({})

    expect(page.items.map(summary => summary.id)).toEqual(['model_shared', 'model_veo'])
  })

  it('reports the end of the catalogue with a null cursor', async () => {
    const registry = registryOf({ catalog: publicCatalog([FLUX, VEO]) })

    expect((await registry.search({})).cursor).toBeNull()
  })

  it('walks the private models first, then the public ones', async () => {
    const spied = spiedCatalog({ private: [VEO], public: [FLUX] })
    const registry = registryOf({ catalog: spied.catalog })

    const page = await registry.search({})

    expect(page.items.map(summary => summary.id)).toEqual(['model_veo', 'model_flux'])
    expect(spied.lists.map(request => request.privacy)).toEqual(['private', 'public'])
  })

  // A model the user trained is theirs, never Scenario's: that page could only be discarded.
  it('skips the private pass entirely when only official models are wanted', async () => {
    const spied = spiedCatalog({ private: [VEO], public: [FLUX] })
    const registry = registryOf({ catalog: spied.catalog })

    const page = await registry.search({ origin: 'official' })

    expect(page.items.map(summary => summary.id)).toEqual(['model_flux'])
    expect(spied.lists.every(request => request.privacy === 'public')).toBe(true)
  })
})
