import { ASSET_TYPES, type AssetType } from './asset'
import { typeOfWorkspace } from './assetKind'
import { documentExtensionOf, kindForExtension, workspaceForKind } from './document'
import { folderForRole, type RoleFolders } from './folderRole'
import { importableAssetTypeOf } from './importFormat'

/**
 * Which domain a file belongs to, plus the answer for one that belongs to none.
 *
 * `material` is here and NOT in `AssetType`, and that is the whole difference between the two: a
 * material is a DOCUMENT — one `.mtlx` gathering several pictures and their settings — where an
 * asset type is a kind of bytes the studio generates and files. Nothing generates a material.
 *
 * `other` is not a failure to classify. A project folder is the user's own, and a `.pdf` of
 * storyboard notes sitting beside the rushes is a file the explorer shows and the studio leaves
 * alone — there is no domain to file it under, and inventing one would be worse than saying so.
 */
export type FileDomain = AssetType | 'material' | 'other'

/** Bytes to look at, or a state of editing over them. */
export type FileRole = 'source' | 'edit'

export type FileNature = { domain: FileDomain; role: FileRole }

/** A source file's domain, and whether the studio can show or hold it. */
export type SourceNature = {
  domain: AssetType | 'other'
  openable: boolean
  /** Held as an asset even when a double-click is not ours — a heightmap `.exr`. */
  catalogable: boolean
}

/**
 * What a file IS, by its name alone.
 *
 * The one table that answers this, and the reason it exists: until now the FOLDER answered. A
 * `.png` under `assets/tex` was a texture channel and the same file under `assets/img` was a
 * picture, so a project could not be arranged any other way without the studio losing track of
 * what it held. With the tree open, nothing about a path can say what a file is any more.
 *
 * **No SOURCE extension reaches `texture` or `skybox`, and that is deliberate.** There is no such
 * thing as a texture file: there are PNGs, and a material document that gives some of them a part
 * to play — that document is an edit, and it is what carries those two domains. Guessing from a
 * suffix or a folder name would be right often and wrong silently: a normal map and an albedo
 * are both PNGs. A source takes those domains by being referenced, or by the user saying so; the
 * guess never gets a vote.
 */
const DOMAIN_BY_EXTENSION: Record<string, AssetType> = {
  '.png': 'image',
  // A layered picture is still a picture: it sits on the image shelf, and what a tile shows of
  // it is the flatten the container is required to carry.
  '.ora': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.avif': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.tif': 'image',
  '.tiff': 'image',
  '.heic': 'image',
  // Both are pictures until something says otherwise, high dynamic range or not — the sky
  // document is what turns one into an environment.
  '.exr': 'image',
  '.hdr': 'image',
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.mkv': 'video',
  '.avi': 'video',
  '.m4v': 'video',
  '.wav': 'audio',
  '.mp3': 'audio',
  '.flac': 'audio',
  '.ogg': 'audio',
  '.m4a': 'audio',
  '.aac': 'audio',
  '.aiff': 'audio',
  '.glb': 'mesh',
  '.gltf': 'mesh',
  '.obj': 'mesh',
  '.fbx': 'mesh',
  '.stl': 'mesh',
  '.ply': 'mesh',
  '.usdz': 'mesh',
  '.usd': 'mesh',
  '.usda': 'mesh',
  '.usdc': 'mesh',
  '.dae': 'mesh',
  '.bvh': 'animation',
}

/**
 * What a file is, from its name and nothing else.
 *
 * A document — `.gltf`, `.ora`, `.otio` — is an EDIT, and its domain is the one its editor works
 * in: a scene belongs beside the meshes, a picture beside the pictures. That link is not
 * spelled again here; it is read from the two tables that already carry it, so a kind that
 * changes space changes it in one place.
 *
 * **The case rule is asymmetric, and it is not an oversight.** `kindForExtension` is
 * case-sensitive on purpose — a `.SCENE` is not a document to the listing that walks the folder,
 * and answering otherwise here would show the user an editable document nothing can open. Source
 * extensions carry no such contract, so they are folded.
 */
export function natureOf(fileName: string): FileNature {
  const extension = documentExtensionOf(fileName)

  const kind = kindForExtension(extension)
  if (kind) {
    // The one kind whose domain is not an asset type: a material is a document and nothing else,
    // so no shelf answers for it and the table below would hand back `other`.
    if (kind === 'material') return { domain: 'material', role: 'edit' }

    const workspace = workspaceForKind(kind)
    return { domain: (workspace && typeOfWorkspace(workspace)) ?? 'other', role: 'edit' }
  }

  return { domain: DOMAIN_BY_EXTENSION[extension.toLowerCase()] ?? 'other', role: 'source' }
}

/**
 * Whether a double-click on this file belongs in the studio or with the system.
 *
 * A document always does — it is the studio's own. A source does when something here can draw
 * it; everything else, `.txt` and `.pdf` included, is the system's to open.
 *
 * **The blind spot, written rather than hidden**: a document is now held in the SAME file type as
 * an asset — `.ora`, `.gltf`, `.otio` — and this reads the name alone, so a plain glTF mesh
 * dropped in a project answers `edit` and is handed to the scene editor. Telling the two apart
 * needs the file's own content, which no caller of this has.
 */
export function opensInStudio(fileName: string): boolean {
  if (natureOf(fileName).role === 'edit') return true

  return sourceNatureOf(fileName).openable
}

/** Chromium decodes no MXF: opened as a tab, a rush shows a blank player instead of the system's. */
const UNDRAWABLE_EXTENSIONS = ['.tif', '.tiff', '.exr', '.hdr', '.mxf']

/**
 * What a file could be as BYTES to look at, whatever a document of that name would be. The two
 * questions came apart the day a document took the extension of an open format: an `.ora` from
 * another application is a picture to adopt, and `natureOf` calls it an edit.
 *
 * `catalogable` follows the import registry. `openable` is narrower: TIFF and high-dynamic-range
 * pictures enter the catalogue for materials and skies, but the image canvas cannot draw them.
 *
 * Narrower than `FileDomain` in its return, and the compiler is what holds it: bytes adopted into
 * the catalogue take an asset TYPE, and `material` is a document rather than one.
 */
export function sourceNatureOf(fileName: string): SourceNature {
  const extension = documentExtensionOf(fileName).toLowerCase()
  const importable = importableAssetTypeOf(fileName)
  const domain = importable ?? DOMAIN_BY_EXTENSION[extension] ?? 'other'
  const openable = importable !== null && !UNDRAWABLE_EXTENSIONS.includes(extension)
  return {
    domain,
    openable,
    catalogable: importable !== null,
  }
}

/**
 * Every domain a file can be filed under, for a facet list or a picker.
 *
 * Built from `ASSET_TYPES` rather than written out: a kind added to the shelf would otherwise be
 * a domain the shelf knows and this list does not. `material` is added by hand, being a document
 * rather than a kind of bytes.
 */
export const FILE_DOMAINS: readonly FileDomain[] = [...ASSET_TYPES, 'material', 'other']

/**
 * A picture filed under the skyboxes folder is a skybox: the folder says the role, where the
 * extension alone read « ma première skybox » as an image (2.6, 10.2, 37.2 — 2026-09-06).
 */
export function typeInRoleFolder(relative: string, type: AssetType, roles: RoleFolders): AssetType {
  return type === 'image' && relative.startsWith(`${folderForRole('skyboxes', roles)}/`)
    ? 'skybox'
    : type
}
