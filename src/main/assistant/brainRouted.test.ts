import { describe, expect, it, vi } from 'vitest'
import type { AssistantAnswer, AssistantThought } from '@shared/domain/assistant'
import { localModel } from '@shared/domain/localModel-fixtures'
import type { AssistantBrain } from './brainPort'
import { createRoutedBrain, type RoutedBrainDeps } from './brainRouted'

const llama = localModel({ id: 'llama3.2:3b', loader: 'ollama', files: [] })

const answering = (say: string): AssistantBrain => ({
  capabilities: async () => ({ streaming: false, structuredJson: true, multimodalImages: false }),
  window: () => Promise.resolve(null),
  think: () => Promise.resolve<AssistantAnswer>({ say, calls: [], cost: 0 }),
})

const thought: AssistantThought = { utterance: 'hello', history: [] }

const routed = (over: Partial<RoutedBrainDeps> = {}) =>
  createRoutedBrain({
    providerOf: () => Promise.resolve(null),
    modelOf: id => (id === llama.id ? llama : null),
    localBrain: () => answering('from this machine'),
    cloudBrain: id => (id === 'a-cloud' ? answering('from the cloud') : null),
    contextOf: () => Promise.resolve(''),
    stateOf: () => Promise.resolve(''),
    memoriesOf: () => Promise.resolve(0),
    foldersOf: () => 'home: /Users/someone',
    ...over,
  })

describe('the routed brain', () => {
  // Read here and never taken from the window, as the context and the state are: `project.create`
  // acts on the path this block spells.
  it('fills in where this machine keeps its folders', async () => {
    const seen: AssistantThought[] = []
    const brain = routed({
      providerOf: () => Promise.resolve({ kind: 'local', modelId: llama.id }),
      localBrain: () => ({
        capabilities: async () => ({
          streaming: false,
          structuredJson: true,
          multimodalImages: false,
        }),
        window: () => Promise.resolve(null),
        think: request => {
          seen.push(request)
          return Promise.resolve<AssistantAnswer>({ say: '', calls: [], cost: 0 })
        },
      }),
      foldersOf: () => 'downloads: /Users/someone/Downloads',
    })

    await brain.think(thought)

    expect(seen[0]?.folders).toBe('downloads: /Users/someone/Downloads')
  })

  it('thinks on the model the manager chose', async () => {
    const brain = routed({
      providerOf: () => Promise.resolve({ kind: 'local', modelId: llama.id }),
    })

    await expect(brain.think(thought)).resolves.toMatchObject({ say: 'from this machine' })
  })

  // By ID and never by name: the wiring owns a table, and a second cloud adds a line to it.
  it('thinks on the cloud the manager chose, found by its id', async () => {
    const brain = routed({
      providerOf: () => Promise.resolve({ kind: 'cloud', providerId: 'a-cloud' }),
    })

    await expect(brain.think(thought)).resolves.toMatchObject({ say: 'from the cloud' })
  })

  /**
   * Raised rather than answered with an empty sentence: the window marks a rejected turn LOST and
   * says so, where an empty answer reads as a model that had nothing to add.
   */
  it('raises when nothing at all serves the assistant', async () => {
    await expect(routed().think(thought)).rejects.toThrow(/nothing serves the assistant/)
  })

  // A choice can name a model a later release dropped. `providerFor` falls back on its own, so
  // this is the belt: it must not reach a brain built over nothing.
  it('raises for a model the catalogue no longer holds', async () => {
    const brain = routed({
      providerOf: () => Promise.resolve({ kind: 'local', modelId: 'gone' }),
    })

    await expect(brain.think(thought)).rejects.toThrow(/not in the catalogue/)
  })

  /**
   * State is ASKED of the window, never taken from the thought: `parseThought` strips a forged
   * one, and a packed mission context must still see the studio as it is.
   */
  it('hands the brain what the project is about and what the studio is', async () => {
    const think = vi.fn(() => Promise.resolve<AssistantAnswer>({ say: '', calls: [], cost: 0 }))
    const brain = routed({
      providerOf: () => Promise.resolve({ kind: 'local', modelId: llama.id }),
      localBrain: () => ({
        think,
        window: () => Promise.resolve(null),
        capabilities: async () => ({
          streaming: false,
          structuredJson: true,
          multimodalImages: false,
        }),
      }),
      contextOf: () => Promise.resolve('World: a forest'),
      stateOf: () => Promise.resolve('Studio now:\n  Space: image.'),
    })

    await brain.think({ utterance: 'hello', history: [] })

    expect(think).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'World: a forest',
        state: 'Studio now:\n  Space: image.',
      }),
      undefined,
    )
  })

  it('keeps a context the main process already packed', async () => {
    const think = vi.fn(() => Promise.resolve<AssistantAnswer>({ say: '', calls: [], cost: 0 }))
    const brain = routed({
      providerOf: () => Promise.resolve({ kind: 'local', modelId: llama.id }),
      localBrain: () => ({
        think,
        window: () => Promise.resolve(null),
        capabilities: async () => ({
          streaming: false,
          structuredJson: true,
          multimodalImages: false,
        }),
      }),
      contextOf: () => Promise.resolve('World: a forest'),
      stateOf: () => Promise.resolve('Studio now:\n  Space: image.'),
    })

    await brain.think({
      utterance: 'next step',
      history: [],
      context: 'packed mission',
      candidates: ['layer.add'],
    })

    expect(think).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'packed mission',
        state: 'Studio now:\n  Space: image.',
        candidates: ['layer.add'],
      }),
      undefined,
    )
  })

  // A model uninstalled, a key removed, a project opened: all of them move the answer, and a turn
  // run on a stale one would reach nothing.
  it('asks who serves the assistant on every turn', async () => {
    const providerOf = vi.fn(() =>
      Promise.resolve<{ kind: 'local'; modelId: string }>({ kind: 'local', modelId: llama.id }),
    )
    const brain = routed({ providerOf })

    await brain.think(thought)
    await brain.think(thought)

    expect(providerOf).toHaveBeenCalledTimes(2)
  })

  it('drops images when the brain selected for the turn is text-only', async () => {
    const think = vi.fn(() => Promise.resolve<AssistantAnswer>({ say: '', calls: [], cost: 0 }))
    const brain = routed({
      providerOf: () => Promise.resolve({ kind: 'local', modelId: llama.id }),
      localBrain: () => ({ ...answering(''), think }),
    })

    await brain.think({
      ...thought,
      images: [{ mimeType: 'image/png', bytes: new Uint8Array([1]) }],
    })

    expect(think).toHaveBeenCalledWith(expect.objectContaining({ images: undefined }), undefined)
  })
})
