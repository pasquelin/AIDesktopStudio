import { ANIMATION_EXTENSIONS } from './animationLibrary'
import { roleForAsset, type AssetType } from './asset'
import { kindForExtension, roleForKind } from './document'
import { extensionOf } from './fileName'
import { FOLDER_ROOT, isUnder } from './folder'
import { folderForRole, type FolderRole, type RoleFolders } from './folderRole'
import { IMPORTABLE_BUNDLE_EXTENSIONS, importableAssetTypeOf } from './importFormat'

function inRole(folder: string, role: FolderRole, roles: RoleFolders): boolean {
  const root = folderForRole(role, roles)
  return folder === root || isUnder(folder, root)
}

/**
 * Catalogue type a file takes in this folder. `null` for a document the listing will open, not a
 * row — a `.gltf` scene, unless it was dropped in the animations folder.
 *
 * glb/gltf/fbx name both a model and a motion. The animations/models role is how the user tells
 * them apart; every other kind still reads from the extension alone. A window drop has no folder
 * (`''`): `.fbx` files as motion, `.glb` as a model — a default the CONTENT corrects once the
 * file is read (`meshImport.ts`). A `.bvh` holds no mesh, so no folder can make it a model.
 *
 * `known` is what another route already said the file is — its first bytes, or the row the
 * catalogue holds over it — read where the name says nothing, and filed by folder like the rest.
 * Without it those routes each carried the folder rule again, and one caller forgot it.
 */
export function filingTypeOf(
  fileName: string,
  folder: string,
  roles: RoleFolders,
  known: AssetType | null = null,
): AssetType | null {
  const extension = extensionOf(fileName).toLowerCase()
  if (extension === '.bvh') return 'animation'
  const imported = importableAssetTypeOf(fileName)
  if (ANIMATION_EXTENSIONS.includes(extension) || imported === 'mesh') {
    if (inRole(folder, 'animations', roles)) return 'animation'
    if (extension !== '.gltf') {
      if (inRole(folder, 'models', roles)) return 'mesh'
      return extension === '.fbx' ? 'animation' : 'mesh'
    }
  }

  // A picture filed under the skyboxes folder is a skybox: the folder says the role, where the
  // extension alone read « ma première skybox » as an image (2.6, 10.2, 37.2 — 2026-09-06).
  const type = imported ?? known
  return type === 'image' && inRole(folder, 'skyboxes', roles) ? 'skybox' : type
}

/** Role a window drop files under — the write door is `folderFor`, not this path. */
export function filingRoleOf(fileName: string, roles: RoleFolders): FolderRole {
  const extension = extensionOf(fileName).slice(1).toLowerCase()
  if (IMPORTABLE_BUNDLE_EXTENSIONS.includes(extension)) return roleForKind('sequence')

  const type = filingTypeOf(fileName, FOLDER_ROOT, roles)
  if (type) return roleForAsset({ type })

  const kind = kindForExtension(`.${extension}`)
  return kind ? roleForKind(kind) : 'models'
}

/** Destination when the app routes and no `folderFor` is at hand — tests, not a write. */
export function filingFolderOf(fileName: string, roles: RoleFolders): string {
  return folderForRole(filingRoleOf(fileName, roles), roles)
}
