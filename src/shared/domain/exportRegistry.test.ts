import { describe, expect, it } from 'vitest'
import { TRAITS_OF_DOMAIN, type CapabilityTrait } from './formatCapability'
import {
  EXPORT_TARGET_IDS,
  exportTargetOf,
  lossesExportingTo,
  targetsOfDomain,
  type ExportTargetId,
} from './exportRegistry'

const traitsOf = (id: ExportTargetId): CapabilityTrait[] => {
  const { interchange, extended, dropped } = exportTargetOf(id).capability
  return [...interchange, ...extended, ...dropped]
}

describe('the table itself', () => {
  // Every capability here comes from `carrying` now, so these two cannot fail on what is there
  // today: what they still catch is a capability somebody writes out by hand later.
  it('classes every trait of its section exactly once, so none slips in unclassed', () => {
    for (const id of EXPORT_TARGET_IDS) {
      const classed = traitsOf(id)
      expect([id, [...classed].sort()]).toEqual([
        id,
        [...TRAITS_OF_DOMAIN[exportTargetOf(id).domain]].sort(),
      ])
    }
  })

  it('names no trait outside its own section', () => {
    for (const id of EXPORT_TARGET_IDS) {
      const foreign = traitsOf(id).filter(
        trait => !TRAITS_OF_DOMAIN[exportTargetOf(id).domain].includes(trait),
      )
      expect([id, foreign]).toEqual([id, []])
    }
  })

  it('offers each section the targets declared for it, and no other', () => {
    expect(targetsOfDomain('scene')).toEqual([
      'scene.glb',
      'scene.gltf',
      'scene.usdz',
      'scene.obj',
      'scene.ply',
      'scene.stl',
    ])
    expect(targetsOfDomain('sky')).toEqual(['sky.faces', 'sky.hdr', 'sky.exr'])
    expect(targetsOfDomain('montage')).toEqual([
      'montage.otio',
      'montage.otioz',
      'montage.edl',
      'montage.fcpxml',
      'montage.wav',
    ])
  })
})

describe('what an export would destroy', () => {
  it('reports a trait of another section as lost rather than as unclassed', () => {
    expect(lossesExportingTo(['layers'], 'montage.otio')).toEqual(['layers'])
  })

  it('keeps the order the traits were given, so two documents read the same way', () => {
    expect(lossesExportingTo(['cameraShot', 'cameraPath'], 'scene.glb')).toEqual([
      'cameraShot',
      'cameraPath',
    ])
  })

  it('loses nothing of a cut into the format that IS the montage document', () => {
    expect(lossesExportingTo(['tracks', 'clipFade', 'trackLock'], 'montage.otio')).toEqual([])
  })

  it('flattens a stack away into a picture, which is what a flat export means', () => {
    expect(lossesExportingTo(['layers', 'blendMode'], 'picture.png')).toEqual([
      'layers',
      'blendMode',
    ])
  })
})

describe('a scene on its way out, which is the objects and never the document', () => {
  it('drops what only the saved document carries, and keeps what glTF spells', () => {
    expect(lossesExportingTo(['cameraPath', 'sceneEnvironment'], 'scene.glb')).toEqual([
      'cameraPath',
      'sceneEnvironment',
    ])
    expect(lossesExportingTo(['nodePlacement', 'sceneAnimation'], 'scene.glb')).toEqual([])
  })

  it('loses every light into USDZ, which has no spelling for one, and keeps them in glTF', () => {
    expect(lossesExportingTo(['punctualLight'], 'scene.usdz')).toEqual(['punctualLight'])
    expect(lossesExportingTo(['punctualLight'], 'scene.glb')).toEqual([])
  })

  /** `exportObjects` hands the clips to `parseAsync` on the glTF path alone — see `sceneExport`. */
  it('loses the animation into USDZ, which the studio never hands its clips', () => {
    expect(lossesExportingTo(['sceneAnimation'], 'scene.usdz')).toEqual(['sceneAnimation'])
    expect(lossesExportingTo(['sceneAnimation'], 'scene.glb')).toEqual([])
  })
})

