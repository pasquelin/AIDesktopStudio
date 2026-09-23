import { describe, expect, it } from 'vitest'
import { readRenderPolicy } from './renderPolicy'

describe('a render policy read off a manifest', () => {
  it('plays an export written before either option existed as it was authored', () => {
    const held = readRenderPolicy({ shadows: true, shadowQuality: 'soft', shadowMapSize: 1024 })

    expect(held.engine).toBe('gl')
    expect(held.csm).toBe(false)
  })

  it('refuses an engine this build has never heard of rather than drawing nothing', () => {
    expect(readRenderPolicy({ engine: 'vulkan' }).engine).toBe('gl')
  })

  it('carries the engine an export names', () => {
    expect(readRenderPolicy({ engine: 'gpu' }).engine).toBe('gpu')
  })
})
