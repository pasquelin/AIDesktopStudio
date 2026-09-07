import {
  DataTexture,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  type MeshStandardMaterial,
  type Texture,
} from 'three'
import { assetUrl, versionedUrl } from '@shared/domain/asset'
import type { GroundPaint } from '@shared/domain/groundPaint'
import {
  GROUND_MATERIAL_CHANNELS,
  type GroundMaterialLayer,
  type ReliefLayer,
} from '@shared/domain/scene'
import { loadTexture, type PictureOrientation, type TextureSource } from './textureCache'
import { bindReliefSplat, clearReliefSplat, type ReliefSplatUniforms } from './reliefSplatShader'

export type ReliefGroundMaterial = {
  material: MeshStandardMaterial
  groundAssetId: string | null
  groundGeneration: number
  groundTextures?: readonly Texture[]
  groundUniforms?: ReliefSplatUniforms
}

type Options = {
  loadGround?: TextureSource
  assetVersion?: (assetId: string) => string | undefined
  onReady?: () => void
  onFailure?: (assetId: string, error: unknown) => void
  keepLiveWeights?: boolean
}

export function applyGroundPaint(
  terrain: ReliefGroundMaterial | undefined,
  paint: GroundPaint,
): void {
  if (!terrain?.groundUniforms) return
  terrain.groundGeneration += 1
  const texture = paintTexture(paint)
  const previous = terrain.groundUniforms.weights.value
  previous.dispose()
  terrain.groundUniforms.weights.value = texture
  const owned = terrain.groundTextures ?? []
  terrain.groundTextures = owned.some(candidate => candidate === previous)
    ? owned.map(candidate => (candidate === previous ? texture : candidate))
    : [...owned, texture]
}

export function syncGroundMaterial(
  terrain: ReliefGroundMaterial,
  layer: ReliefLayer,
  options: Options,
): void {
  const signature = groundSignature(layer)
  if (signature === terrain.groundAssetId) return
  if (
    options.keepLiveWeights &&
    terrain.groundUniforms?.weights.value instanceof DataTexture &&
    layer.groundWeights &&
    layer.groundMaterials.length > 0
  ) {
    terrain.groundAssetId = signature
    terrain.groundGeneration += 1
    return
  }
  terrain.groundAssetId = signature
  const token = ++terrain.groundGeneration
  if (!layer.groundWeights || layer.groundMaterials.length === 0) {
    syncLegacy(terrain, layer.groundMaterials[0]?.albedo.assetId ?? null, token, options)
    return
  }
  void loadSplat(terrain, layer, token, options)
}

export function disposeGroundMaterial(terrain: ReliefGroundMaterial): void {
  disposeTextures(terrain.groundTextures ?? [])
  terrain.groundTextures = undefined
  terrain.groundUniforms = undefined
  terrain.material.map?.dispose()
}

function syncLegacy(
  terrain: ReliefGroundMaterial,
  assetId: string | null,
  token: number,
  options: Options,
): void {
  disposeTextures(terrain.groundTextures ?? [])
  terrain.groundTextures = undefined
  terrain.groundUniforms = undefined
  clearReliefSplat(terrain.material)
  if (!assetId) {
    terrain.material.map?.dispose()
    terrain.material.map = null
    terrain.material.needsUpdate = true
    return
  }
  void loadLegacy(terrain, assetId, token, options)
}

async function loadLegacy(
  terrain: ReliefGroundMaterial,
  assetId: string,
  token: number,
  options: Options,
): Promise<void> {
  try {
    const texture = await groundTexture(assetId, options, SRGBColorSpace)
    if (token !== terrain.groundGeneration) {
      texture.dispose()
      return
    }
    terrain.material.map?.dispose()
    terrain.material.map = texture
    terrain.material.needsUpdate = true
    options.onReady?.()
  } catch (error) {
    if (token === terrain.groundGeneration) options.onFailure?.(assetId, error)
  }
}

async function loadSplat(
  terrain: ReliefGroundMaterial,
  layer: ReliefLayer,
  token: number,
  options: Options,
): Promise<void> {
  const layers = orderedLayers(layer.groundMaterials)
  const ids = splatIds(layers, layer.groundWeights?.assetId)
  try {
    const loaded = await loadGroundTextures(ids, options)
    if (token !== terrain.groundGeneration) {
      disposeTextures(loaded)
      return
    }
    installSplat(terrain, loaded, layers)
    options.onReady?.()
  } catch (error) {
    if (token === terrain.groundGeneration) options.onFailure?.(ids[0]?.id ?? '', error)
  }
}

async function loadGroundTextures(
  ids: readonly GroundTextureId[],
  options: Options,
): Promise<readonly Texture[]> {
  const results = await Promise.allSettled(
    ids.map(({ id, color, orientation }) =>
      groundTexture(id, options, color ? SRGBColorSpace : NoColorSpace, orientation),
    ),
  )
  const loaded: Texture[] = []
  let failed = false
  let failure: unknown
  for (const result of results) {
    if (result.status === 'fulfilled') loaded.push(result.value)
    else if (!failed) {
      failed = true
      failure = result.reason
    }
  }
  if (!failed) return loaded
  disposeTextures(loaded)
  throw failure
}

