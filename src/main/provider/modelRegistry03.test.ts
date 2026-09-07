import { describe, expect, it, vi } from 'vitest'

import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'

import { aiRoleId } from '@shared/domain/aiRole'

import { LOCAL_RUNTIME, PROVIDER_MAINTAINER, SYSTEM_TAG_PREFIX } from '@shared/domain/model'

import { ADVANCED_GROUP } from '@shared/domain/localFields'

import { localModel } from '@shared/domain/localModel-fixtures'

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

describe('model registry', () => {
  describe('describe', () => {
    it('translates a model’s inputs into descriptors', async () => {
      const registry = registryOf({ catalog: publicCatalog([FLUX]) })
      const descriptor = await registry.describe('model_flux')

      expect(descriptor.name).toBe('Flux')
      expect(descriptor.fields).toEqual([
        { key: 'prompt', kind: 'longText', label: 'Prompt', required: true, promptSpark: true },
        {
          key: 'numInferenceSteps',
          kind: 'integer',
          label: 'Num inference steps',
          required: false,
          default: 28,
          min: 1,
          max: 50,
          // Folded by default: the API groups nothing, and a step count is not what a first
          // generation is about. `schema.test.ts` holds the rule that decides it.
          group: ADVANCED_GROUP,
        },
      ])
    })

    /**
     * 🛑 Measured 2026-08-22: a manifest naming no family made `localSummaryOf` answer null, the
     * lookup fell through to the API, and a LOCAL id was sent to Scenario — `404 Model ssd-1b not
     * found`, journalled as a generation failure. A model on this machine never reaches the API,
     * whatever its manifest is missing: what is missing is a defect of ours, answered from here.
     */
    it('never asks the API about a model this machine holds, however thin its manifest', async () => {
      const thin = localModel({ id: 'local_thin', name: 'Thin', modality: 'image' })
      // `retrieve` rejects: reaching the API at all is what this test refuses, and a rejection
      // says so where a silent answer would let the call through unnoticed.
      const catalog = (): ModelCatalog => ({
        list: () => Promise.resolve({ models: [], token: null }),
        search: () => Promise.resolve({ models: [], token: null }),
        retrieve: () => Promise.reject(new Error('not asked')),
        assetUrls: () => Promise.resolve([]),
      })
      const registry = registryOf({ catalog, localModels: () => [thin] })

      const descriptor = await registry.describe('local_thin')

      expect(descriptor.name).toBe('Thin')
      expect(descriptor.fields.map(field => field.key)).toContain('prompt')
    })

    it('describes a model with no inputs as a form with no field, not as a failure', async () => {
      const registry = registryOf({ catalog: publicCatalog([VEO]) })
      await expect(registry.describe('model_veo')).resolves.toMatchObject({ fields: [] })
    })

    it('describes each model once', async () => {
      const catalog = vi.fn(publicCatalog([FLUX]))
      const registry = registryOf({ catalog })

      await registry.describe('model_flux')
      await registry.describe('model_flux')
      expect(catalog).toHaveBeenCalledOnce()
    })
  })

  /**
   * The two catalogues merge here and nowhere else — ADR-21 as amended. What is checked is that a
   * model on this machine reaches the SAME panel, through the same filters, with the same shape.
   */
  describe('the local catalogue', () => {
    const LOCAL = localModel({
      id: 'local_diffusion',
      name: 'A model of this machine',
      family: 'image',
      capabilities: ['txt2img'],
      modality: 'image',
    })

    it('offers a local model beside the cloud ones, saying where each runs', async () => {
      const registry = registryOf({ catalog: publicCatalog([FLUX]), localModels: () => [LOCAL] })

      const page = await registry.search({})

      expect(page.items.map(one => [one.id, one.runsOn])).toEqual([
        ['local_diffusion', LOCAL_RUNTIME],
        ['model_flux', SCENARIO_CLOUD],
      ])
    })

    it('shows a local model added after the listing was cached', async () => {
      let locals: ReturnType<typeof localModel>[] = []
      const registry = registryOf({
        catalog: publicCatalog([FLUX]),
        localModels: () => locals,
        ttlMs: 60_000,
      })

      await registry.search({})
      locals = [LOCAL]
      const page = await registry.search({})

      expect(page.items.map(one => one.id)).toContain('local_diffusion')
    })

    /**
     * The assistant and the recognition model answer a ROLE, and the manager screen is where those
     * are chosen. A model with no family in a space's panel would be a row nothing can generate.
     */
    it('keeps a model that serves no space out of the panel', async () => {
      const registry = registryOf({
        catalog: publicCatalog([]),
        localModels: () => [localModel({ id: 'qwen' })],
      })

      expect((await registry.search({})).items).toEqual([])
    })

    it('carries the year and the highlight the manifest declared', async () => {
      const local = localModel({
        id: 'triposr',
        name: 'TripoSR',
        family: '3d',
        capabilities: ['img23d'],
        summary: 'Fastest open image-to-mesh',
        releasedAt: '2024-03-04',
        featured: true,
      })
      const registry = registryOf({
        catalog: publicCatalog([]),
        localModels: () => [local],
      })

      const [item] = (await registry.search({ family: '3d' })).items

      expect(item?.description).toBe('2024 · Fastest open image-to-mesh')
      expect(item?.createdAt).toBe('2024-03-04')
      expect(item?.featured).toBe(true)
    })

    it('marks a listed card with nothing to fetch as not downloadable', async () => {
      const listed = localModel({
        id: 'panfusion',
        family: 'skybox',
        capabilities: ['txt2skybox'],
        files: [],
      })
      const registry = registryOf({
        catalog: publicCatalog([]),
        localModels: () => [listed],
        isInstalled: () => false,
      })

      const [item] = (await registry.search({ family: 'skybox' })).items

      expect(item?.installed).toBe(false)
      expect(item?.downloadable).toBe(false)
    })

    it('narrows a local model by family and by capability like any other', async () => {
      const registry = registryOf({ catalog: publicCatalog([]), localModels: () => [LOCAL] })

      expect((await registry.search({ family: 'image' })).items).toHaveLength(1)
      expect((await registry.search({ family: 'video' })).items).toEqual([])
      expect((await registry.search({ family: 'material' })).items).toEqual([])
      expect((await registry.search({ capabilities: ['img2img'] })).items).toEqual([])
    })

    /**
     * A painter is filed under image and still draws textures. Asking the materials space used
     * to answer nothing, and the panel told the person to type a key for models that need none.
     */
    it("lists a model in the space it serves, wearing that space's family", async () => {
      const painter = localModel({
        id: 'ssd-1b',
        family: 'image',
        capabilities: ['txt2img', 'img2img'],
        serves: ['material/txt2img_texture', 'material/img2img_texture'],
        modality: 'image',
      })
      const registry = registryOf({ catalog: publicCatalog([]), localModels: () => [painter] })

      const textures = await registry.search({ family: 'material' })
      expect(textures.items).toEqual([
        expect.objectContaining({
          id: 'ssd-1b',
          family: 'material',
          capabilities: ['txt2img_texture', 'img2img_texture'],
        }),
      ])
      expect((await registry.search({ family: 'image' })).items).toEqual([
        expect.objectContaining({
          id: 'ssd-1b',
          family: 'image',
          capabilities: ['txt2img', 'img2img'],
        }),
      ])
      expect((await registry.search({ family: 'video' })).items).toEqual([])
    })

    /**
     * 🛑 Asking for this machine must not walk the catalogue: the pages could only be discarded,
     * and each of them is a round trip — on a studio that may hold no account at all.
     */
    it('asks the API nothing when the person narrowed to this machine', async () => {
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({ catalog: spied.catalog, localModels: () => [LOCAL] })

      const page = await registry.search({ runsOn: LOCAL_RUNTIME })

      expect(page.items.map(one => one.id)).toEqual(['local_diffusion'])
      expect(spied.lists).toEqual([])
    })

    // A cursor means "further into the catalogue", and this machine's handful is not paginated:
    // repeating it on every page would list the same rows forever.
    it('rides on the first page alone', async () => {
      const registry = registryOf({
        catalog: publicCatalog(Array.from({ length: 60 }, (_, at) => ({ ...FLUX, id: `m_${at}` }))),
        localModels: () => [LOCAL],
      })

      const first = await registry.search({ limit: 24 })
      const second = await registry.search({ limit: 24, cursor: first.cursor ?? undefined })

      expect(first.items[0]?.id).toBe('local_diffusion')
      expect(second.items.map(one => one.id)).not.toContain('local_diffusion')
    })

    /**
     * Invariant 5 held from the other side: a model on this machine has no server to ask, so its
     * form comes from its MODALITY — and it is `<DynamicForm/>` that renders it, unchanged.
     */
    it('describes a local model from its modality, without a round trip', async () => {
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({ catalog: spied.catalog, localModels: () => [LOCAL] })

      const described = await registry.describe('local_diffusion')

      expect(described.fields.map(field => field.key)).toContain('steps')
      expect(described.runsOn).toBe(LOCAL_RUNTIME)
      expect(spied.lists).toEqual([])
    })

    /**
     * The shape a DISCOVERED tag has: no family of its own, the employments it serves declared in
     * `serves`. Both halves matter — it must reach the picker of that family, and its form must
     * come from here rather than from a catalogue that has never heard of its id.
     */
    it('lists and describes a discovered model that declares no family', async () => {
      const tag = localModel({
        id: 'qwen2.5-coder:7b',
        name: 'qwen2.5-coder:7b',
        loader: 'ollama',
        modality: 'text',
        serves: [aiRoleId('code', 'txt2code'), aiRoleId('code', 'code2code')],
      })
      const spied = spiedCatalog({ public: [FLUX] })
      const registry = registryOf({ catalog: spied.catalog, localModels: () => [tag] })

      const page = await registry.search({ family: 'code' })
      const described = await registry.describe('qwen2.5-coder:7b')

      expect(page.items.map(one => one.id)).toEqual(['qwen2.5-coder:7b'])
      expect(described.fields.map(field => field.key)).toContain('prompt')
      // 🛑 No round trip: a local id asked of Scenario answers `404`, journalled as a failure.
      expect(spied.lists).toEqual([])
    })

    // A card with nothing to draw is what the shipped pictures exist to prevent — and a model the
    // person supplied gets the generic one of its modality rather than a broken tile.
    it('always names a picture, shipped beside the catalogue', async () => {
      const registry = registryOf({ catalog: publicCatalog([]), localModels: () => [LOCAL] })

      expect((await registry.search({})).items[0]?.thumbnail).toContain('model/')
    })
  })
})
