import { describe, expect, it, vi } from 'vitest'
import type { Embedder } from '@main/memory/embedder'
import type { AsyncActionIndex } from './actionIndexClient'
import { createActionSearchService } from './actionSearchService'

function indexFixture(model: string | null): {
  index: AsyncActionIndex
  searches: unknown[]
  written: { count: number }
} {
  const searches: unknown[] = []
  const written = { count: 0 }
  return {
    searches,
    written,
    index: {
      rebuild: async corpus => ({
        rebuilt: true,
        count: corpus.actions.length,
        fingerprint: corpus.fingerprint,
      }),
      writeEmbeddings: async embeddings => {
        written.count += embeddings.length
      },
      search: async search => {
        searches.push(search)
        return []
      },
      inspect: async search => {
        searches.push(search)
        return []
      },
      fingerprint: async () => 'fixture',
      embeddingModel: async () => model,
      count: async () => 298,
      close: async () => undefined,
    },
  }
}

function embedderFixture(model: string | null): Embedder {
  return {
    chosen: () => model,
    embed: async texts => texts.map(() => new Float32Array([1, 0])),
    embedQuery: async () => new Float32Array([1, 0]),
    close: async () => undefined,
  }
}

describe('Action search service', () => {
  it('indexes the generated corpus with the shared embedder before semantic search', async () => {
    const fixture = indexFixture(null)
    const service = createActionSearchService({
      userData: '/tmp/action-index-test',
      embedder: embedderFixture('fixture-model'),
      open: async () => fixture.index,
      onTrouble: vi.fn(),
    })
    await service.search('make a project')
    expect(fixture.written.count).toBe(310)
    expect(fixture.searches[0]).toMatchObject({
      query: 'make a project',
      embedding: { model: 'fixture-model' },
    })
  })

  it('keeps lexical search operational when no embedding model is selected', async () => {
    const fixture = indexFixture(null)
    const service = createActionSearchService({
      userData: '/tmp/action-index-test',
      embedder: embedderFixture(null),
      open: async () => fixture.index,
      onTrouble: vi.fn(),
    })
    await service.search('create project', 4)
    expect(fixture.written.count).toBe(0)
    expect(fixture.searches).toEqual([{ query: 'create project', limit: 4 }])
  })

  it('does not label a mixed corpus when the selected model changes between batches', async () => {
    const fixture = indexFixture(null)
    let model = 'model-a'
    let batches = 0
    const embedder = embedderFixture(model)
    embedder.chosen = () => model
    embedder.embed = async texts => {
      batches++
      if (batches === 1) model = 'model-b'
      return texts.map(() => new Float32Array([1, 0]))
    }
    const service = createActionSearchService({
      userData: '/tmp/action-index-test',
      embedder,
      open: async () => fixture.index,
      onTrouble: vi.fn(),
    })
    await service.search('project')
    expect(fixture.written.count).toBe(0)
    expect(fixture.searches).toEqual([{ query: 'project' }])
  })

  it('retries a worker opening that failed transiently', async () => {
    const fixture = indexFixture(null)
    let attempts = 0
    const trouble = vi.fn()
    const service = createActionSearchService({
      userData: '/tmp/action-index-test',
      embedder: embedderFixture(null),
      open: async () => {
        attempts++
        if (attempts === 1) throw new Error('temporarily unavailable')
        return fixture.index
      },
      onTrouble: trouble,
    })
    await expect(service.search('first')).resolves.toEqual([])
    await service.search('second')
    expect(attempts).toBe(2)
    expect(trouble).toHaveBeenCalledWith('temporarily unavailable')
  })
})
