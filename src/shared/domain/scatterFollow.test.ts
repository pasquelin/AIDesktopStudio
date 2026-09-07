import { describe, expect, it } from 'vitest'
import { scatterLayer, type ScatterLayer } from './scatter'
import { scatterPosesOf, type ScatterGround } from './scatterGenerate'
import { scatterLayerRebuildOf, scatterPosesAfterSculpt, scatterRebuildOf } from './scatterFollow'

const terrain = {
  origin: { x: 0, z: 0 },
  size: { x: 64, z: 64 },
  elevation: { min: 0, max: 1 },
  grain: 64,
  samples: { width: 65, height: 65 },
}

const dirtied = [{ column: 0, row: 0 }]

describe('scatterRebuildOf', () => {
  it('leaves poses untouched when follow is none, even after a sculpt', () => {
    expect(scatterRebuildOf('none', dirtied, terrain)).toEqual({ kind: 'none' })
  })

  it('rebuilds only the dirtied brush region when follow is brush', () => {
    const held = scatterRebuildOf('brush', dirtied, terrain)
    expect(held.kind).toBe('brush')
    if (held.kind !== 'brush') return
    expect(held.region.minX).toBe(0)
    expect(held.region.minZ).toBe(0)
    expect(held.region.maxX).toBeGreaterThan(0)
    expect(held.region.maxX).toBeGreaterThanOrEqual(64)
  })

  it('rebuilds the whole layer when follow is layer and anything moved', () => {
    expect(scatterRebuildOf('layer', dirtied, terrain)).toEqual({ kind: 'all' })
    expect(scatterRebuildOf('layer', [], terrain)).toEqual({ kind: 'none' })
  })

  it('keeps previous poses on none, replaces the brush region, and regenerates all on layer', () => {
    const layer = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 20, z: 20 },
    })
    const low: ScatterGround = {
      heightAt: () => 1,
      slopeAt: () => ({ degrees: 0, nx: 0, ny: 1, nz: 0 }),
    }
    const high: ScatterGround = {
      heightAt: () => 8,
      slopeAt: () => ({ degrees: 0, nx: 0, ny: 1, nz: 0 }),
    }
    const previous = scatterPosesOf(layer, { minX: 0, minZ: 0, maxX: 20, maxZ: 20 }, low)
    expect(previous.length).toBeGreaterThan(0)
    expect(scatterPosesAfterSculpt(layer, previous, { kind: 'none' }, high)).toEqual(previous)
    const brushed = scatterPosesAfterSculpt(
      layer,
      previous,
      { kind: 'brush', region: { minX: 0, minZ: 0, maxX: 8, maxZ: 8 } },
      high,
    )
    const outside = previous.filter(pose => pose.x >= 8 || pose.z >= 8)
    expect(brushed.filter(pose => pose.x >= 8 || pose.z >= 8)).toEqual(outside)
    expect(
      scatterPosesAfterSculpt(layer, previous, { kind: 'all' }, high).every(pose => pose.y === 8),
    ).toBe(true)
  })
})

describe('scatterLayerRebuildOf', () => {
  it('keeps rendered cells for metadata-only changes', () => {
    const before = scatterLayer({ id: 'trees', name: 'Trees', locked: false, collision: false })
    if (before.category !== 'props') throw new Error('expected props')

    expect(scatterLayerRebuildOf(before, { ...before, name: 'Forest' })).toEqual({ kind: 'none' })
    expect(scatterLayerRebuildOf(before, { ...before, locked: true })).toEqual({ kind: 'none' })
    expect(scatterLayerRebuildOf(before, { ...before, collision: true })).toEqual({ kind: 'none' })
  })

  it('rebuilds all cells when placement inputs change', () => {
    const before = scatterLayer({ id: 'trees' })

    expect(scatterLayerRebuildOf(before, { ...before, seed: before.seed + 1 })).toEqual({
      kind: 'all',
    })
    expect(
      scatterLayerRebuildOf(before, {
        ...before,
        rules: { ...before.rules, density: before.rules.density + 1 },
      }),
    ).toEqual({ kind: 'all' })
    expect(scatterLayerRebuildOf(before, { ...before, followRelief: 'none' })).toEqual({
      kind: 'all',
    })
  })

  it('limits a painted-mask edit to the changed chunk region', () => {
    const before = scatterLayer({
      id: 'trees',
      origin: { x: 10, z: 20 },
      size: { x: 256, z: 256 },
      grain: 64,
      mask: { kind: 'painted', weights: { chunks: [] } },
    })
    const after: ScatterLayer = {
      ...before,
      mask: {
        kind: 'painted',
        weights: { chunks: [{ column: 1, row: 2, payload: 'changed' }] },
      },
    }

    const rebuild = scatterLayerRebuildOf(before, after)
    expect(rebuild.kind).toBe('brush')
    if (rebuild.kind !== 'brush') return
    expect(rebuild.region.minX).toBeCloseTo(73.749)
    expect(rebuild.region.minZ).toBeCloseTo(148)
    expect(rebuild.region.maxX).toBeCloseTo(139.004)
    expect(rebuild.region.maxZ).toBeCloseTo(213.255)
  })
})
