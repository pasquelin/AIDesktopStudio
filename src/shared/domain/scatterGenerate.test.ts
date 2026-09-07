import { describe, expect, it } from 'vitest'
import { scatterLayer, SCATTER_SPACING } from './scatter'
import { scatterHash, scatterPosesOf, type ScatterGround } from './scatterGenerate'
import { layerRegion } from './scatterFollow'
import { FLAT_SCATTER_GROUND } from './scatterGround'

const flat: ScatterGround = {
  heightAt: () => 2,
  slopeAt: () => ({ degrees: 0, nx: 0, ny: 1, nz: 0 }),
}

const region = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 }

function pines(seed = 7) {
  return scatterLayer({
    id: 'pines',
    seed,
    origin: { x: 0, z: 0 },
    size: { x: 20, z: 20 },
    assets: [
      { assetId: 'pine', weight: 2 },
      { assetId: 'oak', weight: 1 },
    ],
    rules: {
      density: 0.5,
      spacing: 2,
      minScale: 0.8,
      maxScale: 1.2,
      randomRotation: true,
      randomTilt: 5,
      slopeAlign: 0,
      altitudeMin: -10,
      altitudeMax: 10,
      slopeMin: 0,
      slopeMax: 90,
    },
  })
}

describe('scatterHash', () => {
  it('answers the same unit for the same cell, independently of call order', () => {
    expect(scatterHash(7, 3, 4, 1)).toBe(scatterHash(7, 3, 4, 1))
    expect(scatterHash(7, 3, 4, 1)).not.toBe(scatterHash(7, 3, 5, 1))
    expect(scatterHash(7, 3, 4, 1)).not.toBe(scatterHash(8, 3, 4, 1))
  })
})

describe('scatterPosesOf', () => {
  it('reproduces the same poses for the same seed, rules and region', () => {
    const first = scatterPosesOf(pines(), region, flat)
    const second = scatterPosesOf(pines(), region, flat)
    expect(first.length).toBeGreaterThan(0)
    expect(second).toEqual(first)
  })

  it('keeps poses in one region when a neighbour is generated alone', () => {
    const layer = pines()
    const left = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 }
    const right = { minX: 10, minZ: 0, maxX: 20, maxZ: 10 }
    const together = scatterPosesOf(layer, { minX: 0, minZ: 0, maxX: 20, maxZ: 10 }, flat)
    const onlyRight = scatterPosesOf(layer, right, flat)
    const leftTogether = together.filter(pose => pose.x < 10)
    const rightTogether = together.filter(pose => pose.x >= 10)
    expect(scatterPosesOf(layer, left, flat)).toEqual(leftTogether)
    expect(onlyRight).toEqual(rightTogether)
  })

  it('drops points outside the altitude and slope windows', () => {
    expect(
      scatterPosesOf(pines(), region, {
        heightAt: () => 50,
        slopeAt: () => ({ degrees: 0, nx: 0, ny: 1, nz: 0 }),
      }),
    ).toEqual([])
    expect(
      scatterPosesOf(
        scatterLayer({ ...pines(), rules: { ...pines().rules, slopeMax: 10 } }),
        region,
        {
          heightAt: () => 2,
          slopeAt: () => ({ degrees: 80, nx: 0.8, ny: 0.6, nz: 0 }),
        },
      ),
    ).toEqual([])
  })

  it('picks no pose when density is zero or no asset is named', () => {
    expect(
      scatterPosesOf(
        scatterLayer({ ...pines(), rules: { ...pines().rules, density: 0 } }),
        region,
        flat,
      ),
    ).toEqual([])
    expect(scatterPosesOf(scatterLayer({ ...pines(), assets: [] }), region, flat)).toEqual([])
  })

  it('keeps neighbouring poses at least half a spacing apart', () => {
    const poses = scatterPosesOf(pines(), region, flat)
    const spacing = pines().rules.spacing
    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        const dx = (poses[i]?.x ?? 0) - (poses[j]?.x ?? 0)
        const dz = (poses[i]?.z ?? 0) - (poses[j]?.z ?? 0)
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(spacing * 0.5 - 1e-6)
      }
    }
  })

  it('keeps the same asset at a cell when the neighbour is rebuilt', () => {
    const layer = pines()
    const left = scatterPosesOf(layer, region, flat)
    scatterPosesOf(layer, { minX: 10, minZ: 0, maxX: 20, maxZ: 10 }, flat)
    expect(scatterPosesOf(layer, region, flat)).toEqual(left)
  })

  it('places fewer poses than density times area when spacing is coarse', () => {
    const layer = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      size: { x: 100, z: 100 },
      rules: { ...pines().rules, density: 1, spacing: 10 },
    })
    const count = scatterPosesOf(layer, layerRegion(layer), FLAT_SCATTER_GROUND).length
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(layer.rules.density * layer.size.x * layer.size.z)
  })
})

describe('what the ground says about a pose', () => {
  it('walks the slider own step when the spacing is zero', () => {
    const zero = scatterLayer({ ...pines(), rules: { ...pines().rules, spacing: 0 } })
    const stepped = scatterLayer({ ...pines(), rules: { ...pines().rules, spacing: 0.1 } })

    // A step of 1e-3 walked 65 billion cells of a 256 m region and hung the renderer thread.
    expect(scatterPosesOf(zero, region, flat)).toEqual(scatterPosesOf(stepped, region, flat))
  })

  // The generator raises anything under its floor. The slider used to reach 0, so a whole notch
  // of it did nothing; this keeps the published bound and the floor from parting again.
  it('offers no spacing the generator would silently raise', () => {
    expect(SCATTER_SPACING.min).toBeGreaterThanOrEqual(SCATTER_SPACING.step)
  })
})
