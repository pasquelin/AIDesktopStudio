import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD, scatterLayer } from '@shared/domain/scene'
import { SCATTER_COLLISION_CAP } from '@shared/domain/scatter'
import type { ScatterGround } from '@shared/domain/scatterGenerate'
import { scatterCollisionOf } from './scatterCollision'

const flat: ScatterGround = {
  heightAt: () => 3,
  slopeAt: () => ({ degrees: 0, nx: 0, ny: 1, nz: 0 }),
}

describe('scatterCollisionOf', () => {
  it('builds one fixed capsule per generated pose when collision is enabled', () => {
    const layer = scatterLayer({
      id: 'trees',
      collision: true,
      assets: [{ assetId: 'pine', weight: 1 }],
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 1, spacing: 2 },
    })
    const result = scatterCollisionOf({ ...DEFAULT_WORLD, layers: [layer] }, flat)
    expect(result.refused).toEqual([])
    expect(result.bodies.length).toBeGreaterThan(1)
    expect(result.bodies[0]).toMatchObject({
      body: 'world.scatter.trees.0',
      kind: 'fixed',
      shape: { kind: 'capsule' },
    })
  })

  it('fills up to the safety cap and reports only the poses it refused', () => {
    const layer = scatterLayer({
      id: 'forest',
      collision: true,
      assets: [{ assetId: 'pine', weight: 1 }],
      size: { x: SCATTER_COLLISION_CAP + 1, z: 1 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 1, spacing: 1 },
    })
    const result = scatterCollisionOf({ ...DEFAULT_WORLD, layers: [layer] }, flat)
    expect(result.bodies).toHaveLength(SCATTER_COLLISION_CAP)
    expect(result.refused).toEqual([{ layerId: 'forest', count: 1 }])
  })
})
