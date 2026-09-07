import { describe, expect, it } from 'vitest'

import { createModelRegistry, type ModelRegistry, type RegistryOptions } from './modelRegistry'

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

describe('the pictures a screenful needs', () => {
  const picturing = () => {
    const calls: string[][] = []
    const catalog = () => ({
      list: () => Promise.resolve({ models: [], token: null }),
      search: () => Promise.resolve({ models: [], token: null }),
      retrieve: () => Promise.reject(new Error('unknown model')),
      assetUrls: (assetIds: readonly string[]) => {
        calls.push([...assetIds])
        return Promise.resolve(
          assetIds.map(id => ({ id, url: `https://cdn/${id}`, mimeType: 'image/png' })),
        )
      },
    })
    return { calls, catalog }
  }

  // 🛑 `prune` evicts past `MAX_CACHED` on every write, so a screenful asking for more drew
  // exactly `MAX_CACHED`, the rest evicted by their own siblings. Measured: 77 asked, 64 drawn.
  it('answers every id it fetched, however many its own cache keeps', async () => {
    const many = Array.from({ length: 120 }, (_, at) => `asset_${at}`)
    const { catalog } = picturing()

    const found = await registryOf({ catalog }).previews(many)

    expect(Object.keys(found)).toHaveLength(many.length)
  })

  // An asset the endpoint answers nothing showable for is asked once and not again: the negative
  // is what keeps a picker from spending a round trip per reopen on a model that has no picture.
  it('asks once for one with nothing to show, and not again', async () => {
    const { calls, catalog } = picturing()
    const bare = () => ({
      ...catalog(),
      assetUrls: (ids: readonly string[]) => {
        calls.push([...ids])
        return Promise.resolve(ids.map(id => ({ id })))
      },
    })
    const registry = registryOf({ catalog: bare })

    await registry.previews(['asset_bare'])
    await registry.previews(['asset_bare'])

    expect(calls).toEqual([['asset_bare']])
  })
})
