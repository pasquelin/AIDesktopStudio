/**
 * A texture, as plain data. It holds no three.js object and no image: an engine is rebuilt from
 * its serialized state, and what a `.mtlx` stores has to be something a reload can resolve again.
 *
 * The channels themselves are assets of the project, referenced by id. The renderer has no
 * `fs`, and a file path written into a document would stop the project folder from being moved.
 */
import { isRecord, readBoolean, readNumber, readPositive } from '@shared/guards'
import { normalizeAzimuth } from '@shared/domain/angles'
import { readEnvironment, type EnvironmentRef } from '@shared/domain/scene'
import {
  DEFAULT_TEXTURE_MATERIAL,
  PBR_CHANNELS,
  PREVIEW_SHAPES,
  readMaterial,
  type MaterialSettings,
  type PbrChannel,
  type PreviewShape,
} from '@shared/domain/material'
import { clamp } from '@shared/numeric'
import type { TextureSampling } from '@shared/domain/textureSampling'

/**
 * The `MeshStandardMaterial` property a channel feeds. Named here rather than borrowed from the
 * 3D space: the two spaces are independent, and a texture that changed what a scene inspector
 * shows would be a link neither of them asked for.
 */
export type MaterialSlot =
  | 'map'
  | 'normalMap'
  | 'roughnessMap'
  | 'metalnessMap'
  | 'aoMap'
  | 'displacementMap'
  | 'emissiveMap'

const SLOT_BY_CHANNEL: Record<PbrChannel, MaterialSlot | null> = {
  baseColor: 'map',
  normal: 'normalMap',
  roughness: 'roughnessMap',
  metalness: 'metalnessMap',
  ao: 'aoMap',
  height: 'displacementMap',
  emissive: 'emissiveMap',
  edge: null,
}

/** `null` for the cavity mask: three has no slot for it, and it is read in `onBeforeCompile`. */
export function slotFor(channel: PbrChannel): MaterialSlot | null {
  return SLOT_BY_CHANNEL[channel]
}

/**
 * What a channel's pixels ARE, which is what decides the colour space they must be decoded in.
 * Named here rather than answered by the engine with `channel === 'baseColor'`: **two** channels
 * carry colour, and the one that was forgotten came out dark and desaturated.
 *
 * A `data` channel decoded as colour would wash out the normals and lighten the roughness; a
 * `color` channel decoded as data is the same mistake the other way round.
 */
export type ChannelContent = 'color' | 'data'

const CONTENT_BY_CHANNEL: Record<PbrChannel, ChannelContent> = {
  baseColor: 'color',
  // Authored as a colour and read as one by three, exactly like the base map.
  emissive: 'color',
  normal: 'data',
  roughness: 'data',
  metalness: 'data',
  ao: 'data',
  height: 'data',
  edge: 'data',
}

export function contentOf(channel: PbrChannel): ChannelContent {
  return CONTENT_BY_CHANNEL[channel]
}

export type ChannelOrigin = 'generated' | 'derived' | 'imported'

const CHANNEL_ORIGINS: readonly ChannelOrigin[] = ['generated', 'derived', 'imported']

function isChannelOrigin(value: unknown): value is ChannelOrigin {
  return CHANNEL_ORIGINS.some(candidate => candidate === value)
}

/**
 * One channel of a texture. `origin` is what the strip badges, and what tells a derived channel
 * — computed by a shader from another channel of the same texture, and recomputed on demand —
 * from a generated one, which is frozen at what the model answered.
 *
 * What a derived channel was computed *from* is not stored: `sourceFor` answers it from the
 * graph, and a second copy in the file would be free to contradict it.
 */
export type ChannelMap = {
  assetId: string
  origin: ChannelOrigin
  /** On a generated channel, the model that answered. */
  modelId?: string
  width: number
  height: number
  /** Set when the pixels read the other way round — a smoothness map stored as roughness. */
  inverted?: true
  transform?: Pick<MaterialSettings, 'tiling' | 'offset' | 'rotation'>
  sampling?: TextureSampling
}

