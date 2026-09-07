import { describe, expect, it, vi } from 'vitest'

import {
  type FieldDescriptor,
  type ModelDescriptor,
  type ModelFamily,
  type ModelOrigin,
} from '@shared/domain/model'

import { localModel } from '@shared/domain/localModel-fixtures'

import {
  createModelRegistry,
  type ModelCatalog,
  type ModelRegistry,
  type RegistryOptions,
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

describe('a cloud that publishes its models as data', () => {
  const TRIPO_FAMILY: ModelFamily = '3d'

  const TRIPO_ORIGIN: ModelOrigin = 'community'

  const TRIPO_PROMPT: FieldDescriptor = {
    key: 'prompt',
    kind: 'longText',
    label: 'Description',
    required: true,
  }

  const TRIPO_MESH: ModelDescriptor = {
    id: 'tripo:generation/text-to-model:tripo-v3.1',
    name: 'Tripo v3.1',
    family: TRIPO_FAMILY,
    runsOn: 'tripo',
    source: 'tripo',
    origin: TRIPO_ORIGIN,
    installed: false,
    downloadable: false,
    diskBytes: 0,
    featured: false,
    capabilities: ['txt23d'],
    tags: [],
    fields: [TRIPO_PROMPT],
  }

  const emptyCatalog = (): ModelCatalog => ({
    list: () => Promise.resolve({ models: [], token: null }),
    search: () => Promise.resolve({ models: [], token: null }),
    retrieve: () => Promise.reject(new Error('nothing to retrieve')),
    assetUrls: () => Promise.resolve([]),
  })
  it('offers its models beside the ones a listing answers', async () => {
    const registry = registryOf({
      catalog: emptyCatalog,
      publishedModels: () => [TRIPO_MESH],
    })

    const page = await registry.search({ family: '3d' })

    expect(page.items.map(item => item.id)).toEqual([TRIPO_MESH.id])
    expect(page.items[0]?.runsOn).toBe('tripo')
  })

  it('keeps them out of a family they do not serve', async () => {
    const registry = registryOf({ catalog: emptyCatalog, publishedModels: () => [TRIPO_MESH] })

    expect((await registry.search({ family: 'video' })).items).toEqual([])
  })

  /** Its form is DATA: describing it must not reach the API, which has never heard of the id. */
  it('describes one from memory, without a round trip', async () => {
    const retrieve = vi.fn()
    const registry = registryOf({
      catalog: () => ({ ...emptyCatalog(), retrieve }),
      publishedModels: () => [TRIPO_MESH],
      publishedModelOf: id => (id === TRIPO_MESH.id ? TRIPO_MESH : null),
    })

    expect((await registry.describe(TRIPO_MESH.id)).fields.map(field => field.key)).toEqual([
      'prompt',
    ])
    expect(retrieve).not.toHaveBeenCalled()
  })

  // Each entry carries its own `runsOn`, so filtering by it answers without walking anything.
  it('walks no listing when the facet asks for another runtime', async () => {
    const list = vi.fn(() => Promise.resolve({ models: [], token: null }))
    const registry = registryOf({
      catalog: () => ({ ...emptyCatalog(), list }),
      publishedModels: () => [TRIPO_MESH],
    })

    expect((await registry.search({ runsOn: 'tripo' })).items.map(one => one.id)).toEqual([
      TRIPO_MESH.id,
    ])
    expect(list).not.toHaveBeenCalled()
  })

  /**
   * 🛑 MEASURED before the filter: a search for « flux » in the Image space answered 32 entries,
   * all of them this cloud's, and the model actually looked for never appeared. A catalogue hit
   * is NOT narrowed the same way — the endpoint answers by likeness, and the letters typed would
   * throw away most of what it found.
   */
  it('keeps its own models out of a search their name does not answer', async () => {
    const registry = registryOf({
      catalog: () => ({
        ...emptyCatalog(),
        search: () =>
          Promise.resolve({
            models: [{ id: 'model_flux', name: 'Flux', capabilities: ['txt23d'] }],
            token: null,
          }),
      }),
      publishedModels: () => [TRIPO_MESH],
    })

    const page = await registry.search({ search: 'flux', family: '3d' })

    expect(page.items.map(item => item.id)).toEqual(['model_flux'])
  })

  /**
   * The narrowing reaches the LOCAL manifests too, and that is intended: a machine holding a
   * dozen models would otherwise answer them all to every word typed.
   */
  it('narrows this machine by the typed words as well', async () => {
    const registry = registryOf({
      catalog: emptyCatalog,
      localModels: () => [localModel({ id: 'qwen-image', name: 'Qwen Image', family: 'image' })],
      isInstalled: () => true,
    })

    expect((await registry.search({ search: 'qwen' })).items.map(one => one.id)).toEqual([
      'qwen-image',
    ])
    expect((await registry.search({ search: 'flux' })).items).toEqual([])
  })

  it('answers its own where the typed words do name one', async () => {
    const registry = registryOf({ catalog: emptyCatalog, publishedModels: () => [TRIPO_MESH] })

    expect((await registry.search({ search: 'tripo' })).items.map(one => one.id)).toEqual([
      TRIPO_MESH.id,
    ])
  })

  it('answers nothing of theirs while no key is held for that cloud', async () => {
    const registry = registryOf({ catalog: emptyCatalog, publishedModels: () => [] })

    expect((await registry.search({ family: '3d' })).items).toEqual([])
  })
})
