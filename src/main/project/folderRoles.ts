import { mkdir, readFile } from 'node:fs/promises'
import { orElse } from '@shared/promises'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { foldForFileName } from '@shared/domain/fileName'
import { nameOf, parentOf, pathIn } from '@shared/domain/folder'
import {
  DEFAULT_ROLE_PATHS,
  FOLDER_ROLES,
  isFolderRole,
  preferredRoleFolder,
  ROLE_MARKER,
  type FolderRole,
  type RoleFolders,
} from '@shared/domain/folderRole'
import { INDEX_FOLDER, ROLE_CACHE_FILE } from '@shared/domain/project'
import { isRecord } from '@shared/guards'
import { exists, writeAtomic } from '@main/persistence'
import { log } from '@main/log'
import { createFolderReader } from './folder'
import { hideFromExplorer } from './hideFromExplorer'
import { isProjectRelativeFolder } from './validation'

/** The role a folder claims, or nothing — the one place the marker's bytes are read. */
async function readMarker(root: string, folder: string): Promise<FolderRole | null> {
  try {
    const claimed = (await readFile(join(root, folder, ROLE_MARKER), 'utf8')).trim()
    return isFolderRole(claimed) ? claimed : null
  } catch {
    // Gone, unreadable, or never there: a marker nobody can open claims nothing.
    return null
  }
}

/**
 * The name the DISK holds for `folder`, which is not always the one asked for: APFS and NTFS fold
 * the case, so `mkdir` over an existing `scripts/` is a no-op and the studio would go on recording
 * `Scripts` — a folder the explorer then badges by a name nothing answers to.
 */
async function heldName(root: string, folder: string): Promise<string> {
  const above = parentOf(folder)
  const wanted = foldForFileName(nameOf(folder))
  const entries = await orElse(readdir(join(root, above ?? '')), [])
  const found = entries.find(entry => foldForFileName(entry) === wanted)

  return found === undefined ? folder : pathIn(above ?? '', found)
}

/** Lays a folder down and says what it is for, leaving Windows its attribute to the caller. */
async function writeMarker(root: string, folder: string, role: FolderRole): Promise<string> {
  await mkdir(join(root, folder), { recursive: true })
  const marker = join(root, await heldName(root, folder), ROLE_MARKER)
  await writeAtomic(marker, `${role}\n`)
  return marker
}

/** One folder, marked and hidden — the single-shelf door, for a role coming back on a write. */
export async function markRoleFolder(
  root: string,
  folder: string,
  role: FolderRole,
): Promise<void> {
  await hideFromExplorer(await writeMarker(root, folder, role))
}

/** The tree a new project is given, each folder carrying the marker that says what it is for. */
export async function layRoleFolders(root: string): Promise<void> {
  const laid = await Promise.all(
    FOLDER_ROLES.map(role => writeMarker(root, DEFAULT_ROLE_PATHS[role], role)),
  )

  // ONE `attrib` for them all, which is what `hideFromExplorer` promises: one spawn per shelf,
  // serialised, is a tenth of a second of Windows on the path that creates a project.
  await hideFromExplorer(...laid)
}

/**
 * `absent` is what keeps the walk rare: a role no folder carries has to be REMEMBERED as absent,
 * or every open of a project made before the roles pays a full traversal, for ever.
 */
type RoleCache = { roles: RoleFolders; absent: readonly FolderRole[] }

/**
 * 🛑 A path this cache names is WRITTEN INTO, and the cache arrives off a disk anyone may edit —
 * a project received from someone else, a zip, a corrupted file. Held to the shape a window's
 * paths answer to, plus the root itself: no role folder is the project's own directory.
 */
function isInsideProject(folder: string): boolean {
  return folder.length > 0 && isProjectRelativeFolder(folder)
}

function parseCache(body: string): RoleCache {
  const read: unknown = JSON.parse(body)
  if (!isRecord(read)) return { roles: {}, absent: [] }

  const roles: RoleFolders = {}
  if (isRecord(read.roles)) {
    for (const [role, folder] of Object.entries(read.roles)) {
      if (isFolderRole(role) && typeof folder === 'string' && isInsideProject(folder)) {
        roles[role] = folder
      }
    }
  }

  const absent = Array.isArray(read.absent) ? read.absent.filter(isFolderRole) : []
  return { roles, absent }
}

