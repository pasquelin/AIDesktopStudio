/**
 * Where the studio's work can go, and what it costs to send it there.
 *
 * One entry per (section, target) pair. It answers the three questions a person asks before
 * clicking: what file comes out, how it reaches the other application, and what does not survive
 * the trip. The surfaces read this rather than each holding their own list, so a target added
 * here needs no new component and no new channel.
 */

import {
  capabilityOf,
  carrying,
  lossesAgainst,
  type CapabilityDomain,
  type CapabilityTrait,
  type FormatCapability,
  type MaterialTrait,
} from './formatCapability'
import type { ExportFormat as SceneExportFormat } from './scene'
import type { PbrChannel } from './material'
import {
  bakesRemap,
  channelsWrittenBy,
  writesOneFile,
  type MaterialExportTarget,
} from './materialExport'

/** A (section, target) pair. Named for the section first, so the list reads by surface. */
export type ExportTargetId =
  | 'picture.png'
  | 'picture.psd'
  | 'scene.glb'
  | 'scene.gltf'
  | 'scene.usdz'
  | 'scene.obj'
  | 'scene.ply'
  | 'scene.stl'
  | 'sky.faces'
  | 'sky.hdr'
  | 'sky.exr'
  | 'material.gltf'
  | 'material.unity'
  | 'material.unreal'
  | 'material.roblox'
  | 'material.raw'
  | 'montage.otio'
  | 'montage.otioz'
  | 'montage.edl'
  | 'montage.fcpxml'
  | 'montage.wav'

export const EXPORT_TARGET_IDS: readonly ExportTargetId[] = [
  'picture.png',
  'picture.psd',
  'scene.glb',
  'scene.gltf',
  'scene.usdz',
  'scene.obj',
  'scene.ply',
  'scene.stl',
  'sky.faces',
  'sky.hdr',
  'sky.exr',
  'material.gltf',
  'material.unity',
  'material.unreal',
  'material.roblox',
  'material.raw',
  'montage.otio',
  'montage.otioz',
  'montage.edl',
  'montage.fcpxml',
  'montage.wav',
]

/**
 * How an artefact reaches the application it was written for. The distinction is the whole point
 * of this table: a file that is perfectly valid still opens nothing when nobody declared it.
 *
 * `declared` — the target application registered the extension with the system, so a double-click
 * opens it. `import` — it opens only through the target's own file picker, which works always and
 * costs the person knowing where to click. `script` — the target exposes an automation the studio
 * drives itself.
 */
type ExportDoor = 'declared' | 'import' | 'script'

/**
 * One file the save dialog names, or a folder of files that mean nothing apart — five faces of a
 * sky are not a sky, and a base colour without its ORM is half a material.
 */
type ExportDestination = 'file' | 'folder'

export type ExportTarget = {
  domain: CapabilityDomain
  /** What comes out. Several when one export writes a folder of files under one extension. */
  extension: string
  door: ExportDoor
  destination: ExportDestination
  /**
   * The applications this machine answered for the extension, measured on 2026-08-19 through
   * LaunchServices rather than by reading `CFBundleDocumentTypes` — which misses a target that
   * declares a UTI instead of an extension, and reported nothing for half of these.
   *
   * Informative, and deliberately untested: it describes one machine on one day. What a guard can
   * hold is `door`, which is a decision; this is the evidence behind it.
   */
  openedBy: readonly string[]
  capability: FormatCapability
}

/**
 * A scene leaves as the OBJECTS the viewport draws, never as the document — `sceneExport.ts`
 * hands three.js the copies, so the `extras` a saved `.gltf` carries are not in an export at all.
 *
 * `primitiveShape` is the one that reads oddly: a cube still arrives, as a mesh. What is dropped
 * is that it WAS a cube, which is the trait.
 */
const GLTF_SCENE_EXPORT: FormatCapability = carrying('scene', [
  'sceneTree',
  'nodeName',
  'nodePlacement',
  'cameraLens',
  'punctualLight',
  'nodeMaterial',
  'sceneAnimation',
])

/**
 * The same, minus every light: `USDZExporter` writes meshes, materials and cameras, and holds no
 * spelling for a light at all — read off the exporter of three 0.185, which never tests `isLight`.
 *
 * `sceneAnimation` is dropped for a second reason, and it is the studio's own: `sceneExport.ts`
 * hands the clips to `parseAsync` on the glTF path ALONE, so a USDZ arrives as a still pose.
 */
