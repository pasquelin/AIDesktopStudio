import { isRecord } from '@shared/guards'
import { glbChunksOf, glbFrom, glbJson } from '@shared/domain/glbContainer'
import { textureSlotsOf } from '@shared/domain/gltf'
import type { ModelTextureUse } from '@shared/domain/asset'
import type { PbrChannel } from '@shared/domain/material'
import { compactBufferViews } from './glbBufferCompaction'

/**
 * How a glTF texture slot maps onto the studio's own channels.
 *
 * Only the slots that mean exactly one channel are here. `metallicRoughnessTexture` is
 * deliberately absent: glTF packs roughness in green and metalness in blue of ONE picture, and
 * the studio stores those as two channels — calling it either would label the pixels wrongly.
 * It still comes out, as a texture with no channel claimed, which is the honest answer until
 * something splits it.
 *
 * Extension slots are matched by their own names, so `KHR_materials_clearcoat` contributes
 * nothing here and its picture is extracted unlabelled rather than mislabelled.
 */
const CHANNEL_OF_SLOT: Record<string, PbrChannel> = {
  baseColorTexture: 'baseColor',
  normalTexture: 'normal',
  occlusionTexture: 'ao',
  emissiveTexture: 'emissive',
}

type ExtractedMaterialSettings = ModelTextureUse['settings']

function textureUse(
  material: unknown,
  materialIndex: number,
  slot: string,
  texture: unknown,
  samplers: unknown[],
): ModelTextureUse {
  const held = isRecord(material) ? material : {}
  const info = textureInfoOf(held, slot)
  return {
    materialIndex,
    materialName: typeof held.name === 'string' ? held.name : `Material ${materialIndex + 1}`,
    slot,
    ...(CHANNEL_OF_SLOT[slot] ? { channel: CHANNEL_OF_SLOT[slot] } : {}),
    sampling: samplingOf(info, texture, samplers),
    settings: materialSettingsOf(held, info),
  }
}

function samplingOf(
  textureInfo: Record<string, unknown>,
  texture: unknown,
  samplers: unknown[],
): ModelTextureUse['sampling'] {
  const heldTexture = isRecord(texture) ? texture : {}
  const samplerIndex = Number.isInteger(heldTexture.sampler) ? Number(heldTexture.sampler) : -1
  const sampler = isRecord(samplers[samplerIndex]) ? samplers[samplerIndex] : {}
  const extension = isRecord(textureInfo.extensions)
    ? textureInfo.extensions.KHR_texture_transform
    : undefined
  const transform = isRecord(extension) ? extension : {}
  return {
    channel: Number.isInteger(transform.texCoord)
      ? Number(transform.texCoord)
      : Number.isInteger(textureInfo.texCoord)
        ? Number(textureInfo.texCoord)
        : 0,
    wrapS: numberOr(sampler.wrapS, 10497),
    wrapT: numberOr(sampler.wrapT, 10497),
    minFilter: numberOr(sampler.minFilter, 9987),
    magFilter: numberOr(sampler.magFilter, 9729),
  }
}

