/**
 * What a file format can hold of an edited document, and what it would drop.
 *
 * The one place answering « can this format carry what this document contains? ». That answer
 * used to be written per kind in prose, and only the image acted on it — by flattening its stack
 * over the very source file it was opened from.
 */

import { extensionOf } from './fileName'

/**
 * The kind of document a trait and a format belong to. A format only ever answers about traits
 * of its own domain: an `.otio` carries no layer, and the answer for one is « everything lost »
 * rather than « nothing to lose ».
 */
export type CapabilityDomain = 'picture' | 'montage' | 'scene' | 'material' | 'sky'

/** A property of an edited picture that a format either carries or loses. */
export type PictureTrait =
  | 'layers'
  | 'groups'
  | 'layerMask'
  | 'adjustmentLayer'
  | 'liveText'
  /** A shape kept as its geometry rather than as pixels — as lossy to flatten as live text. */
  | 'vectorShape'
  | 'layerTransform'
  | 'blendMode'
  | 'layerOpacity'
  /**
   * A layer the stack HIDES. Flat formats carry no such thing, and the loss is not cosmetic: a
   * document whose only layer is hidden flattens to nothing at all, and used to do it in silence.
   */
  | 'layerVisibility'
  | 'clipping'
  | 'layerLock'
  | 'guides'

export const PICTURE_TRAITS: readonly PictureTrait[] = [
  'layers',
  'groups',
  'layerMask',
  'adjustmentLayer',
  'liveText',
  'vectorShape',
  'layerTransform',
  'blendMode',
  'layerOpacity',
  'layerVisibility',
  'clipping',
  'layerLock',
  'guides',
]

/**
 * The same question for a montage. Measured against the OpenTimelineIO specification rather
 * than guessed — `.claude/spike-otio.md` holds the reading, trait by trait.
 *
 * `trackAudible` is the RESULT of mute and solo, which is what another application is told;
 * which of the two switches produced it is `trackSwitches`, and only this studio reads it back.
 */
export type MontageTrait =
  | 'tracks'
  | 'trackName'
  | 'trackOrder'
  | 'clipPlacement'
  | 'clipTrim'
  | 'clipSpeed'
  | 'mediaLink'
  | 'trackAudible'
  | 'clipFade'
  | 'clipGain'
  | 'clipLink'
  | 'trackSwitches'
  | 'trackLock'
  | 'trackHeight'
  | 'liveScene'
  | 'exactTime'
  | 'frameSize'
  | 'sampleRate'
  | 'editorState'

export const MONTAGE_TRAITS: readonly MontageTrait[] = [
  'tracks',
  'trackName',
  'trackOrder',
  'clipPlacement',
  'clipTrim',
  'clipSpeed',
  'mediaLink',
  'trackAudible',
  'clipFade',
  'clipGain',
  'clipLink',
  'trackSwitches',
  'trackLock',
  'trackHeight',
  'liveScene',
  'exactTime',
  'frameSize',
  'sampleRate',
  'editorState',
]

/**
 * The same question for a 3D scene. Read off what `gltfDocument.ts` actually writes, trait by
 * trait, rather than off the standard: the tree, the names, the placements, the perspective
 * cameras and the punctual lights are glTF fields, and everything else rides in the `extras` of
 * the scene — which the format says a reader may ignore.
 *
 * `ambientLight` is the one that surprises: `KHR_lights_punctual` has no spelling for an ambient
 * or a hemisphere light, so those two travel as studio data while the other three do not.
 */
export type SceneTrait =
  | 'sceneTree'
  | 'nodeName'
  | 'nodePlacement'
  | 'cameraLens'
  | 'punctualLight'
  | 'ambientLight'
  | 'primitiveShape'
  | 'nodeMaterial'
  | 'cameraPath'
  | 'cameraShot'
  | 'sceneAnimation'
  | 'sceneEnvironment'

export const SCENE_TRAITS: readonly SceneTrait[] = [
  'sceneTree',
  'nodeName',
  'nodePlacement',
  'cameraLens',
  'punctualLight',
  'ambientLight',
  'primitiveShape',
  'nodeMaterial',
  'cameraPath',
  'cameraShot',
  'sceneAnimation',
  'sceneEnvironment',
]