const USDZ_SCENE_EXPORT: FormatCapability = carrying('scene', [
  'sceneTree',
  'nodeName',
  'nodePlacement',
  'cameraLens',
  'nodeMaterial',
])

/**
 * Six square pictures. The grading is BAKED rather than carried — it survives as an appearance
 * and never as a setting — and everything the sun and the environment hold is left behind.
 */
const SKY_FACES_EXPORT: FormatCapability = carrying('sky', ['skyImage', 'skyGrading'])

const TRAIT_OF_CHANNEL: Record<PbrChannel, MaterialTrait> = {
  baseColor: 'colourMap',
  normal: 'normalMap',
  roughness: 'roughnessMap',
  metalness: 'metalnessMap',
  ao: 'occlusionMap',
  height: 'heightMap',
  emissive: 'emissiveMap',
  edge: 'cavityMap',
}

/**
 * The settings of a material rather than its maps. Only the target that BUILDS a material can
 * write them: `buildMaterial` sets the tint, the normal scale and the emissive strength on a
 * `MeshStandardMaterial`, and `placeTexture` the tiling and the rotation. A folder of pictures
 * has nowhere to put any of it.
 */
const MATERIAL_SETTINGS: readonly CapabilityTrait[] = [
  'baseTint',
  'uvTiling',
  'uvRotation',
  'normalScale',
  'emissiveStrength',
]

/**
 * Derived from the recipes rather than listed beside them: what a texture target carries is
 * exactly the channels it reads, and a sixth engine added to `materialExport` gets its losses for
 * free instead of getting them wrong.
 *
 * Three traits are carried by being BAKED rather than written, and they are classed the same way
 * for it: `valueRanges` when the target bakes the remap, `normalGreenFlip` wherever a normal goes
 * out at all — `resolveComponent` reconciles the convention in the pixels, remap or not.
 */
function materialCapability(target: MaterialExportTarget): FormatCapability {
  const written = channelsWrittenBy(target)
  const interchange: CapabilityTrait[] = written.map(channel => TRAIT_OF_CHANNEL[channel])

  if (bakesRemap(target)) interchange.push('valueRanges')
  if (written.includes('normal')) interchange.push('normalGreenFlip')
  if (writesOneFile(target)) interchange.push(...MATERIAL_SETTINGS)

  return carrying('material', interchange)
}