function materialSettingsOf(
  material: Record<string, unknown>,
  textureInfo: Record<string, unknown>,
): ExtractedMaterialSettings {
  const pbr = isRecord(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : {}
  const normal = isRecord(material.normalTexture) ? material.normalTexture : {}
  const occlusion = isRecord(material.occlusionTexture) ? material.occlusionTexture : {}
  const emissiveStrength = isRecord(material.extensions)
    ? material.extensions.KHR_materials_emissive_strength
    : undefined
  const transform = isRecord(textureInfo.extensions)
    ? textureInfo.extensions.KHR_texture_transform
    : undefined
  const textureTransform = isRecord(transform) ? transform : {}
  return {
    color: linearColor(pbr.baseColorFactor, '#ffffff'),
    roughness: unitNumber(pbr.roughnessFactor, 1),
    metalness: unitNumber(pbr.metallicFactor, 1),
    normalScale: numberOr(normal.scale, 1),
    aoIntensity: unitNumber(occlusion.strength, 1),
    emissive: linearColor(material.emissiveFactor, '#000000'),
    emissiveIntensity: isRecord(emissiveStrength)
      ? numberOr(emissiveStrength.emissiveStrength, 1)
      : 1,
    tiling: vector2(textureTransform.scale, 1),
    offset: vector2(textureTransform.offset, 0),
    rotation: numberOr(textureTransform.rotation, 0),
  }
}

function textureInfoOf(value: unknown, slot: string): Record<string, unknown> {
  if (!isRecord(value)) return {}
  for (const [key, child] of Object.entries(value)) {
    if (key === slot && isRecord(child)) return child
    const nested = textureInfoOf(child, slot)
    if (Object.keys(nested).length > 0) return nested
  }
  return {}
}

function vector2(value: unknown, fallback: number): { x: number; y: number } {
  return {
    x: Array.isArray(value) ? numberOr(value[0], fallback) : fallback,
    y: Array.isArray(value) ? numberOr(value[1], fallback) : fallback,
  }
}

function unitNumber(value: unknown, fallback: number): number {
  return Math.min(1, Math.max(0, numberOr(value, fallback)))
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function linearColor(value: unknown, fallback: string): string {
  if (!Array.isArray(value) || value.length < 3) return fallback
  const bytes = value
    .slice(0, 3)
    .map(channel => Math.round(255 * linearToSrgb(unitNumber(channel, 0))))
  return `#${bytes.map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

export type EmbeddedTexture = {
  /** The picture exactly as the file holds it — never re-encoded, so nothing is lost. */
  bytes: Uint8Array
  /** `image/jpeg`, `image/png`… what the file declares, and what names the extension. */
  mimeType: string
  /** Which channel these pixels ARE, when the slot that used them means exactly one. */
  channel?: PbrChannel
  /** The glTF slot it was found in — `baseColorTexture`. Names the asset the studio creates. */
  slot: string
  uses: readonly ModelTextureUse[]
}

function usesByImage(
  materials: unknown[],
  textures: unknown[],
  samplers: unknown[],
): Map<number, ModelTextureUse[]> {
  const uses = new Map<number, ModelTextureUse[]>()
  materials.forEach((material, materialIndex) => {
    for (const found of textureSlotsOf(material)) {
      const source = sourceOf(textures[found.index])
      if (source === undefined) continue
      const use = textureUse(material, materialIndex, found.slot, textures[found.index], samplers)
      const worn = uses.get(source)
      if (worn) worn.push(use)
      else uses.set(source, [use])
    }
  })
  return uses
}

function texturesFrom(
  uses: ReadonlyMap<number, ModelTextureUse[]>,
  images: unknown[],
  bufferViews: unknown[],
  bin: Uint8Array,
): EmbeddedTexture[] {
  const found: EmbeddedTexture[] = []
  for (const [source, image] of images.entries()) {
    const picture = pictureOf(image, bufferViews, bin)
    if (!picture) continue
    const worn = uses.get(source) ?? []
    const slots = worn.map(use => use.slot)
    const channel = channelWornBy(slots)
    found.push({
      ...picture,
      slot: slots[0] ?? `image${source + 1}`,
      uses: worn,
      ...(channel ? { channel } : {}),
    })
  }
  return found
}

/**
 * Every picture a `.glb` carries, with the role its materials give it.
 *
 * Read here rather than in the window, and copied rather than decoded: the bytes are already a
 * JPEG or a PNG, so extracting a texture costs a memcpy instead of a GPU round trip and a
 * re-encode that would soften what the model was painted with.
 *
 * A file this cannot parse yields nothing rather than throwing: it is asked for from a menu row,
 * and a model whose bytes are not a `.glb` is a normal thing to click on.
 */
export function embeddedTextures(file: Uint8Array): EmbeddedTexture[] {
  const chunks = glbChunksOf(file)
  if (!chunks) return []

  const gltf: unknown = glbJson(chunks.json)
  if (!isRecord(gltf)) return []

  const images = Array.isArray(gltf.images) ? gltf.images : []
  const textures = Array.isArray(gltf.textures) ? gltf.textures : []
  const bufferViews = Array.isArray(gltf.bufferViews) ? gltf.bufferViews : []
  // Roles come from material slots; unused images have no role to extract.
  const uses = usesByImage(
    Array.isArray(gltf.materials) ? gltf.materials : [],
    textures,
    Array.isArray(gltf.samplers) ? gltf.samplers : [],
  )
  return texturesFrom(uses, images, bufferViews, chunks.bin)
}

/** Removes every material image and its now-unreferenced binary views from a binary glTF. */
export function withoutEmbeddedTextures(file: Uint8Array): Uint8Array {
  const chunks = glbChunksOf(file)
  if (!chunks) return file
  const parsed = glbJson(chunks.json)
  if (!isRecord(parsed)) return file
  const imageViews = removeExtractedTextureReferences(parsed, chunks.bin)
  if (!imageViews) return file
  const referenced = bufferViewReferences(parsed)
  const removable = new Set([...imageViews].filter(index => !referenced.has(index)))
  const compacted = compactBufferViews(parsed, chunks.bin, removable)
  return glbFrom({
    ...chunks,
    json: new TextEncoder().encode(JSON.stringify(parsed)),
    bin: compacted,
  })
}

function removeExtractedTextureReferences(
  parsed: Record<string, unknown>,
  binary: Uint8Array,
): Set<number> | null {
  const images = Array.isArray(parsed.images) ? parsed.images : []
  const textures = Array.isArray(parsed.textures) ? parsed.textures : []
  const materials = Array.isArray(parsed.materials) ? parsed.materials : []
  const removedImages = new Set(
    images.flatMap((image, index) =>
      pictureOf(image, bufferViewsOf(parsed), binary) ? [index] : [],
    ),
  )
  if (removedImages.size === 0) return null
  const imageViews = new Set(
    [...removedImages].flatMap(index => {
      const image = images[index]
      return isRecord(image) && typeof image.bufferView === 'number' ? [image.bufferView] : []
    }),
  )
  const imageRemap = retainedIndexes(images, removedImages)
  const removedTextures = new Set<number>()
  const keptTextures = textures.filter((texture, index) => {
    const source = sourceOf(texture)
    if (source === undefined || !removedImages.has(source)) {
      remapTextureSource(texture, imageRemap)
      return true
    }
    removedTextures.add(index)
    return false
  })
  const textureRemap = retainedIndexes(textures, removedTextures)

  const keptImages = images.filter((_, index) => !removedImages.has(index))
  parsed.images = keptImages
  parsed.textures = keptTextures
  if (keptImages.length === 0) delete parsed.images
  if (keptTextures.length === 0) {
    delete parsed.textures
    delete parsed.samplers
  }
  for (const material of materials) rewriteTextureSlots(material, textureRemap)
  removeImageBasedLighting(parsed)
  return imageViews
}

function removeImageBasedLighting(parsed: Record<string, unknown>): void {
  if (isRecord(parsed.extensions)) {
    delete parsed.extensions.EXT_lights_image_based
    if (Object.keys(parsed.extensions).length === 0) delete parsed.extensions
  }
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : []
  for (const scene of scenes) {
    if (!isRecord(scene) || !isRecord(scene.extensions)) continue
    delete scene.extensions.EXT_lights_image_based
    if (Object.keys(scene.extensions).length === 0) delete scene.extensions
  }
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (!Array.isArray(parsed[key])) continue
    const kept = parsed[key].filter(name => name !== 'EXT_lights_image_based')
    if (kept.length > 0) parsed[key] = kept
    else delete parsed[key]
  }
}

function bufferViewsOf(gltf: Record<string, unknown>): unknown[] {
  return Array.isArray(gltf.bufferViews) ? gltf.bufferViews : []
}

function retainedIndexes(
  values: readonly unknown[],
  removed: ReadonlySet<number>,
): Map<number, number> {
  const remap = new Map<number, number>()
  let next = 0
  values.forEach((_, index) => {
    if (!removed.has(index)) remap.set(index, next++)
  })
  return remap
}

function remapTextureSource(texture: unknown, remap: ReadonlyMap<number, number>): void {
  if (!isRecord(texture)) return
  if (typeof texture.source === 'number') {
    const next = remap.get(texture.source)
    if (next !== undefined) texture.source = next
  }
  if (!isRecord(texture.extensions)) return
  for (const extension of Object.values(texture.extensions)) {
    if (!isRecord(extension) || typeof extension.source !== 'number') continue
    const next = remap.get(extension.source)
    if (next !== undefined) extension.source = next
  }
}

function rewriteTextureSlots(value: unknown, remap: ReadonlyMap<number, number>): void {
  if (Array.isArray(value)) {
    for (const child of value) rewriteTextureSlots(child, remap)
    return
  }
  if (!isRecord(value)) return

  for (const [key, child] of Object.entries(value)) {
    if (key === 'extras') continue
    if (key.endsWith('Texture') && isRecord(child) && typeof child.index === 'number') {
      const index = remap.get(child.index)
      if (index === undefined) delete value[key]
      else child.index = index
    } else rewriteTextureSlots(child, remap)
  }
}

function bufferViewReferences(value: unknown, found = new Set<number>()): Set<number> {
  if (Array.isArray(value)) {
    for (const child of value) bufferViewReferences(child, found)
    return found
  }
  if (!isRecord(value)) return found

  for (const [key, child] of Object.entries(value)) {
    if (key === 'bufferView' && typeof child === 'number') found.add(child)
    else bufferViewReferences(child, found)
  }
  return found
}

/**
 * What one picture IS, given every slot that wears it — and nothing when they disagree.
 *
 * An ORM export is the ordinary case: one file read as occlusion by one slot and as
 * metal-roughness by another. Labelling it from whichever slot the JSON happens to spell first
 * would file a packed map under `ao`, and "which occlusion maps does this project hold" would
 * answer with a picture that is mostly not one.
 */
function channelWornBy(slots: readonly string[]): PbrChannel | undefined {
  const claimed = new Set(slots.map(slot => CHANNEL_OF_SLOT[slot]))
  const only = [...claimed]

  return claimed.size === 1 ? only[0] : undefined
}

/**
 * Which image a texture reads from — under `source`, or under the extension that replaced it.
 *
 * `KHR_texture_basisu` and `EXT_texture_webp` move `source` inside themselves, and a compressed
 * `.glb` is not an edge case here: `createGltfSource` wires a KTX2 decoder precisely because the
 * studio loads such files. Reading only the top level answered "carries no picture of its own"
 * for a model the viewport was visibly painting.
 */
function sourceOf(texture: unknown): number | undefined {
  if (!isRecord(texture)) return undefined
  if (typeof texture.source === 'number') return texture.source

  const extensions = isRecord(texture.extensions) ? Object.values(texture.extensions) : []
  for (const extension of extensions) {
    if (isRecord(extension) && typeof extension.source === 'number') return extension.source
  }

  return undefined
}

/**
 * One image, bytes and declared type together: a slice of the binary chunk, or what a `data:`
 * URI carries. `image/png` when the file says nothing, which glTF allows.
 *
 * An image pointing at a FILE beside the `.glb` yields nothing. The studio's models come down
 * as single self-contained files, and reading a sibling path out of a document would be reading
 * a path the catalogue never vouched for.
 */
function pictureOf(
  image: unknown,
  bufferViews: unknown[],
  bin: Uint8Array,
): { bytes: Uint8Array; mimeType: string } | null {
  if (!isRecord(image)) return null

  const declared = image.mimeType
  if (typeof image.uri === 'string') return dataPicture(image.uri, declared)

  const mimeType = typeof declared === 'string' ? declared : 'image/png'
  if (typeof image.bufferView !== 'number') return null

  const view = bufferViews[image.bufferView]
  if (!isRecord(view)) return null

  const offset = typeof view.byteOffset === 'number' ? view.byteOffset : 0
  const length = typeof view.byteLength === 'number' ? view.byteLength : 0
  if (length <= 0 || offset + length > bin.byteLength) return null

  return { bytes: bin.subarray(offset, offset + length), mimeType }
}

function dataPicture(
  uri: string,
  declared: unknown,
): { bytes: Uint8Array; mimeType: string } | null {
  const bytes = dataUriBytes(uri)
  if (!bytes) return null
  // Prefer the URI type because glTF permits `mimeType` to be absent for data URIs.
  const carried = /^data:([^;,]+)/.exec(uri)?.[1]
  return { bytes, mimeType: typeof declared === 'string' ? declared : (carried ?? 'image/png') }
}

function dataUriBytes(uri: string): Uint8Array | null {
  const comma = uri.indexOf(',')
  if (!uri.startsWith('data:') || comma === -1 || !uri.slice(0, comma).includes(';base64')) {
    return null
  }

  try {
    return Uint8Array.from(Buffer.from(uri.slice(comma + 1), 'base64'))
  } catch {
    return null
  }
}
