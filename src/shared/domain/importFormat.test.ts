import { describe, expect, it } from 'vitest'
import {
  IMPORTABLE_ASSET_TYPES,
  IMPORTABLE_EXTENSIONS,
  IMPORTABLE_DOCUMENT_EXTENSIONS,
  importableAssetTypeOf,
  isImportableFile,
} from './importFormat'

describe('import formats', () => {
  it('classifies every format offered by the studio through one table', () => {
    for (const type of IMPORTABLE_ASSET_TYPES) {
      for (const extension of IMPORTABLE_EXTENSIONS[type]) {
        expect(importableAssetTypeOf(`asset.${extension}`)).toBe(type)
      }
    }
  })

  it('accepts case variants and refuses unknown or incomplete names', () => {
    expect(importableAssetTypeOf('Chair.OBJ')).toBe('mesh')
    expect(isImportableFile('notes.txt')).toBe(false)
    expect(isImportableFile('README')).toBe(false)
  })

  it('takes a Collada model as a model and a BVH capture as a motion', () => {
    expect(importableAssetTypeOf('Statue.dae')).toBe('mesh')
    expect(importableAssetTypeOf('walk.bvh')).toBe('animation')
  })

  it('accepts the standard documents the studio writes back to disk', () => {
    for (const extension of IMPORTABLE_DOCUMENT_EXTENSIONS) {
      expect(isImportableFile(`document.${extension}`)).toBe(true)
    }
  })

  it('accepts a montage bundle through the same operating-system door', () => {
    expect(isImportableFile('Bande.otioz')).toBe(true)
  })
})