const TARGETS: Record<ExportTargetId, ExportTarget> = {
  'picture.png': {
    domain: 'picture',
    extension: '.png',
    door: 'declared',
    destination: 'folder',
    openedBy: ['Preview', 'GIMP', 'Safari', 'Firefox', 'Google Chrome'],
    capability: capabilityOf('png'),
  },
  /**
   * The stack rather than the flatten — the one way out of an image that another editor can go
   * on working in.
   *
   * `groups` is DROPPED and it is the loss worth naming: what the writer is handed is already a
   * flat list of surfaces, the tree living in the studio's own field, so a group's children
   * arrive as siblings. Everything past the list below has nowhere to go in what this composer
   * writes — it writes pixels, a name, an opacity and a blend, and nothing else.
   *
   * `layerTransform` was listed here and is not carried: the trait fires for a TURN and never for
   * a move, and `psdBytesOf` writes a `left` and a `top` over pixels handed to it untransformed.
   *
   * Written out rather than derived from ORA's, though the two agree today: `psdBytesOf` is its
   * own writer, so a trait ORA promotes to `interchange` would be claimed here by a table nobody
   * changed. `psdDocument.test.ts` holds this list against what the file actually comes back with.
   */
  'picture.psd': {
    domain: 'picture',
    extension: '.psd',
    door: 'declared',
    destination: 'file',
    openedBy: ['Adobe Photoshop', 'GIMP', 'Preview', 'Affinity Photo'],
    capability: carrying('picture', ['layers', 'blendMode', 'layerOpacity']),
  },
  'scene.glb': {
    domain: 'scene',
    extension: '.glb',
    door: 'declared',
    destination: 'file',
    openedBy: ['Preview'],
    capability: GLTF_SCENE_EXPORT,
  },
  'scene.gltf': {
    domain: 'scene',
    extension: '.gltf',
    door: 'declared',
    destination: 'file',
    openedBy: ['Preview', 'Xcode', 'Google Chrome'],
    capability: GLTF_SCENE_EXPORT,
  },
  'scene.usdz': {
    domain: 'scene',
    extension: '.usdz',
    door: 'declared',
    destination: 'file',
    openedBy: ['Xcode', 'Preview'],
    capability: USDZ_SCENE_EXPORT,
  },
  /**
   * The three shape formats, and what they are FOR: a printer, a mesh tool, a physics engine. Each
   * is `import` rather than `declared` — none of the three is a format this machine hands to an
   * application on a double-click, and saying otherwise would promise an opening that never comes.
   */
  'scene.obj': {
    domain: 'scene',
    extension: '.obj',
    door: 'import',
    destination: 'file',
    openedBy: ['Blender', 'MeshLab'],
    capability: capabilityOf('obj'),
  },
  'scene.ply': {
    domain: 'scene',
    extension: '.ply',
    door: 'import',
    destination: 'file',
    openedBy: ['Blender', 'MeshLab'],
    capability: capabilityOf('ply'),
  },
  'scene.stl': {
    domain: 'scene',
    extension: '.stl',
    door: 'import',
    destination: 'file',
    openedBy: ['Blender', 'MeshLab'],
    capability: capabilityOf('stl'),
  },
  'sky.faces': {
    domain: 'sky',
    extension: '.png',
    door: 'declared',
    destination: 'folder',
    openedBy: ['Preview', 'GIMP', 'Safari', 'Firefox', 'Google Chrome'],
    capability: SKY_FACES_EXPORT,
  },
  /**
   * The same sky as one equirectangular picture, and the reason to want it: an engine lights a
   * scene from a panorama, not from six faces. Both carry the grading BAKED and lose the same
   * settings — what they do not share is range, which is the whole point of writing either.
   *
   * `import` rather than `declared`: nothing on this machine opens a Radiance or an OpenEXR on a
   * double-click, and saying otherwise would promise an opening that never comes.
   */
  'sky.hdr': {
    domain: 'sky',
    extension: '.hdr',
    door: 'import',
    destination: 'file',
    openedBy: ['Blender', 'Unreal Engine', 'Unity'],
    capability: SKY_FACES_EXPORT,
  },
  'sky.exr': {
    domain: 'sky',
    extension: '.exr',
    door: 'import',
    destination: 'file',
    openedBy: ['Blender', 'Nuke', 'DaVinci Resolve'],
    capability: SKY_FACES_EXPORT,
  },
  'material.gltf': {
    domain: 'material',
    extension: '.glb',
    door: 'declared',
    destination: 'folder',
    openedBy: ['Preview'],
    capability: materialCapability('gltf'),
  },
  'material.unity': {
    domain: 'material',
    extension: '.png',
    door: 'import',
    destination: 'folder',
    openedBy: [],
    capability: materialCapability('unity'),
  },
  'material.unreal': {
    domain: 'material',
    extension: '.png',
    door: 'import',
    destination: 'folder',
    openedBy: [],
    capability: materialCapability('unreal'),
  },
  'material.roblox': {
    domain: 'material',
    extension: '.png',
    door: 'import',
    destination: 'folder',
    openedBy: [],
    capability: materialCapability('roblox'),
  },
  'material.raw': {
    domain: 'material',
    extension: '.png',
    door: 'import',
    destination: 'folder',
    openedBy: [],
    capability: materialCapability('raw'),
  },
  /**
   * `import` rather than `declared`, and the two measurements disagree: LaunchServices offers
   * DaVinci Resolve for a `.otio`, while Resolve's own `CFBundleDocumentTypes` lists neither it
   * nor `.otioz`, and Resolve ignores a file handed to it on the command line — it opens its
   * project manager. The picker is what actually works, so that is what this promises.
   */
  'montage.otio': {
    domain: 'montage',
    extension: '.otio',
    door: 'import',
    destination: 'file',
    openedBy: [],
    capability: capabilityOf('otio'),
  },
  /**
   * The same cut with its media inside it, which is what settles the Media Pool: an `.otio` alone
   * arrives in Resolve as a timeline of files it then has to find. Nothing on this machine
   * declares the extension — measured 2026-08-19 — so the picker is the door, as for the `.otio`.
   */
  'montage.otioz': {
    domain: 'montage',
    extension: '.otioz',
    door: 'import',
    destination: 'file',
    openedBy: [],
    capability: capabilityOf('otio'),
  },
  /**
   * The oldest way out, and the one an online room still asks for: an event list of cuts and
   * timecodes. What it carries is the FOUR times of each shot and its reel, and its losses are
   * therefore most of what a montage holds — the format has nowhere to put any of the rest.
   *
   * `tracks` is dropped rather than carried: CMX3600 has one `V` channel and two `A` ones, so a
   * montage's rows do not survive as rows. `clipFade` goes with them — a fade held by a clip is
   * not a transition BETWEEN two shots, which is the only thing the notation can spell.
   */
  'montage.edl': {
    domain: 'montage',
    extension: '.edl',
    door: 'import',
    destination: 'file',
    openedBy: ['DaVinci Resolve', 'Avid Media Composer', 'Adobe Premiere Pro'],
    capability: carrying('montage', ['clipPlacement', 'clipTrim', 'trackOrder', 'mediaLink']),
  },
  /**
   * What Final Cut reads, and what Premiere and Resolve take as an interchange. Unlike an EDL it
   * keeps the TRACKS — a lane per row — and the frame size, the format declaring both.
   *
   * `exactTime` is dropped and it is the one worth naming: FCPXML counts in rationals over the
   * frame rate, so a time the studio holds between two frames comes back rounded to one.
   */
  'montage.fcpxml': {
    domain: 'montage',
    extension: '.fcpxml',
    door: 'import',
    destination: 'file',
    openedBy: ['Final Cut Pro', 'DaVinci Resolve', 'Adobe Premiere Pro'],
    capability: carrying('montage', [
      'tracks',
      'trackOrder',
      'clipPlacement',
      'clipTrim',
      'mediaLink',
      'trackAudible',
      'frameSize',
    ]),
  },
  /**
   * The sound itself, one `.wav` per audible track — what an online room asks for when it will
   * mix somewhere else. Everything the cut DOES to a take is baked into the samples, the way a
   * sky's grading is baked into its faces: carried as sound, never as a setting to change back.
   */
  'montage.wav': {
    domain: 'montage',
    extension: '.wav',
    door: 'declared',
    destination: 'folder',
    openedBy: ['QuickTime Player', 'Music', 'Books'],
    capability: carrying('montage', [
      'tracks',
      'trackName',
      'trackOrder',
      'clipPlacement',
      'clipTrim',
      'clipSpeed',
      'clipFade',
      'clipGain',
      'trackAudible',
      'sampleRate',
    ]),
  },
}

