import { orElse } from '@shared/promises'
import { mkdir, readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { Asset } from '@shared/domain/asset'
import { assetFileName, FALLBACK_ASSET_NAME, type AssetNameFailure } from '@shared/domain/assetName'
import {
  extensionOf,
  foldForFileName,
  isSameFileName,
  safeFileName,
  stemForSuffix,
} from '@shared/domain/fileName'
import { nameOf, parentOf } from '@shared/domain/folder'
import {
  ANIMATION_CLIP_STEM,
  ANIMATION_THUMBNAIL,
  isOwnAnimationFolder,
} from '@shared/domain/animationLibrary'
import { SOURCES_FOLDER } from '@shared/domain/meshImport'
import { exists } from '@main/persistence'
import { assetFilePath } from './protocol'
import type { AssetType } from '@shared/domain/asset'
import { extname } from 'node:path'

/**
 * Where an asset's bytes live, now that a row's name is also its file's.
 *
 * Free names are asked of the DISK rather than of the catalogue, and that is the whole reason
 * this is here rather than in `shared/`: a project folder is the user's, and it holds files no
 * row has ever heard of — one dropped in by hand, one left by a crash between the write and the
 * insert. A name checked free against the catalogue alone would be handed to `writeFile`, which
 * overwrites without a word.
 */

/** What a refused rename says. Recognised on the other side, where the field has closed. */
export const ASSET_DUPLICATE_NAME: AssetNameFailure = 'duplicate'

/**
 * The first name in `folder` nobody has taken — `Ruelle bleue`, then `Ruelle bleue 2`.
 *
 * For the names the studio engenders itself, where there is nobody to ask: a generation lands
 * under its prompt, and a job of four outputs lands four times under that one prompt. A name the
 * user TYPED is refused instead — suffixing it would hand them an asset called something they
 * did not write.
 *
 * **One `stat`, then one `readdir`.** The nominal case is a name nobody holds, and it costs a
 * single check. Only a collision opens the folder, and then the candidates are tried in memory:
 * running the same prompt K times used to cost K sequential `stat`s on the K-th run — one folder
 * takes every picture an import lands, and an unnumbered prompt is the ordinary case, so that
 * grew without a bound anybody would notice.
 */
async function freeAssetName(
  root: string,
  folder: string,
  name: string,
  extension: string,
): Promise<string> {
  if (!(await exists(join(root, folder, assetFileName(name, extension))))) return name

  // Folded, because `exists` above answered for a case-insensitive volume: APFS and NTFS hold
  // one file for `Ruelle.png` and `ruelle.png`, and a raw Set would call the second one free.
  const taken = new Set(
    (await orElse(readdir(join(root, folder)), [])).map(entry => foldForFileName(entry)),
  )
  const free = (candidate: string): boolean =>
    !taken.has(foldForFileName(assetFileName(candidate, extension)))

  const stem = stemForSuffix(name)

  // No bound: the loop ends on the first free name, and there are only ever as many taken as
  // there are files in the folder.
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} ${n}`
    if (free(candidate)) return candidate
  }
}

/**
 * The same answer as a path, which is what an import needs to write.
 *
 * The folder is CREATED rather than required: a user who threw `Images/` away did nothing wrong,
 * and failing the import or emptying it into the project root are both worse than putting the
 * folder back. `ProjectStore.folderFor` is what says WHICH folder, and marks it.
 */
export async function freeAssetPath(
  root: string,
  folder: string,
  name: string,
  extension: string,
): Promise<string> {
  await mkdir(join(root, folder), { recursive: true })
  const free = await freeAssetName(root, folder, name, extension)
  return `${folder}/${assetFileName(free, extension)}`
}

/**
 * The same, for an animation: a FOLDER of its own, holding a clip that carries no name.
 *
 * The name is the folder's — that is the whole point, and `resources/animations/` has answered
 * that way since it shipped. A rig names its only clip `NlaTrack` or nothing at all, so what the
 * file spells must never reach the screen; and a still then has somewhere to live beside it.
 */
export async function freeAnimationPath(
  root: string,
  folder: string,
  name: string,
  extension: string,
): Promise<string> {
  // Asked with no extension, which is what a FOLDER is: `assetFileName` then cleans the name and
  // `exists` answers for a directory as it does for a file, so the suffixing is the same one.
  const own = `${folder}/${assetFileName(await freeAssetName(root, folder, name, ''), '')}`
  await mkdir(join(root, own), { recursive: true })
  return `${own}/${ANIMATION_CLIP_STEM}${extension}`
}

/**
 * Moves an asset's file so that it is called after its new name, and answers where it now is.
 *
 * The extension and the folder are kept: a rename is neither a conversion nor a move, and where
 * a picture sits says nothing about what it is — the row does.
 *
 * Answers `undefined` for an asset that has no file of ours — one linked where the user left it,
 * one that lives in the library alone. Writing into a folder the user merely pointed at is a
 * gesture the studio does not take, so those keep their name in the catalogue and nowhere else.
 *
 * Throws `ASSET_DUPLICATE_NAME` rather than overwriting: the file it would replace is another asset's,
 * and `rename` takes it without a word on POSIX.
 */
export async function moveAssetFile(
  root: string,
  asset: Asset,
  name: string,
): Promise<string | undefined> {
  if (!asset.path) return undefined

  // A stored path is user-editable territory — the same containment the scheme applies before
  // serving one. A row pointing outside the project is not a row whose file we move.
  if (!assetFilePath(root, asset.path)) return asset.path

  const target = renamedFilePath(asset.path, name)
  if (target === asset.path) return asset.path

  // A row whose file somebody deleted by hand still takes its new name: there is nothing to
  // move, and refusing would leave a name uncorrectable on the one row that most needs it.
  if (!(await exists(join(root, asset.path)))) return asset.path

  // An animation wears its FOLDER's name, the clip inside carrying none, so that is what moves.
  const own = asset.type === 'animation' ? await ownAnimationFolderOf(root, asset.path) : null
  if (own !== null) return await renamedAnimationFolder(root, asset.path, own, name)

  return await renamedTo(root, asset.path, target)
}

/** The same path, the last segment renamed and its extension kept. */
function renamedFilePath(path: string, name: string): string {
  const folder = parentOf(path)
  const wanted = assetFileName(name, extensionOf(path))
  return folder === null ? wanted : `${folder}/${wanted}`
}

/** The move itself, refused rather than taken when something of another name is already there. */
async function renamedTo(root: string, from: string, target: string): Promise<string> {
  // Case alone is not a duplicate — one file, this asset's own, changing how it is spelled.
  if (!isSameFileName(target, from) && (await exists(join(root, target))))
    throw new Error(ASSET_DUPLICATE_NAME)

  await rename(join(root, from), join(root, target))
  return target
}

/**
 * The folder this clip is alone in, or `null` when it is not one of ours to carry along.
 *
 * 🛑 MEASURED rather than deduced from the path. A clip a user dropped in by hand and called
 * `animation.glb` reads exactly like one the studio laid out, and its parent is then the
 * animations folder itself — renaming THAT would take every other clip with it.
 */
async function ownAnimationFolderOf(root: string, clipPath: string): Promise<string | null> {
  const folder = isOwnAnimationFolder(clipPath) ? parentOf(clipPath) : null
  if (folder === null) return null

  const ours = new Set([nameOf(clipPath), ANIMATION_THUMBNAIL, SOURCES_FOLDER])
  const held = await orElse(readdir(join(root, folder)), [])
  return held.length > 0 && held.every(entry => ours.has(entry)) ? folder : null
}

/** The same rename as a file's, one level up: the folder takes the name, the clip keeps its own. */
async function renamedAnimationFolder(
  root: string,
  clipPath: string,
  folder: string,
  name: string,
): Promise<string> {
  const above = parentOf(folder)
  const wanted = assetFileName(name, '')
  const target = above === null ? wanted : `${above}/${wanted}`

  if (target === folder) return clipPath
  return `${await renamedTo(root, folder, target)}/${nameOf(clipPath)}`
}

/**
 * The same move, for a name the STUDIO wrote rather than one a user typed — a caption.
 *
 * Suffixed until free instead of refused, and cleaned instead of rejected, for the reason
 * `freeAssetPath` is: a sentence a model produced has nobody to hand back a refusal to. What
 * comes back is the name it SETTLED on, so the row can carry exactly what the folder does —
 * writing the wanted name beside a file called something else is the state all of this ends.
 *
 * `undefined` when there is no file of ours to move, as above.
 */
export async function moveAssetFileToFree(
  root: string,
  asset: Asset,
  name: string,
): Promise<{ name: string; path: string } | undefined> {
  if (!asset.path || !assetFilePath(root, asset.path)) return undefined

  const folder = parentOf(asset.path)
  if (folder === null) return undefined

  const free = await freeAssetName(root, folder, name, extensionOf(asset.path))
  const moved = await moveAssetFile(root, asset, free)

  // Cleaned rather than `free` itself: `safeFileName` drops what a file system will not hold,
  // and the row must say what the disk says rather than what was asked for. NOT `stemOf(moved)`
  // — a name may legitimately hold a dot, and `Ruelle v1.2.png` would come back as `Ruelle v1`.
  return moved ? { name: safeFileName(free, FALLBACK_ASSET_NAME), path: moved } : undefined
}

/** The kind's own extension, for anything that is not a plain one. */
const FALLBACK_EXTENSION: Record<AssetType, string> = {
  image: '.png',
  video: '.mp4',
  audio: '.mp3',
  mesh: '.glb',
  skybox: '.png',
  animation: '.glb',
}

/**
 * Anything that is not a plain extension is refused, and the kind's own is used instead. The
 * refusal is the point: the string comes from an API response or from the renderer, and
 * `../../.ssh/id_rsa` appended to an asset id would write outside the project entirely.
 */
export function safeExtension(extension: string, type: AssetType): string {
  return /^\.[a-z0-9]{1,8}$/i.test(extension) ? extension.toLowerCase() : FALLBACK_EXTENSION[type]
}

/**
 * The same file, re-suffixed — a take re-encoded on the way out keeps the name it is known by,
 * and it cannot collide, being the file that is already there. `freeAssetPath` is for one that
 * does not exist yet.
 */
export function withExtension(relativePath: string, extension: string): string {
  // `extname` and not `stemOf`, which is for a NAME: this takes a path, and only `node:path`
  // knows that the last dot of `assets/v1.2/take` belongs to a folder rather than to the file.
  const suffix = extname(relativePath)
  return `${suffix ? relativePath.slice(0, -suffix.length) : relativePath}${extension}`
}
