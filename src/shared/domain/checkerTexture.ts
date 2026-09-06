import { hostedUrl } from './asset'

/**
 * The four working textures the app ships with — a grid and a checker, each at two densities.
 *
 * What they are FOR: judging scale, seeing UVs stretch, and telling one face of a primitive from
 * another. Every modelling package ships something like them, and a grey primitive tells none of
 * those three things.
 *
 * One tile is ONE METRE, which is what makes `tilesPerMetre` mean what it says: at a density of
 * one, a square of `gridLarge` measures a metre on the floor it is laid on.
 *
 * They are ordinary PNG files under `resources/textures`, copied into the project the first time
 * a scene wants one and referenced like any other asset from then on. Not a texture the engine
 * invents: a document holds an asset id, and a `.gltf` has to point at an image that exists.
 */
export type CheckerTextureId = 'gridLarge' | 'gridSmall' | 'checkerLarge' | 'checkerSmall'

export const CHECKER_TEXTURE_IDS: readonly CheckerTextureId[] = [
  'gridLarge',
  'gridSmall',
  'checkerLarge',
  'checkerSmall',
]

/**
 * What a primitive is born wearing. The large grid: one square per metre, joint marked, four
 * faint subdivisions inside it — the working texture every engine ships, and the one that reads
 * on a cube of one unit as on a floor of forty.
 */
export const DEFAULT_CHECKER_TEXTURE: CheckerTextureId = 'gridLarge'

/**
 * The name each one carries into a project — its file's stem, which is what an asset is named
 * by. English and fixed like every other folder and file the studio writes.
 */
export const CHECKER_TEXTURE_NAMES: Record<CheckerTextureId, string> = {
  gridLarge: 'GridLarge',
  gridSmall: 'GridSmall',
  checkerLarge: 'CheckerLarge',
  checkerSmall: 'CheckerSmall',
}

export function checkerTextureFile(id: CheckerTextureId): string {
  return `${CHECKER_TEXTURE_NAMES[id]}.png`
}

/**
 * The host that serves one from beside the app, no project taking part — as `template` and
 * `model` already do. Beside `installBundledTextures`, not instead of it: a mesh wears the ASSET,
 * so the `.gltf` it is written as points at a picture another application can open.
 */
export const TEXTURE_HOST = 'texture'

/** Where the window reads one from. Named by its file, like every other shipped folder. */
export function bundledTextureUrl(id: CheckerTextureId): string {
  return hostedUrl(TEXTURE_HOST, checkerTextureFile(id))
}

/** What one of them lands in the project as: the id it was given, and the row it now has. */
export type InstalledCheckerTexture = { id: CheckerTextureId; assetId: string; path?: string }