/**
 * The same question for a material, measured against the text of the MaterialX 1.39
 * specification — `.claude/spike-materialx.md` holds the reading.
 *
 * `occlusionMap` and `cavityMap` are the two that matter: `standard_surface` has NO input for
 * either, checked against the table in `MaterialX.PBRSpec.md`. They are carried, but only this
 * studio reads them back.
 */
export type MaterialTrait =
  | 'colourMap'
  | 'roughnessMap'
  | 'metalnessMap'
  | 'normalMap'
  | 'heightMap'
  | 'emissiveMap'
  | 'baseTint'
  | 'uvTiling'
  | 'normalScale'
  | 'heightScale'
  | 'emissiveStrength'
  | 'occlusionMap'
  | 'cavityMap'
  | 'valueRanges'
  | 'normalGreenFlip'
  | 'uvRotation'
  | 'channelOrigin'
  | 'previewState'

export const MATERIAL_TRAITS: readonly MaterialTrait[] = [
  'colourMap',
  'roughnessMap',
  'metalnessMap',
  'normalMap',
  'heightMap',
  'emissiveMap',
  'baseTint',
  'uvTiling',
  'normalScale',
  'heightScale',
  'emissiveStrength',
  'occlusionMap',
  'cavityMap',
  'valueRanges',
  'normalGreenFlip',
  'uvRotation',
  'channelOrigin',
  'previewState',
]

/**
 * The same question for a sky, read off `SkyboxContent` field by field.
 *
 * `skyGrading` is the one that behaves unlike the others on the way out: an export bakes it into
 * the pixels rather than carrying it, so it survives as an appearance and never as a setting.
 */
export type SkyTrait =
  | 'skyImage'
  | 'skyGrading'
  | 'sunAngles'
  | 'sunIntensity'
  | 'sunColour'
  | 'environmentIntensity'
  | 'backgroundVisible'
  | 'skyGeneration'

export const SKY_TRAITS: readonly SkyTrait[] = [
  'skyImage',
  'skyGrading',
  'sunAngles',
  'sunIntensity',
  'sunColour',
  'environmentIntensity',
  'backgroundVisible',
  'skyGeneration',
]

export type CapabilityTrait = PictureTrait | MontageTrait | SceneTrait | MaterialTrait | SkyTrait

export const CAPABILITY_TRAITS: readonly CapabilityTrait[] = [
  ...PICTURE_TRAITS,
  ...MONTAGE_TRAITS,
  ...SCENE_TRAITS,
  ...MATERIAL_TRAITS,
  ...SKY_TRAITS,
]

export const TRAITS_OF_DOMAIN: Record<CapabilityDomain, readonly CapabilityTrait[]> = {
  picture: PICTURE_TRAITS,
  montage: MONTAGE_TRAITS,
  scene: SCENE_TRAITS,
  material: MATERIAL_TRAITS,
  sky: SKY_TRAITS,
}

/**
 * A capability from what it CARRIES. `dropped` is the rest of its domain, derived rather than
 * spelt a second time: a trait added to a domain lands in every format's losses at once, where
 * two lists kept by hand let it land in neither and nothing says so.
 */
export function carrying(
  domain: CapabilityDomain,
  interchange: readonly CapabilityTrait[],
  extended: readonly CapabilityTrait[] = [],
): FormatCapability {
  return {
    domain,
    interchange,
    extended,
    dropped: lossesAgainst(TRAITS_OF_DOMAIN[domain], { interchange, extended }),
  }
}

/** A format the studio can write an edited document to. */
export type WritableFormat =
  'png' | 'jpeg' | 'webp' | 'ora' | 'otio' | 'gltf' | 'mtlx' | 'obj' | 'ply' | 'stl'

export const WRITABLE_FORMATS: readonly WritableFormat[] = [
  'png',
  'jpeg',
  'webp',
  'ora',
  'otio',
  'gltf',
  'mtlx',
  'obj',
  'ply',
  'stl',
]