export type ChannelSet = { [C in PbrChannel]?: ChannelMap }

/** One source per channel: two would leave "recompute what depends on this" with no answer. */
const SOURCE_BY_CHANNEL: Record<PbrChannel, PbrChannel | null> = {
  baseColor: null,
  normal: 'height',
  roughness: 'baseColor',
  metalness: null,
  ao: 'height',
  height: 'baseColor',
  emissive: null,
  edge: null,
}

/** The channel this one is computed from, or `null` when nothing computes it. */
export function sourceFor(channel: PbrChannel): PbrChannel | null {
  return SOURCE_BY_CHANNEL[channel]
}

/** The same rule for the preview, whose two sliders were read unbounded just as those three were. */
export const PREVIEW_BOUNDS = {
  envIntensity: { min: 0, max: 3, step: 0.05 },
}

/** Re-exported so the eight files that read a preview shape from here keep reading it from here. */
export { PREVIEW_SHAPES, type PreviewShape } from '@shared/domain/material'

function isPreviewShape(value: unknown): value is PreviewShape {
  return PREVIEW_SHAPES.some(candidate => candidate === value)
}

/**
 * How many times the map repeats on the preview. A **multiplier over** `material.tiling`, never
 * written into it: judging a repeat and choosing one are two different acts, and a texture whose
 * tiling had been rewritten by a glance would go out into a scene tiled four times over.
 */
export type TilingPreview = 1 | 2 | 4

export const TILING_PREVIEWS: readonly TilingPreview[] = [1, 2, 4]

function isTilingPreview(value: unknown): value is TilingPreview {
  return TILING_PREVIEWS.some(candidate => candidate === value)
}

export type PreviewSettings = {
  shape: PreviewShape
  /** What lights the preview — the same thing a 3D scene is lit by. */
  environment: EnvironmentRef
  envIntensity: number
  /** Radians, around the vertical axis. */
  envRotation: number
  /** Whether the environment is drawn behind the subject, or only lights it. */
  showBackground: boolean
  autoSpin: boolean
  tilingPreview: TilingPreview
  /**
   * Brings the wrap edges of every map into the middle of the preview, by half a width and half
   * a height. A seam is invisible where it falls — on the far side of a sphere, on the edge of a
   * plane — and this is the whole of what makes it visible without touching a pixel.
   */
  showSeam: boolean
}

/** Frozen for the same reason as the material defaults, `environment` being its nested object. */
export const DEFAULT_PREVIEW: PreviewSettings = {
  shape: 'sphere',
  environment: Object.freeze({ kind: 'studio' }),
  envIntensity: 1,
  envRotation: 0,
  showBackground: true,
  autoSpin: false,
  tilingPreview: 1,
  showSeam: false,
}

Object.freeze(DEFAULT_PREVIEW)

/** What a `.mtlx` holds. */
export type MaterialState = {
  channels: ChannelSet
  material: MaterialSettings
  preview: PreviewSettings
}

const DEFAULT_TEXTURE: MaterialState = {
  channels: {},
  material: DEFAULT_TEXTURE_MATERIAL,
  preview: DEFAULT_PREVIEW,
}

/**
 * A texture with nothing in it yet — a copy, never the defaults themselves. The defaults are
 * shared by every document ever opened, and handed out by reference the first slider drag would
 * rewrite what all the others reset to.
 */
export function newMaterial(): MaterialState {
  return structuredClone(DEFAULT_TEXTURE)
}

export function resetMaterial(texture: MaterialState): MaterialState {
  return { ...texture, material: structuredClone(DEFAULT_TEXTURE_MATERIAL) }
}

/**
 * Whether the pixels a channel would be computed from are there. Takes the channels rather than
 * the whole texture: the panel that asks selects nothing else, and the material and the preview
 * change on every frame of every drag.
 */
