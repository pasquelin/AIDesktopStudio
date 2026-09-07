import { describe, expect, it } from 'vitest'

import { localModel } from '@shared/domain/localModel-fixtures'

import { NotAuthenticatedError } from './client'
import { createModelRegistry, type ModelRegistry, type RegistryOptions } from './modelRegistry'

/**
 * The account switch is its own subject, below: everything else is built deaf to it. The local
 * catalogue is empty by default — the cases that care about it hand one in.
 */
export const registryOf = (
  options: Omit<RegistryOptions, 'watch' | 'localModels' | 'translate' | 'isInstalled'> &
    Partial<
      Pick<
        RegistryOptions,
        'localModels' | 'translate' | 'isInstalled' | 'publishedModels' | 'engineFailure'
      >
    >,
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

const rejecting = (error: Error) => {
  const no = () => Promise.reject(error)
  return { list: no, search: no, retrieve: no, assetUrls: () => Promise.resolve([]) }
}

export const refusing = () => rejecting(new NotAuthenticatedError())

describe('a catalogue that refuses', () => {
  // 🛑 Measured on screen, with no account: the first remote page threw and took the local
  // manifests with it — every picker came back empty on a machine holding models it can run.
  it('still answers what this machine holds', async () => {
    const registry = registryOf({
      catalog: refusing,
      localModels: () => [localModel({ id: 'ssd-1b', family: 'image', capabilities: ['txt2img'] })],
    })

    const page = await registry.search({ family: 'image' })

    expect(page.items.map(one => one.id)).toEqual(['ssd-1b'])
    expect(page.refused).toBe('missing')
  })

  /**
   * 🛑 An armed cursor is an invitation, and the window takes it: the follow-up carries a cursor,
   * so the local manifests are skipped, nothing answers, and the refusal comes back — wiping the
   * models that had just appeared. The walk has to report itself finished.
   */
  it('closes the walk rather than inviting a page that cannot come', async () => {
    const registry = registryOf({
      catalog: refusing,
      localModels: () => [localModel({ id: 'ssd-1b', family: 'image', capabilities: ['txt2img'] })],
    })

    expect((await registry.search({ family: 'image' })).cursor).toBeNull()
  })

  // A partial answer that is cached is a partial answer that sticks: the panel would hold the
  // local-only list for the whole TTL after the network came back.
  it('does not remember a walk the cloud cut short', async () => {
    let refusals = 0
    const flaky = () => ({
      list: () => {
        refusals += 1
        return Promise.reject(new Error('not-authenticated'))
      },
      search: () => Promise.reject(new Error('not-authenticated')),
      retrieve: () => Promise.reject(new Error('not-authenticated')),
      assetUrls: () => Promise.resolve([]),
    })
    const registry = registryOf({
      catalog: flaky,
      localModels: () => [localModel({ id: 'ssd-1b', family: 'image', capabilities: ['txt2img'] })],
    })

    await registry.search({ family: 'image' })
    const before = refusals
    await registry.search({ family: 'image' })

    expect(refusals).toBeGreaterThan(before)
  })

  // Codex chose SSD-1B because it was listed, and the job died on a missing engine — measured
  // 2026-09-06. A local model is listed with why it cannot run, so a client can choose elsewhere.
  it('marks every local model unavailable when the engine cannot serve, and says why', async () => {
    const registry = registryOf({
      catalog: refusing,
      localModels: () => [localModel({ id: 'ssd-1b', family: 'image', capabilities: ['txt2img'] })],
      engineFailure: () => 'engine-missing',
    })

    const page = await registry.search({ family: 'image' })

    expect(page.items.map(one => [one.id, one.unavailable])).toEqual([['ssd-1b', 'engine-missing']])
  })

  // 🛑 With nothing local to show, the refusal was THROWN: Electron printed the handler in the
  // terminal, and the assistant's `models.search` answered `failed: missing` to a model with
  // nothing to repair — measured 2026-09-06, Codex by MCP. A page that says why is an answer.
  it('answers an empty page that says why when it has nothing else to offer', async () => {
    const registry = registryOf({ catalog: refusing })

    await expect(registry.search({ family: 'image' })).resolves.toEqual({
      items: [],
      cursor: null,
      refused: 'missing',
    })
  })

  // The journal was fed by the throw: a page that says why must not leave it silent, and a missing
  // account is a state rather than a failure — the one case the journal never heard.
  it('tells the journal of a failure it carries in the page, never of a missing account', async () => {
    const noted: unknown[] = []
    const failing = () => rejecting(new TypeError('fetch failed'))

    await registryOf({ catalog: failing, note: failure => noted.push(failure) }).search({
      family: 'image',
    })
    await registryOf({ catalog: refusing, note: failure => noted.push(failure) }).search({
      family: 'image',
    })

    expect(noted.map(one => (one instanceof Error ? one.message : one))).toEqual([
      'fetch failed',
      'not-authenticated',
    ])
  })
})
