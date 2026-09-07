import { describe, expect, it } from 'vitest'
import { characterExtrasOf, isWorkshopId, workshopAssetOf, workshopIdOf } from './character'

describe('character material dress', () => {
  it('reads a complete dress and drops a malformed one from the model metadata', () => {
    expect(
      characterExtrasOf({
        aidesktopstudio: { dress: { kind: 'materials', documentIds: ['material-1'] } },
      })?.dress,
    ).toEqual({ kind: 'materials', documentIds: ['material-1'] })

    expect(
      characterExtrasOf({ aidesktopstudio: { dress: { kind: 'materials', documentIds: [4] } } }),
    ).toBeNull()
  })
})

describe('workshop id', () => {
  it('recognises the workshop it minted for an asset, and no ordinary document id', () => {
    expect(isWorkshopId(workshopIdOf('asset-hero'))).toBe(true)
    expect(isWorkshopId('scene-42')).toBe(false)
  })

  it('hands the asset back from the workshop it minted, and nothing from another document', () => {
    expect(workshopAssetOf(workshopIdOf('asset-hero'))).toBe('asset-hero')
    expect(workshopAssetOf('scene-42')).toBeNull()
  })
})
