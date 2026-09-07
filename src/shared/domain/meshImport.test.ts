import { describe, expect, it } from 'vitest'
import { convertedTypeOf, isMeshImportLoss, needsMeshConversion } from './meshImport'

describe('convertedTypeOf', () => {
  it('keeps a Mixamo FBX — a skinned character and its walk — the motion it was filed as', () => {
    expect(convertedTypeOf('animation', { meshes: 1, clips: 1 })).toBe('animation')
  })

  it('keeps an animated prop the model it was filed as', () => {
    expect(convertedTypeOf('mesh', { meshes: 3, clips: 2 })).toBe('mesh')
  })

  it('makes a model of a file filed as a motion that holds no clip', () => {
    expect(convertedTypeOf('animation', { meshes: 1, clips: 0 })).toBe('mesh')
  })

  it('makes a motion of a file filed as a model that holds bones and clips but no mesh', () => {
    expect(convertedTypeOf('mesh', { meshes: 0, clips: 1 })).toBe('animation')
  })

  it('leaves an empty file where it was filed', () => {
    expect(convertedTypeOf('mesh', { meshes: 0, clips: 0 })).toBe('mesh')
  })
})

describe('needsMeshConversion', () => {
  const row: Parameters<typeof needsMeshConversion>[0] = { location: 'local', type: 'mesh' }

  it('names every local 3D file that is not yet a glb, model or motion alike', () => {
    expect(needsMeshConversion({ ...row, path: 'models/robot.fbx' })).toBe(true)
    expect(needsMeshConversion({ ...row, path: 'models/robot.USDZ' })).toBe(true)
    expect(
      needsMeshConversion({ ...row, type: 'animation', path: 'anim/walk/animation.bvh' }),
    ).toBe(true)
  })

  it('leaves a glb, a converted row, a cloud row and every other kind alone', () => {
    expect(needsMeshConversion({ ...row, path: 'models/robot.glb' })).toBe(false)
    expect(needsMeshConversion({ ...row, path: 'models/robot.fbx', convertedFrom: 'x.fbx' })).toBe(
      false,
    )
    expect(needsMeshConversion({ ...row, location: 'cloud', path: 'models/robot.fbx' })).toBe(false)
    expect(needsMeshConversion({ ...row, type: 'image', path: 'pictures/robot.png' })).toBe(false)
    expect(needsMeshConversion(row)).toBe(false)
  })
})

describe('isMeshImportLoss', () => {
  it('reads the stored word back, and refuses one this build does not know', () => {
    expect(isMeshImportLoss('textures')).toBe(true)
    expect(isMeshImportLoss('variants')).toBe(false)
    expect(isMeshImportLoss(3)).toBe(false)
  })
})
