import { describe, expect, it, vi } from 'vitest'
import { createGpuTimer } from './gpuTimer'

describe('GPU frame timing', () => {
  it('stays unavailable when the context exposes no timer query', () => {
    const gl = { getExtension: () => null }
    expect(
      createGpuTimer({
        ...gl,
        QUERY_RESULT_AVAILABLE: 3,
        QUERY_RESULT: 4,
        createQuery: () => null,
        beginQuery: () => {},
        endQuery: () => {},
        getQueryParameter: () => 0,
        getParameter: () => false,
        deleteQuery: () => {},
      }),
    ).toBeNull()
  })

  it('publishes a completed non-disjoint query in milliseconds', () => {
    const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }
    const gl = {
      QUERY_RESULT_AVAILABLE: 3,
      QUERY_RESULT: 4,
      getExtension: () => extension,
      createQuery: () => ({}),
      beginQuery: vi.fn(),
      endQuery: vi.fn(),
      getQueryParameter: vi.fn((_query, field) => (field === 3 ? true : 2_500_000)),
      getParameter: () => false,
      deleteQuery: vi.fn(),
    }
    const timer = createGpuTimer(gl)

    timer?.begin()
    timer?.end()

    expect(timer?.read()).toBe(2.5)
  })
})
