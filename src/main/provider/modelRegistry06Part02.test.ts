import { describe, expect, it, vi } from 'vitest'

import {
  type FieldDescriptor,
  type ModelDescriptor,
  type ModelFamily,
  type ModelOrigin,
} from '@shared/domain/model'

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
  /**
   * 🛑 A model id is STORED — a preference, a panel that was open. Read through the offered list,
   * an id whose key has since been removed fell through to the API: the same
   * `404 Model … not found` the local branch exists to prevent.
   */
  it('still describes one of theirs after its key is taken away', async () => {
    const retrieve = vi.fn()
    const registry = registryOf({
      catalog: () => ({ ...emptyCatalog(), retrieve }),
      publishedModels: () => [],
      publishedModelOf: id => (id === TRIPO_MESH.id ? TRIPO_MESH : null),
    })

    expect((await registry.describe(TRIPO_MESH.id)).id).toBe(TRIPO_MESH.id)
    expect(retrieve).not.toHaveBeenCalled()
  })
})