function orderedLayers(layers: readonly GroundMaterialLayer[]): readonly GroundMaterialLayer[] {
  return GROUND_MATERIAL_CHANNELS.flatMap(channel => {
    const layer = layers.find(candidate => candidate.channel === channel)
    return layer ? [layer] : []
  })
}

function installSplat(
  terrain: ReliefGroundMaterial,
  loaded: readonly Texture[],
  layers: readonly GroundMaterialLayer[],
): void {
  const albedos = loaded.slice(0, layers.length)
  const normalCount = layers.filter(layer => layer.normal).length
  const normals = loaded.slice(layers.length, layers.length + normalCount)
  const weights = loaded[loaded.length - 1]
  const fallbackAlbedo = albedos[0]
  if (!weights || !fallbackAlbedo) {
    disposeTextures(loaded)
    return
  }
  const neutral = neutralNormal()
  const normalsByAsset = new Map<string, Texture>()
  let normalIndex = 0
  for (const layer of layers) {
    if (layer.normal) normalsByAsset.set(layer.normal.assetId, normals[normalIndex++] ?? neutral)
  }
  const albedoValues = GROUND_MATERIAL_CHANNELS.map(channel => {
    const index = layers.findIndex(layer => layer.channel === channel)
    return albedos[index] ?? fallbackAlbedo
  })
  const normalValues = GROUND_MATERIAL_CHANNELS.map(channel => {
    const normal = layers.find(layer => layer.channel === channel)?.normal
    return normal ? (normalsByAsset.get(normal.assetId) ?? neutral) : neutral
  })
  disposeTextures(terrain.groundTextures ?? [])
  terrain.material.map?.dispose()
  terrain.groundTextures = [...loaded, neutral]
  // The uniform OBJECTS are kept and written into: a new set forces three to compile another
  // program for this material, and the old set stays bound until it does.
  terrain.groundUniforms = writtenUniforms(
    terrain.groundUniforms,
    albedoValues,
    normalValues,
    weights,
  )
  bindReliefSplat(terrain.material, terrain.groundUniforms)
}

function writtenUniforms(
  existing: ReliefSplatUniforms | undefined,
  albedos: readonly Texture[],
  normals: readonly Texture[],
  weights: Texture,
): ReliefSplatUniforms {
  if (!existing) {
    return {
      albedos: albedos.map(value => ({ value })),
      normals: normals.map(value => ({ value })),
      weights: { value: weights },
    }
  }
  albedos.forEach((value, index) => {
    const uniform = existing.albedos[index]
    if (uniform) uniform.value = value
  })
  normals.forEach((value, index) => {
    const uniform = existing.normals[index]
    if (uniform) uniform.value = value
  })
  existing.weights.value = weights
  return existing
}

type GroundTextureId = {
  id: string
  color: boolean
  orientation: PictureOrientation
}

function splatIds(
  layers: readonly GroundMaterialLayer[],
  weights: string | undefined,
): readonly GroundTextureId[] {
  const pictures: GroundTextureId[] = [
    ...layers.map((layer): GroundTextureId => ({
      id: layer.albedo.assetId,
      color: true,
      orientation: 'flipY',
    })),
    ...layers.flatMap((layer): GroundTextureId[] =>
      layer.normal ? [{ id: layer.normal.assetId, color: false, orientation: 'flipY' }] : [],
    ),
  ]
  if (!weights) return pictures
  // Row 0 of the PNG is min-Z, matching DataTexture.flipY = false; flipY would mirror it along Z.
  return [...pictures, { id: weights, color: false, orientation: 'from-image' }]
}

async function groundTexture(
  assetId: string,
  options: Options,
  colorSpace: Texture['colorSpace'],
  orientation: PictureOrientation = 'flipY',
): Promise<Texture> {
  const texture = await (options.loadGround ?? loadTexture)(
    versionedUrl(assetUrl(assetId), options.assetVersion?.(assetId)),
    orientation,
  )
  texture.colorSpace = colorSpace
  return texture
}

function groundSignature(layer: ReliefLayer): string | null {
  if (!layer.groundWeights) return layer.groundMaterials[0]?.albedo.assetId ?? null
  return [
    layer.groundWeights.assetId,
    ...layer.groundMaterials.flatMap(item => [
      item.channel,
      item.albedo.assetId,
      item.normal?.assetId ?? '',
    ]),
  ].join('|')
}

function paintTexture(paint: GroundPaint): DataTexture {
  const texture = new DataTexture(
    Uint8Array.from(paint.pixels),
    paint.width,
    paint.height,
    RGBAFormat,
  )
  texture.colorSpace = NoColorSpace
  texture.flipY = false
  texture.needsUpdate = true
  return texture
}

function neutralNormal(): DataTexture {
  const texture = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, RGBAFormat)
  texture.colorSpace = NoColorSpace
  texture.needsUpdate = true
  return texture
}

function disposeTextures(textures: readonly Texture[]): void {
  for (const texture of new Set(textures)) texture.dispose()
}