describe('a sky on its way out as six faces', () => {
  it('bakes the grading into the pixels and leaves the sun behind', () => {
    expect(lossesExportingTo(['skyGrading'], 'sky.faces')).toEqual([])
    expect(lossesExportingTo(['sunAngles', 'sunIntensity'], 'sky.faces')).toEqual([
      'sunAngles',
      'sunIntensity',
    ])
  })
})

/**
 * Read off the recipes of `materialExport` one by one. Spot assertions on a trait or two passed
 * happily while `channelsWrittenBy` dropped a channel from every target — this is what actually
 * fails when a recipe stops writing something.
 */
const CARRIED: Record<string, readonly CapabilityTrait[]> = {
  'material.gltf': [
    'colourMap',
    'normalMap',
    'occlusionMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'valueRanges',
    'normalGreenFlip',
    'baseTint',
    'uvTiling',
    'uvRotation',
    'normalScale',
    'emissiveStrength',
  ],
  'material.unity': [
    'colourMap',
    'normalMap',
    'metalnessMap',
    'occlusionMap',
    'roughnessMap',
    'emissiveMap',
    'heightMap',
    'valueRanges',
    'normalGreenFlip',
  ],
  'material.unreal': [
    'colourMap',
    'normalMap',
    'occlusionMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'heightMap',
    'valueRanges',
    'normalGreenFlip',
  ],
  'material.roblox': [
    'colourMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'valueRanges',
    'normalGreenFlip',
  ],
  'material.raw': [
    'colourMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'occlusionMap',
    'heightMap',
    'emissiveMap',
    'cavityMap',
    'normalGreenFlip',
  ],
}

it('carries exactly what its recipe writes, target by target, with nothing filtered out', () => {
  for (const [id, expected] of Object.entries(CARRIED)) {
    const carried = exportTargetOf(id as ExportTargetId).capability.interchange
    expect([id, [...carried].sort()]).toEqual([id, [...expected].sort()])
  }
})

/**
 * The one target that builds a `MeshStandardMaterial` rather than a folder of pictures, so it
 * is the only one with anywhere to put a tint or a tiling. Announcing those as lost would be a
 * registry that frightens a person off the format that carries the most.
 */
it('keeps the settings of a material only where a material is actually built', () => {
  expect(lossesExportingTo(['baseTint', 'uvTiling', 'normalScale'], 'material.gltf')).toEqual([])
  expect(lossesExportingTo(['baseTint', 'uvTiling', 'normalScale'], 'material.unity')).toEqual([
    'baseTint',
    'uvTiling',
    'normalScale',
  ])
})

it('carries the cavity mask only into the target that writes every channel', () => {
  expect(lossesExportingTo(['cavityMap'], 'material.raw')).toEqual([])
  expect(lossesExportingTo(['cavityMap'], 'material.unity')).toEqual(['cavityMap'])
})

it('leaves the judged window in the pixels of an engine, and loses it in the raw channels', () => {
  expect(lossesExportingTo(['valueRanges'], 'material.unity')).toEqual([])
  expect(lossesExportingTo(['valueRanges'], 'material.raw')).toEqual(['valueRanges'])
})

it('loses the height glTF has no slot for, and keeps the one Unreal reads', () => {
  expect(lossesExportingTo(['heightMap'], 'material.gltf')).toEqual(['heightMap'])
  expect(lossesExportingTo(['heightMap'], 'material.unreal')).toEqual([])
})

describe('how an artefact reaches the application it was written for', () => {
  it('promises the picker for the montage, the two measurements disagreeing on the double-click', () => {
    expect(exportTargetOf('montage.otio').door).toEqual('import')
  })

  it('names an application for every target it says a double-click opens', () => {
    const silent = EXPORT_TARGET_IDS.filter(
      id => exportTargetOf(id).door === 'declared' && exportTargetOf(id).openedBy.length === 0,
    )
    expect(silent).toEqual([])
  })
})
