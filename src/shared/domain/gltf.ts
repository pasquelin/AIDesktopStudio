/**
 * glTF 2.0, as this studio writes and reads it.
 *
 * The open format IS the document for two kinds — the 3D scene and the sky — and a `.gltf` in a
 * project may be either. What settles it is the file's own envelope, which rides in `asset.extras`
 * under the studio's key; nothing about the extension can say.
 *
 * **Two `extras`, and they are not interchangeable.** The ENVELOPE goes in `asset.extras` because
 * `asset` is written first and on one line, so a listing reads a document's identity out of the
 * head of the file without inflating the rest of it. The STATE goes in the root `extras`, where it
 * may weigh whatever it weighs. The specification reserves both for exactly this: § 3.5 says an
 * `extras` property "MAY be defined on any glTF object" and that clients ignore what they do not
 * understand.
 */
import { STUDIO_METADATA_KEY } from './document'
import { isRecord } from '../guards'

export const GLTF_VERSION = '2.0'

export const GLTF_GENERATOR = 'AI Desktop Studio'

/** The one extension the studio writes today, and the one three.js reads on both sides. */
export const KHR_LIGHTS_PUNCTUAL = 'KHR_lights_punctual'

/**
 * How much of a `.gltf` is read to find its envelope. Larger than an OpenRaster head because the
 * whole `asset` object shares that first line, generator string included.
 */
export const GLTF_HEAD_LIMIT = 16 * 1024

/** A rotation, in the order glTF stores one: x, y, z, w. */
export type GltfQuaternion = readonly [number, number, number, number]

/** A translation, a scale, a linear colour: what glTF calls a VEC3, and always three numbers. */
export type GltfVec3 = readonly [number, number, number]

type GltfExtras = Record<string, unknown>

type GltfAsset = { version: string; generator?: string; extras?: GltfExtras }

export type GltfNode = {
  name?: string
  rotation?: GltfQuaternion
  children?: readonly number[]
  extensions?: Record<string, unknown>
  extras?: GltfExtras
}

/** One light of `KHR_lights_punctual`. `color` is LINEAR, which the extension states outright. */
export type GltfPunctualLight = {
  type: 'directional' | 'point' | 'spot'
  name?: string
  color?: readonly number[]
  intensity?: number
}

/** An image the file points at rather than embeds — a `.hdr` beside the document stays a `.hdr`. */
type GltfImage = { uri: string; name?: string }

type GltfScene = { name?: string; nodes?: readonly number[] }

export type GltfDocument = {
  asset: GltfAsset
  scene?: number
  scenes?: readonly GltfScene[]
  nodes?: readonly GltfNode[]
  images?: readonly GltfImage[]
  extensionsUsed?: readonly string[]
  extensions?: Record<string, unknown>
  extras?: GltfExtras
}

/**
 * Whether a payload is glTF at all. `asset.version` is the one field the specification makes
 * required, and it is what tells a real file from a document of ours that still holds the studio's
 * own shape under the same extension.
 */
export function isGltfDocument(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isRecord(value.asset) && typeof value.asset.version === 'string'
}

/** What rides under the studio's own key of an `extras`, or nothing — never a partial object. */
export function gltfStudioExtras(extras: unknown): Record<string, unknown> {
  if (!isRecord(extras)) return {}
  const studio = extras[STUDIO_METADATA_KEY]
  return isRecord(studio) ? studio : {}
}

/**
 * The lights `KHR_lights_punctual` declares at the root, in the order nodes index them.
 *
 * Mapped rather than FILTERED, and the difference is which node gets which light: a node names its
 * light by position in this very list, so dropping an entry that is not an object would shift
 * every light after it onto the wrong node. What is not an object becomes an empty one.
 */
export function gltfPunctualLights(document: unknown): Record<string, unknown>[] {
  if (!isRecord(document) || !isRecord(document.extensions)) return []
  const held = document.extensions[KHR_LIGHTS_PUNCTUAL]
  if (!isRecord(held) || !Array.isArray(held.lights)) return []
  return held.lights.map(light => (isRecord(light) ? light : {}))
}

/**
 * The rotation taking `+Z` onto a unit direction — how a node aims the light it carries.
 *
 * A directional light of `KHR_lights_punctual` travels down its node's `-Z`, so a sun standing in
 * direction `d` is a node whose `+Z` is `d` and whose light therefore shines back down at the
 * ground. Turning that around is the one piece of arithmetic this file exists for.
 */
export function quaternionTowards({
  x,
  y,
  z,
}: {
  x: number
  y: number
  z: number
}): GltfQuaternion {
  const length = Math.hypot(x, y, z)
  if (length === 0) return [0, 0, 0, 1]

  const [unitX, unitY, unitZ] = [x / length, y / length, z / length]
  // Antiparallel: the cross product is the zero vector, so every axis is equally perpendicular and
  // the formula below would answer the zero quaternion. A half turn about Y is the answer, and it
  // is reachable — a sun due south at the horizon aims at exactly `-Z`.
  if (unitZ <= -1 + 1e-9) return [0, 1, 0, 0]

  const norm = Math.hypot(unitY, unitX, 0, 1 + unitZ)
  return [-unitY / norm, unitX / norm, 0, (1 + unitZ) / norm]
}