export const exportTargetOf = (id: ExportTargetId): ExportTarget => TARGETS[id]

/**
 * The two unions that named a target before this table existed, mapped onto it. Records rather
 * than a composed `scene.${format}`: a template string types as `string`, and the compiler is
 * what stops a sixth engine from reaching a target nobody declared.
 */
export const SCENE_TARGET_OF_FORMAT: Record<SceneExportFormat, ExportTargetId> = {
  glb: 'scene.glb',
  gltf: 'scene.gltf',
  usdz: 'scene.usdz',
  obj: 'scene.obj',
  ply: 'scene.ply',
  stl: 'scene.stl',
}

export const MATERIAL_TARGET_OF: Record<MaterialExportTarget, ExportTargetId> = {
  gltf: 'material.gltf',
  unity: 'material.unity',
  unreal: 'material.unreal',
  roblox: 'material.roblox',
  raw: 'material.raw',
}

/** The targets one section offers, in the order they were declared. */
export function targetsOfDomain(domain: CapabilityDomain): ExportTargetId[] {
  return EXPORT_TARGET_IDS.filter(id => TARGETS[id].domain === domain)
}

/**
 * What one export may weigh, every file of it together. Read by the writer, which REFUSES past
 * it, and by the window, which has to know before spending minutes producing what would be.
 */
export const MAX_EXPORT_WEIGHT = 512 * 1024 * 1024

/**
 * What sending `traits` to this target would destroy — the sentence a dialog says BEFORE the
 * click, rather than a line in a journal nobody reads afterwards.
 */
export function lossesExportingTo(
  traits: readonly CapabilityTrait[],
  id: ExportTargetId,
): CapabilityTrait[] {
  return lossesAgainst(traits, TARGETS[id].capability)
}