export function canDerive(channels: ChannelSet, channel: PbrChannel): boolean {
  const from = sourceFor(channel)
  return from !== null && channels[from] !== undefined
}

/** The empty channels, in the order the strip shows them. */
export function missingChannels(texture: MaterialState): PbrChannel[] {
  return PBR_CHANNELS.filter(channel => texture.channels[channel] === undefined)
}

function readChannels(value: unknown): ChannelSet {
  const channels: ChannelSet = {}
  if (!isRecord(value)) return channels
  for (const channel of PBR_CHANNELS) {
    const entry = value[channel]
    if (!isRecord(entry) || typeof entry.assetId !== 'string' || entry.assetId.length === 0) {
      continue
    }

    const stored = isChannelOrigin(entry.origin) ? entry.origin : 'imported'
    const derivable = sourceFor(channel) !== null
    const map: ChannelMap = {
      assetId: entry.assetId,
      origin: stored === 'derived' && !derivable ? 'imported' : stored,
      width: readPositive(entry, 'width', 0),
      height: readPositive(entry, 'height', 0),
    }
    if (typeof entry.modelId === 'string') map.modelId = entry.modelId
    if (entry.inverted === true) map.inverted = true
    const transform = readTransform(entry.transform)
    if (transform) map.transform = transform
    const sampling = readSampling(entry.sampling)
    if (sampling) map.sampling = sampling
    channels[channel] = map
  }
  return channels
}

function readSampling(value: unknown): ChannelMap['sampling'] {
  if (!isRecord(value)) return undefined
  const values = ['channel', 'wrapS', 'wrapT', 'minFilter', 'magFilter']
  if (!values.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))) {
    return undefined
  }
  return {
    channel: Number(value.channel),
    wrapS: Number(value.wrapS),
    wrapT: Number(value.wrapT),
    minFilter: Number(value.minFilter),
    magFilter: Number(value.magFilter),
  }
}

function readTransform(value: unknown): ChannelMap['transform'] {
  if (!isRecord(value)) return undefined
  const material = readMaterial(value)
  return { tiling: material.tiling, offset: material.offset, rotation: material.rotation }
}

function readPreview(value: unknown): PreviewSettings {
  const fallback = DEFAULT_PREVIEW
  if (!isRecord(value)) return structuredClone(fallback)

  return {
    shape: isPreviewShape(value.shape) ? value.shape : fallback.shape,
    environment: readEnvironment(value.environment),
    envIntensity: clamp(
      readPositive(value, 'envIntensity', fallback.envIntensity),
      PREVIEW_BOUNDS.envIntensity.min,
      PREVIEW_BOUNDS.envIntensity.max,
    ),
    envRotation: normalizeAzimuth(readNumber(value, 'envRotation', fallback.envRotation)),
    showBackground: readBoolean(value, 'showBackground', fallback.showBackground),
    autoSpin: readBoolean(value, 'autoSpin', fallback.autoSpin),
    tilingPreview: isTilingPreview(value.tilingPreview)
      ? value.tilingPreview
      : fallback.tilingPreview,
    showSeam: readBoolean(value, 'showSeam', fallback.showSeam),
  }
}

/**
 * The content of a `.mtlx`, read back. It takes what the file layer already handed over — a
 * truncated file never reaches here, `main/project/documents.ts` refuses the envelope first —
 * so there is no `JSON.parse` to guard, only a value of any shape at all.
 *
 * Total, like the other spaces deserialize: a texture written before a setting existed opens on
 * that setting's default, and content that reads as nothing opens blank rather than throwing on
 * the way to the screen.
 */
export function parseMaterial(content: unknown): MaterialState {
  if (!isRecord(content)) return newMaterial()

  return {
    channels: readChannels(content.channels),
    material: readMaterial(content.material),
    preview: readPreview(content.preview),
  }
}
