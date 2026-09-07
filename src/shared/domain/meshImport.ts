import type { AssetLocation, AssetType } from './assetTypes'
import { extensionOf } from './fileName'

/**
 * What the studio makes of a 3D file that is not a `.glb`: one conversion on arrival, and the
 * `.glb` it writes is the asset from then on. The original is kept beside it, out of the
 * catalogue, so a better reader can convert it again one day.
 */

/** A thing the conversion could not carry into the `.glb`, each one measured while converting. */
export type MeshImportLoss =
  /** The format holds no material, or the file named none: every mesh wears the default. */
  | 'materials'
  /** A picture the file asked for could not be read. */
  | 'textures'
  /** A material was not physically based and was approximated as one. */
  | 'shading'

export const MESH_IMPORT_LOSSES: readonly MeshImportLoss[] = ['materials', 'textures', 'shading']

export function isMeshImportLoss(value: unknown): value is MeshImportLoss {
  return typeof value === 'string' && MESH_IMPORT_LOSSES.some(loss => loss === value)
}

/** The two roles a converted file can take; the folder it was dropped in names the first guess. */
export type ConvertibleType = Extract<AssetType, 'mesh' | 'animation'>

export const isConvertibleType = (type: AssetType): type is ConvertibleType =>
  type === 'mesh' || type === 'animation'

/** What the bytes turned out to hold, counted after the parse. */
export type MeshImportContent = { meshes: number; clips: number }

/**
 * The role a converted file takes: the folder's say, corrected only where it is impossible.
 *
 * A file filed as a motion that holds no clip is a model; one filed as a model that holds bones
 * and clips but no mesh is a motion. A file holding both — a Mixamo FBX is a skinned character
 * AND its walk — keeps whatever the folder or the default said.
 */
export function convertedTypeOf(
  filed: ConvertibleType,
  content: MeshImportContent,
): ConvertibleType {
  if (filed === 'animation' && content.clips === 0) return 'mesh'
  if (filed === 'mesh' && content.meshes === 0 && content.clips > 0) return 'animation'
  return filed
}

export const GLB_EXTENSION = '.glb'

/** Where the kept original goes: a dot folder beside the asset, which no walker of the project lists. */
export const SOURCES_FOLDER = '.sources'

/**
 * Whether this row is a 3D file still waiting to become a `.glb`. Read on ARRIVALS only — an
 * announced row, an import's answer — never over the whole catalogue: a project that predates the
 * rule keeps its files as they are.
 */
export function needsMeshConversion(asset: {
  location: AssetLocation
  type: AssetType
  path?: string
  convertedFrom?: string
}): boolean {
  return (
    asset.location === 'local' &&
    isConvertibleType(asset.type) &&
    asset.path !== undefined &&
    asset.convertedFrom === undefined &&
    extensionOf(asset.path).toLowerCase() !== GLB_EXTENSION
  )
}