/**
 * Where each trait lands in a given format. The three lists PARTITION the traits — a guard holds
 * it — which is what stops a trait added later from reading as carried when nobody classed it.
 *
 * `interchange` and `extended` is the distinction the whole feature turns on: one says what
 * another application reads, the other what only this studio reads back. Saying « no loss »
 * without that split would promise a round trip through Krita that no format can keep.
 */
export type FormatCapability = {
  domain: CapabilityDomain
  /** Standard in this format, so another application reads it. */
  interchange: readonly CapabilityTrait[]
  /** Carried as studio data alongside the standard part: read back here, invisible elsewhere. */
  extended: readonly CapabilityTrait[]
  /** Not carried at all. Writing this format destroys it. */
  dropped: readonly CapabilityTrait[]
}

/** Nothing survives a flatten, so the three flat formats share one entry. */
const FLAT: FormatCapability = carrying('picture', [])

/**
 * OpenRaster holds a stack of layers with a name, an offset, an opacity, a visibility and a
 * composite operation — and nothing else. Everything past that is Scenario data riding in the
 * same container, which is why a mask survives a save here but not a trip through another editor.
 *
 * `layerTransform` is extended rather than standard on purpose: ORA carries an integer x/y
 * offset, not the rotation, scale and skew a layer here can hold.
 */
const OPEN_RASTER: FormatCapability = carrying(
  'picture',
  ['layers', 'groups', 'blendMode', 'layerOpacity', 'layerVisibility'],
  [
    'layerMask',
    'adjustmentLayer',
    'liveText',
    'vectorShape',
    'layerTransform',
    'clipping',
    'layerLock',
    'guides',
  ],
)

/**
 * OpenTimelineIO holds the STRUCTURE of a cut, and it IS the montage document — there is no
 * spelling of the studio's own left beside it. Everything past that structure rides under the
 * `aidesktopstudio` domain of the metadata, which the core of OTIO carries and never reads.
 *
 * `clipFade` is extended rather than standard, and it is the one interchange loss worth naming:
 * OTIO's `Transition` sits BETWEEN two items and consumes media from both, which a fade held by
 * a clip does not. Writing one as the other would change the cut in the standard part.
 */
const OPEN_TIMELINE: FormatCapability = carrying(
  'montage',
  [
    'tracks',
    'trackName',
    'trackOrder',
    'clipPlacement',
    'clipTrim',
    'clipSpeed',
    'mediaLink',
    'trackAudible',
  ],
  [
    'clipFade',
    'clipGain',
    'clipLink',
    'trackSwitches',
    'trackLock',
    'trackHeight',
    'liveScene',
    'exactTime',
    'frameSize',
    'sampleRate',
    'editorState',
  ],
)

/**
 * glTF IS the scene document, and nothing of it is lost: what the standard has no field for
 * rides in the scene's `extras` under the studio's own key.
 *
 * The split is what the manual promises — a scene opened elsewhere shows its tree, its cameras
 * and its lights, and is poorer than what this studio draws.
 */
const GLTF_SCENE: FormatCapability = carrying(
  'scene',
  ['sceneTree', 'nodeName', 'nodePlacement', 'cameraLens', 'punctualLight'],
  [
    'ambientLight',
    'primitiveShape',
    'nodeMaterial',
    'cameraPath',
    'cameraShot',
    'sceneAnimation',
    'sceneEnvironment',
  ],
)

/**
 * MaterialX holds a `standard_surface` fed by `tiledimage` nodes, and it IS the material
 * document. Everything past that rides in the custom attribute the specification reserves for
 * applications — and requires a reader that does not understand it to preserve.
 *
 * `occlusionMap` and `cavityMap` are extended rather than standard because there is nowhere else
 * to put them: the surface shader declares no input for either, so a map another application
 * would honour cannot be written at all. They come back here and nowhere else.
 */
