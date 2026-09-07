import type { TextureSlot } from './sceneTexture'
import type { TextureRef } from './textureRef'

type ModelDressMemory = {
  imageAssetId?: string
  materialDocumentIds?: readonly string[]
}

type StoredModelDress = {
  kind?: unknown
  assetId?: unknown
  documentIds?: unknown
  imageAssetId?: unknown
  materialDocumentIds?: unknown
}

export type ModelDressRef = ModelDressMemory &
  (
    | { kind: 'plain' }
    | { kind: 'image'; assetId: string }
    | { kind: 'materials'; documentIds: readonly string[] }
  )

export function modelDressRefOf(value: unknown): ModelDressRef | null {
  if (typeof value !== 'object' || value === null) return null

  const held: StoredModelDress = value
  const memory = modelDressMemoryOf(held)
  if (held.kind === 'plain') return { kind: 'plain', ...memory }
  if (held.kind === 'image' && typeof held.assetId === 'string') {
    return { kind: 'image', assetId: held.assetId, ...memory }
  }
  if (
    held.kind === 'materials' &&
    Array.isArray(held.documentIds) &&
    held.documentIds.every(id => typeof id === 'string')
  ) {
    return { kind: 'materials', documentIds: held.documentIds, ...memory }
  }

  return null
}

function modelDressMemoryOf(held: StoredModelDress): ModelDressMemory {
  const memory: ModelDressMemory = {}
  if (typeof held.imageAssetId === 'string') memory.imageAssetId = held.imageAssetId
  if (
    Array.isArray(held.materialDocumentIds) &&
    held.materialDocumentIds.every(id => typeof id === 'string')
  ) {
    memory.materialDocumentIds = held.materialDocumentIds
  }
  return memory
}

export const NOTHING_WORN = ''
export const MATERIAL_SLOTS = 64

export function isWorn(id: string | undefined): id is string {
  return id !== undefined && id !== NOTHING_WORN
}

const NO_MATERIALS: readonly string[] = Object.freeze([])

export function wornMaterials(dress: ModelDressRef | undefined): readonly string[] {
  return dress?.kind === 'materials' ? dress.documentIds : NO_MATERIALS
}

export function withMaterialAt(
  worn: readonly string[],
  slot: number,
  documentId: string,
): readonly string[] {
  if (slot < 0 || slot >= MATERIAL_SLOTS || !Number.isInteger(slot)) return worn

  const next = [...worn]
  while (next.length <= slot) next.push(NOTHING_WORN)
  next[slot] = documentId
  return next
}

export type ModelDress = {
  textures: Partial<Record<TextureSlot, TextureRef>>
  fileTextures?: boolean
  material?: ModelMaterial
}

export type ModelMaterial = {
  color?: string
  roughness?: number
  metalness?: number
  normalScale?: number
  aoIntensity?: number
  emissive?: string
  emissiveIntensity?: number
  tiling?: { x: number; y: number }
  offset?: { x: number; y: number }
  rotation?: number
}
