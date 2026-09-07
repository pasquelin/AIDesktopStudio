import {
  CHECKER_TEXTURE_IDS,
  CHECKER_TEXTURE_NAMES,
  checkerTextureFile,
  type CheckerTextureId,
  type InstalledCheckerTexture,
} from '@shared/domain/checkerTexture'
import { folderForRole, type RoleFolders } from '@shared/domain/folderRole'
import { pathIn } from '@shared/domain/folder'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import {
  installBundledResource,
  type BundledResource,
  type BundledResourceDeps,
} from './bundledResource'

type BundledTextureDeps = BundledResourceDeps & {
  /** Where the shipped textures sit — injected like everything else that touches the disk. */
  folder: () => string
  /**
   * Where each role's folder sits — `ProjectStore.roles`. Read for the LEGACY lookup alone: a
   * project made before `.resources/` filed its four in the materials folder it had then.
   */
  roles: () => RoleFolders
}

/**
 * 🛑 LITERALS on purpose: these name where a file WAS, and a past cannot be spelled by a value the
 * studio still reserves the right to change. `Images` is here for that reason and not because it
 * is today's picture folder.
 */
const FORMER_FOLDERS: readonly string[] = ['Images', 'Textures']

/**
 * The paths a project made before `.resources/` may hold one at, the resolved materials folder
 * included — a project that already carries its four keeps them where they are, ids and all.
 *
 * Nothing is migrated: they go on resolving, and what such a project does not gain is the hiding.
 * Decision of Alban's, written rather than silently half-done.
 */
function formerPathsOf(id: CheckerTextureId, roles: RoleFolders): readonly string[] {
  return [folderForRole('materials', roles), ...FORMER_FOLDERS].map(folder =>
    pathIn(folder, checkerTextureFile(id)),
  )
}

function resourceOf(id: CheckerTextureId, roles: RoleFolders): BundledResource {
  return {
    file: checkerTextureFile(id),
    name: CHECKER_TEXTURE_NAMES[id],
    type: 'image',
    role: 'materials',
    map: 'baseColor',
    formerPaths: formerPathsOf(id, roles),
  }
}

/** The four working textures the app ships with, put into the open project — once. */
export function registerBundledTextureHandlers({
  folder,
  roles,
  ...deps
}: BundledTextureDeps): void {
  handle(CHANNELS.texturesInstallBundled, async (): Promise<InstalledCheckerTexture[]> => {
    const installed: InstalledCheckerTexture[] = []

    // One at a time rather than all four at once: they land in one folder, and `freeAssetPath`
    // reads the disk to pick a free name — four concurrent writers would each read « free ».
    for (const id of CHECKER_TEXTURE_IDS) {
      const asset = await installBundledResource(deps, folder(), resourceOf(id, roles()))
      installed.push({ id, assetId: asset.id, ...(asset.path ? { path: asset.path } : {}) })
    }

    return installed
  })
}
