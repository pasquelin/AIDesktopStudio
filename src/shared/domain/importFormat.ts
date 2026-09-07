import type { AssetType } from './asset'
import { extensionOf } from './fileName'

export type ImportableAssetType = Extract<
  AssetType,
  'video' | 'audio' | 'image' | 'mesh' | 'animation'
>

export const IMPORTABLE_ASSET_TYPES: readonly ImportableAssetType[] = [
  'video',
  'audio',
  'image',
  'mesh',
  'animation',
]

/**
 * Every 3D file here is CONVERTED to a `.glb` on arrival — `meshImport.ts` says what that keeps.
 * A `.bvh` carries a skeleton and its motion and never a mesh, which is why it alone files as an
 * animation by its extension; the model formats can carry a motion too, and the folder or the
 * content decides for them (`filingType.ts`).
 */
export const IMPORTABLE_EXTENSIONS: Record<ImportableAssetType, readonly string[]> = {
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mxf', 'm4v'],
  audio: ['wav', 'mp3', 'aac', 'flac', 'm4a', 'ogg', 'aiff'],
  image: ['png', 'ora', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg', 'tif', 'tiff', 'exr', 'hdr'],
  mesh: ['glb', 'obj', 'fbx', 'stl', 'ply', 'dae', 'usdz'],
  animation: ['bvh'],
}

export const IMPORTABLE_DOCUMENT_EXTENSIONS: readonly string[] = ['ora', 'gltf', 'otio', 'mtlx']
export const IMPORTABLE_BUNDLE_EXTENSIONS: readonly string[] = ['otioz']

export const IMPORTABLE_FILE_EXTENSIONS: readonly string[] = [
  ...new Set([
    ...Object.values(IMPORTABLE_EXTENSIONS).flat(),
    ...IMPORTABLE_DOCUMENT_EXTENSIONS,
    ...IMPORTABLE_BUNDLE_EXTENSIONS,
  ]),
]

export function importableAssetTypeOf(fileName: string): ImportableAssetType | null {
  const extension = extensionOf(fileName).slice(1).toLowerCase()
  if (!extension) return null

  return (
    IMPORTABLE_ASSET_TYPES.find(type => IMPORTABLE_EXTENSIONS[type].includes(extension)) ?? null
  )
}

export function isImportableFile(fileName: string): boolean {
  const extension = extensionOf(fileName).slice(1).toLowerCase()
  return (
    importableAssetTypeOf(fileName) !== null ||
    IMPORTABLE_DOCUMENT_EXTENSIONS.includes(extension) ||
    IMPORTABLE_BUNDLE_EXTENSIONS.includes(extension)
  )
}