/** The direction a rotation aims `+Z` at — the way back from a file written anywhere. */
export function directionOfQuaternion(rotation: readonly number[]): {
  x: number
  y: number
  z: number
} {
  const [x, y, z, w] = [rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0, rotation[3] ?? 1]
  return {
    x: 2 * (y * w + z * x),
    y: 2 * (z * y - x * w),
    z: 1 - 2 * (x * x + y * y),
  }
}

/** A turn about the vertical axis, which is what a horizon rotation is. */
export function quaternionAboutY(radians: number): GltfQuaternion {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)]
}

/** The angle a rotation about Y stands for, read back into `[0, 2PI)`. */
export function angleAboutY(rotation: readonly number[]): number {
  const angle = 2 * Math.atan2(rotation[1] ?? 0, rotation[3] ?? 1)
  return angle < 0 ? angle + Math.PI * 2 : angle
}

/**
 * What the studio holds that the standard has no field for, under `STUDIO_METADATA_KEY` in the
 * `extras` of the SCENE — not of the document. A scene's extras are what three carries in
 * `Scene.userData`, so they survive a trip through a loader and an exporter.
 */
export const GLTF_SCENE_STATE = 'scene'

/**
 * Which scene a document opens on. Asked here rather than answered where it is needed: the studio
 * data is read off one scene and the title is stamped onto another the day two answers disagree.
 */
export function defaultSceneIndex(document: unknown): number {
  const at = isRecord(document) ? document.scene : undefined
  return typeof at === 'number' ? at : 0
}

/** The scene a document opens on, or nothing — what carries the studio's own state and its name. */
export function gltfDefaultScene(document: unknown): Record<string, unknown> | null {
  if (!isRecord(document) || !Array.isArray(document.scenes)) return null
  const scene = document.scenes[defaultSceneIndex(document)]
  return isRecord(scene) ? scene : null
}

/** What rides under the studio's own domain, on the default scene, or nothing. */
export function gltfStudioMetadata(value: unknown): Record<string, unknown> {
  return gltfStudioExtras(gltfDefaultScene(value)?.extras)
}

/**
 * The keys an `extras` holds beside the studio's own.
 *
 * A save recomposes `extras` from the state, so what another application left there is dropped —
 * which is why both glTF guards ask this rather than reading root keys alone.
 */
export function gltfForeignExtras(extras: unknown): string[] {
  return isRecord(extras) ? Object.keys(extras).filter(key => key !== STUDIO_METADATA_KEY) : []
}

/** The `asset` fields a save writes back. A `copyright` another application set is not one. */
const COMPOSED_ASSET = new Set(['version', 'generator', 'extras'])

/** The `asset` fields a document carries beyond those, named as a reader of the file would see them. */
export function gltfForeignAsset(document: unknown): string[] {
  const asset = isRecord(document) ? document.asset : null
  if (!isRecord(asset)) return []

  return Object.keys(asset)
    .filter(key => !COMPOSED_ASSET.has(key))
    .map(key => `asset.${key}`)
}

/**
 * Every extension a document names, read from BOTH sides — a file is free to declare one without
 * listing it and the reverse. Both guards overwrite the extension block whole, so what they do not
 * write back is lost; each passes the one it DOES write.
 */
export function gltfForeignExtensions(document: unknown, composed: string): string[] {
  const used =
    isRecord(document) && Array.isArray(document.extensionsUsed)
      ? document.extensionsUsed.map(String)
      : []
  const declared =
    isRecord(document) && isRecord(document.extensions) ? Object.keys(document.extensions) : []

  return [...new Set([...used, ...declared])].filter(name => name !== composed)
}

/**
 * Which textures a glTF material definition asks to wear.
 *
 * Shared because both sides read the same rule from the same files, and a rule spelt twice is
 * two rules the day one is edited: the window compares what a parse produced against what the
 * materials wanted, and the main process takes those very pictures out into the project.
 *
 * Matched by SHAPE rather than against a list of five names: glTF spells every texture slot
 * `…Texture: { index }`, whichever specification added it, so an extension's map is found
 * without this module ever hearing of the extension.
 *
 * A definition is read as data and never trusted for a shape — it comes from a file, and
 * `parser.json` is typed `any` by three.
 */
export function textureSlotsOf(
  materialDef: unknown,
  into: { slot: string; index: number }[] = [],
): { slot: string; index: number }[] {
  if (!isRecord(materialDef)) return into

  for (const [key, value] of Object.entries(materialDef)) {
    if (!isRecord(value)) continue

    if (key.endsWith('Texture') && typeof value.index === 'number') {
      into.push({ slot: key, index: value.index })
    } else textureSlotsOf(value, into)
  }

  return into
}

/** The `materials[index]` of a glTF document, or nothing when the document has no such thing. */
export function materialDefOf(json: unknown, index: number): unknown {
  const materials = isRecord(json) ? json.materials : undefined
  return Array.isArray(materials) ? materials[index] : undefined
}