const MATERIAL_X: FormatCapability = carrying(
  'material',
  [
    'colourMap',
    'roughnessMap',
    'metalnessMap',
    'normalMap',
    'heightMap',
    'emissiveMap',
    'baseTint',
    'uvTiling',
    'normalScale',
    'heightScale',
    'emissiveStrength',
  ],
  [
    'occlusionMap',
    'cavityMap',
    'valueRanges',
    'normalGreenFlip',
    // `tiledimage` carries `uvtiling` and `uvoffset` and no rotation at all — checked against
    // `MaterialX.StandardNodes.md`. The studio's own turn of the map has no standard slot.
    'uvRotation',
    'channelOrigin',
    'previewState',
  ],
)

// OBJ, PLY and STL share these two. All three carry SHAPES and nothing else — no camera, no
// light, no animation, and no `extended` at all, none of them reserving a place for data a reader
// would ignore. They are offered because a 3D printer, a mesh tool and a physics engine read them
// and read little else. `sceneTree` is carried by NONE of the three, and `nodeName` by OBJ alone,
// read off the files 20/08; `nodeMaterial` goes with them, OBJ naming a `.mtl` nothing writes.

/** OBJ, which opens each mesh with `o <name>` — but as a SIBLING: the notation has no nesting. */
const NAMED_SHAPES: FormatCapability = carrying('scene', ['nodeName', 'nodePlacement'])

/**
 * PLY and STL, which name nothing: `element vertex` and `element face` are the FORMAT's own
 * words, so a stack of meshes comes out as one list of vertices and one of faces.
 */
const TRIANGLE_SOUP: FormatCapability = carrying('scene', ['nodePlacement'])

const CAPABILITY_BY_FORMAT: Record<WritableFormat, FormatCapability> = {
  png: FLAT,
  jpeg: FLAT,
  webp: FLAT,
  ora: OPEN_RASTER,
  otio: OPEN_TIMELINE,
  gltf: GLTF_SCENE,
  mtlx: MATERIAL_X,
  obj: NAMED_SHAPES,
  ply: TRIANGLE_SOUP,
  stl: TRIANGLE_SOUP,
}

export const capabilityOf = (format: WritableFormat): FormatCapability =>
  CAPABILITY_BY_FORMAT[format]

const FORMAT_BY_EXTENSION: Record<string, WritableFormat> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.webp': 'webp',
  '.ora': 'ora',
  '.otio': 'otio',
  // `.gltf` only: a `.glb` is what **Exporter** writes of a selection, never a document the
  // studio saves back over.
  '.gltf': 'gltf',
  '.mtlx': 'mtlx',
}

/**
 * Which format a file name says it is, or `null` for one this table does not write.
 *
 * `null` is not « no loss »: it is « no answer », and a caller has to tell the two apart — a
 * `.tif` the studio cannot write is not a container that holds everything.
 */
export function formatOfFile(fileName: string): WritableFormat | null {
  return FORMAT_BY_EXTENSION[extensionOf(fileName).toLowerCase()] ?? null
}

/**
 * What writing `format` would destroy of a document holding `traits` — the question ⌘S asks
 * before it writes over anything. Empty is the licence to overwrite.
 *
 * Read as « what this format does NOT carry » rather than off `dropped`, so a trait of another
 * domain — a layer against an `.otio` — is reported lost instead of silently unclassed.
 *
 * The order given is the order returned: what a document holds is listed the same way twice
 * running, so a message about it does not reshuffle between two saves.
 */
export function lossesFor(
  traits: readonly CapabilityTrait[],
  format: WritableFormat,
): CapabilityTrait[] {
  return lossesAgainst(traits, capabilityOf(format))
}

/**
 * The same answer against a capability that belongs to no writable format — what an EXPORT
 * carries, which is a derivative rather than the document and has no extension to be looked up by.
 */
export function lossesAgainst(
  traits: readonly CapabilityTrait[],
  { interchange, extended }: Pick<FormatCapability, 'interchange' | 'extended'>,
): CapabilityTrait[] {
  return traits.filter(trait => !interchange.includes(trait) && !extended.includes(trait))
}

/**
 * What another application would not see is `dropped` PLUS `extended`, and no function computes
 * it yet: nothing shows that answer to anyone. The split is kept in the table rather than folded
 * away because it is what stops « no loss » from being read as « a whole round trip through
 * Krita » — the day a surface says so, the data is already classed.
 */
