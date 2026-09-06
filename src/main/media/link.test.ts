import { describe, expect, it } from 'vitest'
import { assetTypeOf, linkedAsset, mediaFilters } from './link'

describe('media kind from a file name', () => {
  it('reads a rush as video, whatever the case of its extension', () => {
    expect(assetTypeOf('/Volumes/Rushes/A001_C003.MOV')).toBe('video')
  })

  it('reads a recording as audio and a still as image', () => {
    expect(assetTypeOf('/takes/voice.wav')).toBe('audio')
    expect(assetTypeOf('/plates/sky.jpg')).toBe('image')
  })

  // Without this, only generated models could be imported — which makes no sense for a studio
  // whose whole point is mixing what it makes with what you already have.
  it('reads a model as mesh, whatever the case of its extension', () => {
    expect(assetTypeOf('/props/chair.glb')).toBe('mesh')
    expect(assetTypeOf('/props/chair.GLB')).toBe('mesh')
  })

  it('reads nothing from a file the studio has no editor for', () => {
    expect(assetTypeOf('/notes.txt')).toBeNull()
    expect(assetTypeOf('/no-extension')).toBeNull()
  })

  it('takes the shapes that carry everything they need', () => {
    for (const name of ['chair.obj', 'chair.fbx', 'chair.stl', 'chair.ply', 'chair.usdz']) {
      expect(assetTypeOf(`/props/${name}`)).toBe('mesh')
    }
  })

  /** A glTF is a document of the studio's own, never linked as a flat mesh. */
  it('leaves out a glTF, which is a document', () => {
    expect(assetTypeOf('/props/chair.gltf')).toBeNull()
  })

  /** Its textures beside it are copied on import and folded into the `.glb` the conversion writes. */
  it('takes a Collada model, whose neighbours the import now brings along', () => {
    expect(assetTypeOf('/props/chair.dae')).toBe('mesh')
  })
})

describe('linked asset', () => {
  const asset = linkedAsset('/Volumes/Rushes/A001_C003.MOV', {
    id: 'asset-1',
    type: 'video',
    now: '2026-08-07T10:00:00.000Z',
  })

  it('is named after the file, without its extension', () => {
    expect(asset.name).toBe('A001_C003')
  })

  it('records where the file is, and nothing inside the project', () => {
    // Linked, never copied: a twenty-minute 4K rush is twenty gigabytes.
    expect(asset.sourcePath).toBe('/Volumes/Rushes/A001_C003.MOV')
    expect(asset.path).toBeUndefined()
  })

  it('is local, since the file sits on this machine', () => {
    expect(asset.location).toBe('local')
  })
})

describe('import dialog filters', () => {
  const labels = {
    all: 'Tous les médias',
    video: 'Vidéo',
    audio: 'Audio',
    image: 'Image',
    mesh: 'Modèle 3D',
    animation: 'Animation',
  }

  it('offers every media kind first, then one filter per kind, in the user language', () => {
    expect(mediaFilters(labels).map(filter => filter.name)).toEqual([
      'Tous les médias',
      'Vidéo',
      'Audio',
      'Image',
      'Modèle 3D',
      'Animation',
    ])
  })

  it('lists extensions without a leading dot, which the dialog rejects', () => {
    expect(mediaFilters(labels)[1]?.extensions).not.toContain('.mp4')
    expect(mediaFilters(labels)[1]?.extensions).toContain('mp4')
  })

  it('offers every kind in the first filter, so one pick can mix rushes and takes', () => {
    expect(mediaFilters(labels)[0]?.extensions).toEqual(
      expect.arrayContaining(['mov', 'mxf', 'wav', 'aiff', 'png', 'ora', 'hdr', 'obj', 'dae', 'bvh']),
    )
  })
})