async function readCache(root: string): Promise<RoleCache> {
  try {
    return parseCache(await readFile(join(root, ROLE_CACHE_FILE), 'utf8'))
  } catch {
    return { roles: {}, absent: [] }
  }
}

export type RoleResolution = { roles: RoleFolders; walked: boolean }

/**
 * Where each role sits, and whether finding out cost a walk. A role nothing carries is left OUT
 * rather than pointed at its default: absent says "nowhere yet", a default says "here", and what
 * is here gets written into.
 *
 * 🛑 The blind spot of remembering an absence: a folder that gains a marker without the studio
 * writing it — a shelf copied in from another project — waits for the next walk.
 */
export async function resolveRoleFolders(root: string): Promise<RoleResolution> {
  const cached = await readCache(root)
  const held: RoleFolders = {}

  await Promise.all(
    FOLDER_ROLES.map(async role => {
      const folder = cached.roles[role]
      if (folder !== undefined && (await readMarker(root, folder)) === role) held[role] = folder
    }),
  )

  const settled = (role: FolderRole): boolean =>
    held[role] !== undefined || cached.absent.includes(role)
  if (FOLDER_ROLES.every(settled)) return { roles: held, walked: false }

  return { roles: await byWalking(root, held), walked: true }
}

/** Every claim the project carries, read once — the walk keeps only the markers themselves. */
async function claimsUnder(
  root: string,
  skip: ReadonlySet<string>,
): Promise<[FolderRole, string][]> {
  const reader = createFolderReader(
    () => root,
    () => 'en',
  )

  const found = await Promise.all(
    (await reader.named(ROLE_MARKER)).map(async (marker): Promise<[FolderRole, string] | null> => {
      const folder = parentOf(marker.path)
      if (folder === null || skip.has(folder)) return null

      const claimed = await readMarker(root, folder)
      return claimed === null ? null : [claimed, folder]
    }),
  )

  return found.filter(claim => claim !== null)
}

/** The roles the cache could not vouch for, looked up where they really are. */
async function byWalking(root: string, held: RoleFolders): Promise<RoleFolders> {
  const found: RoleFolders = {}

  for (const [role, folder] of await claimsUnder(root, new Set(Object.values(held)))) {
    const rival = found[role]
    found[role] = rival === undefined ? folder : preferredRoleFolder(rival, folder)
    if (rival !== undefined)
      log.info('project', `two folders claim ${role}; keeping ${found[role]}`)
  }

  // The verified win: they were read against the marker a moment ago, where these were found.
  return { ...found, ...held }
}

/** Written after a walk, so an absence costs one traversal rather than one per opening. */
export async function writeRoleCache(root: string, roles: RoleFolders): Promise<void> {
  const cache: RoleCache = { roles, absent: FOLDER_ROLES.filter(role => roles[role] === undefined) }

  try {
    // Its own folder rather than the one `ensureMachineFolders` lays down: a `.index/` sent to
    // the trash must cost a walk, never a failure.
    await mkdir(join(root, INDEX_FOLDER), { recursive: true })
    await writeAtomic(join(root, ROLE_CACHE_FILE), JSON.stringify(cache, null, 2))
  } catch (error) {
    // The cache spares a walk, it never answers: losing it costs one traversal.
    log.warn('project', `writing the folder-role cache failed: ${String(error)}`)
  }
}

/**
 * The folder a role names, laid down with its marker if the project has none — the one door
 * every marker the studio lays goes through, and only ever on a write.
 *
 * A project whose other shelves sit elsewhere gets this one at TODAY's default, so it ends up
 * wearing two trees. That is the price of migrating nothing, written rather than discovered.
 */
export async function ensureRoleFolder(
  root: string,
  roles: RoleFolders,
  role: FolderRole,
): Promise<string> {
  // The disk is asked, though the writer below would `mkdir` anyway: it would recreate the shelf
  // WITHOUT its marker, and the role would go unresolved until the next opening walked for it.
  const known = roles[role]
  if (known !== undefined && (await exists(join(root, known)))) return known

  await markRoleFolder(root, DEFAULT_ROLE_PATHS[role], role)
  return await heldName(root, DEFAULT_ROLE_PATHS[role])
}
