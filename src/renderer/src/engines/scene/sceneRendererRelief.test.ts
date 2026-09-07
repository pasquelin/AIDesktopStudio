import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

const applyWorld =
  source.match(/protected applyWorld\(wanted: SceneWorld\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? ''

describe('SceneRenderer.applyWorld and relief', () => {
  it('has a method to read at all, so the rules below cannot pass on an empty string', () => {
    expect(applyWorld).toContain('this.world = wanted')
  })

  it('syncs world.layers onto the relief surface, beside the ground', () => {
    expect(applyWorld).toContain('this.relief.sync(wanted)')
    expect(applyWorld).toContain('this.applyGround()')
  })
})
