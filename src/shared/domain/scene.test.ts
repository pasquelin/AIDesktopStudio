import { describe, expect, it } from 'vitest'
import { isTransform, isVector3, modelDressRefOf } from './scene'

const ORIGIN = { x: 0, y: 0, z: 0 }

describe('reading a vector', () => {
  it('recognises three numbered axes', () => {
    expect(isVector3({ x: 1, y: 2, z: 3 })).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isVector3({ x: 1, y: 2 })).toBe(false)
    expect(isVector3({ x: '1', y: 2, z: 3 })).toBe(false)
    expect(isVector3(null)).toBe(false)
    expect(isVector3(4)).toBe(false)
  })
})

describe('reading a transform', () => {
  it('recognises the three vectors a pose is made of', () => {
    expect(isTransform({ position: ORIGIN, rotation: ORIGIN, scale: ORIGIN })).toBe(true)
  })

  it('refuses one whose scale is missing', () => {
    expect(isTransform({ position: ORIGIN, rotation: ORIGIN })).toBe(false)
  })
})

describe('reading a model dress', () => {
  it('keeps the inactive image while materials cover the model', () => {
    expect(
      modelDressRefOf({
        kind: 'materials',
        documentIds: ['material-1'],
        imageAssetId: 'image-1',
      }),
    ).toEqual({
      kind: 'materials',
      documentIds: ['material-1'],
      imageAssetId: 'image-1',
    })
  })
})
