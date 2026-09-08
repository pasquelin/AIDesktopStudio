import { byCodeUnit } from '../text'
import type { WorkspaceId } from './workspace'

/**
 * What a folder is FOR, told by a marker inside it rather than by its name.
 *
 * A name cannot carry this: the user renames a folder in the Finder and the studio loses the one
 * it files meshes into. The marker travels with the folder — a rename, a move, a copy, a zip, a
 * commit all keep it — so the name on disk becomes the user's, entirely.
 *
 * One role per place the studio files something: one folder cannot hold scenes, meshes and
 * motions without becoming the `documents/` this replaced.
 */
export type FolderRole =
  | 'image'
  | 'video'
  | 'audio'
  | 'materials'
  | 'skyboxes'
  | 'code'
  | 'scenes'
  | 'models'
  | 'animations'
  | 'gui'
  | 'input'

/**
 * The values beside the type: a marker read off disk has to be checked against them.
 *
 * 🛑 No identifier may hold a dot. These spell i18n keys — `folderRoles.${role}` — and a dot would
 * make one an extra level of nesting nobody wrote.
 */
export const FOLDER_ROLES: readonly FolderRole[] = [
  'image',
  'video',
  'audio',
  'materials',
  'skyboxes',
  'code',
  'scenes',
  'models',
  'animations',
  'gui',
  'input',
]

export function isFolderRole(value: unknown): value is FolderRole {
  return FOLDER_ROLES.some(candidate => candidate === value)
}

/**
 * Where each role STARTS — the tree a new project is given, and the fallback for a role whose
 * folder has gone away.
 *
 * The names are ENGLISH, and they are fixed: a folder whose name followed the interface language
 * would be renamed on disk at every language change, and every catalogue row under it would point
 * beside the file. The interface says «Scènes» by translating the ROLE, never by touching the
 * disk.
 *
 * Only a default: the marker is what binds a role to a folder, so any of these may be renamed,
 * moved or nested and go on serving.
 *
 * 🛑 Moving one orphans what `resourceFolderOf` already laid under the old spelling, which no
 * marker rescues: the role then owes its shipped files a `formerPaths` naming where they were.
 */
export const DEFAULT_ROLE_PATHS: Record<FolderRole, string> = {
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
  materials: 'Materials',
  skyboxes: 'Skyboxes',
  code: 'Scripts',
  scenes: 'Scenes',
  models: 'Models',
  animations: 'Animations',
  gui: 'GUI',
  input: 'Controls',
}

/**
 * The file that says a folder's role, holding the role and nothing else.
 *
 * Inside the folder rather than in a table elsewhere, which is the whole mechanism: a table keyed
 * by path is stale the moment the Finder renames anything, where a file the folder CARRIES is
 * never wrong. Dotted so every platform hides it, and `hideFromExplorer` gives Windows the
 * attribute it wants on top.
 */
export const ROLE_MARKER = '.ai-desktop-studio-role'

/**
 * Where the roles were last found, by role. Partial on purpose: a role whose folder was thrown
 * away has no path until something needs to write one, and an entry that lied would be worse than
 * an entry that is absent.
 */
export type RoleFolders = Partial<Record<FolderRole, string>>

/**
 * The workspace each role serves. Here rather than beside the icons, because it is what lets a
 * folder's glyph and its label both be READ off the workspace tables instead of relisted — one
 * glyph per section, changed once.
 */
export const WORKSPACE_BY_ROLE: Record<FolderRole, WorkspaceId> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  materials: 'materials',
  skyboxes: 'skyboxes',
  code: 'code',
  scenes: '3d',
  models: '3d',
  animations: '3d',
  gui: '3d',
  input: '3d',
}

/**
 * The folder a role names in THIS project, falling back to where the role starts.
 *
 * The map is required: an optional one lets a caller forget it and get the default silently,
 * which is a document filed beside the folder the user renamed rather than in it.
 */
export function folderForRole(role: FolderRole, roles: RoleFolders): string {
  return roles[role] ?? DEFAULT_ROLE_PATHS[role]
}

/**
 * Which of two folders claiming one role wins: the shallower, then the earlier by code unit.
 *
 * A copied folder brings its marker, so two claims is an ordinary accident rather than a corrupt
 * project. Depth puts the original ahead of a copy filed under it; `byCodeUnit` settles the tie,
 * and it is what keeps a project resolving the same way on every machine.
 *
 * 🛑 Depth ignores what a folder HOLDS, so a shelf laid at today's default wins over a fuller one
 * a project keeps a fold deeper. Written rather than fixed: files are not moved either way.
 */
export function preferredRoleFolder(one: string, other: string): string {
  const depth = one.split('/').length - other.split('/').length
  if (depth !== 0) return depth < 0 ? one : other

  return byCodeUnit(one, other) <= 0 ? one : other
}
