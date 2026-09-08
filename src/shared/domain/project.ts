import { codeIn } from '../guards'
import { pathBaseNameOf } from './fileName'
import { byCodeUnit } from '../text'
import type { AccountSummary } from './account'
import { parentOf } from './folder'
import { DEFAULT_ROLE_PATHS, type FolderRole } from './folderRole'

export const MANIFEST_VERSION = 1

/**
 * A project is a folder, not a binary file — versionable, inspectable, repairable by hand.
 *
 * Hidden because it is not the user's: what the folder holds FOR them — `assets/`, `documents/`
 * — stays in the open, and only what the machine keeps goes under a dot. There is no extension
 * on the folder itself: nothing was ever registered against `.scenario`, so it opened as a
 * plain folder and the suffix only decorated it.
 */
export const MANIFEST_FILE = '.project.json'

/** What projects made before the rename carry. Read, never written — see `openManifest`. */
export const LEGACY_MANIFEST_FILE = 'project.json'

/**
 * The machine's own folder inside a project. Named on its own because three separate readers now
 * need to SAY it rather than sit under it: the folders below, `MACHINE_FOLDERS`, and the
 * `.gitignore` the version panel writes — and three spellings of one folder is how one of them
 * ends up pointing at a folder nothing creates.
 */
export const INDEX_FOLDER = '.index'

export const CATALOG_FILE = `${INDEX_FOLDER}/catalog.db`

/**
 * The studio's own folder inside a project — for what it keeps that no rescan could rebuild.
 *
 * NOT `.index/`, and the difference is the whole reason both exist: `.index/` is a cache the
 * studio's `.gitignore` excludes, this travels with the project and is meant to be committed.
 */
export const STUDIO_FOLDER = '.ai-desktop-studio'

/**
 * Where what the APP ships lands inside a project — the working textures, the character, the
 * clips. Copied there rather than served from beside the app because a `.gltf` has to point at a
 * picture another application can open, and a texture living only inside the studio would leave
 * every exported scene bare.
 *
 * Under a dot for the same reason `.index/` is: it is not the user's to arrange. No surface that
 * BROWSES assets lists it — see `isStudioPrivate` and `NOT_PRIVATE` — and no gesture may move or
 * throw away what it holds. It travels with the project like `.ai-desktop-studio/`, being what the
 * project's own scenes point at.
 */
const RESOURCES_FOLDER = '.resources'

/**
 * Where a resource of this role lands inside `.resources/` — the ONE spelling of that path.
 *
 * Default role names rather than resolved ones: the studio owns this folder, so no marker travels
 * into it and no rename moves what it holds. Written and looked up through here, never composed
 * twice — a divergence makes the lookup miss and installs a second copy at every open.
 */
export function resourceFolderOf(role: FolderRole): string {
  return `${RESOURCES_FOLDER}/${DEFAULT_ROLE_PATHS[role]}`
}

/** What the assistant has learned about this project. One JSON object per line, appended. */
export const MEMORY_FILE = `${STUDIO_FOLDER}/memory.ndjson`

/** Its searchable half, under the cache: thrown away and rebuilt from the file above. */
export const MEMORY_INDEX_FILE = `${INDEX_FOLDER}/memory.db`

/**
 * Where a move that is under way writes down what it has already done.
 *
 * Moving three hundred files is not one operation the filesystem can undo: it is three hundred,
 * and a machine that stops in the middle leaves the project half moved. The journal is what lets
 * the next opening finish the job — see `fileJournal.ts`.
 *
 * Under `.index/` because it is machinery the studio can rebuild, not the user's work.
 */
export const PENDING_FILES_FILE = `${INDEX_FOLDER}/pending-files.ndjson`

/**
 * Where the last folder-role resolution was written down — a CACHE, never the answer. What binds
 * a role to a folder is the marker the folder carries; this only spares the walk.
 *
 * Declared beside the other `.index/` paths rather than in the resolver, for the reason
 * `INDEX_FOLDER` gives: three spellings of one folder is how one ends up pointing at a folder
 * nothing creates.
 */
export const ROLE_CACHE_FILE = `${INDEX_FOLDER}/folder-roles.json`

/**
 * 🛑 NO name, and that is the whole point: a project is named by its FOLDER — see `projectName`.
 * Held here as well, it was a second copy nothing kept aligned, and a folder renamed in Finder
 * went on being drawn under the name this file remembered.
 *
 * What stays is what the disk cannot answer: `version` says whether this build can read the
 * project at all, and `createdAt` is what both shelves order by — no file system gives a creation
 * date that is portable and survives a copy.
 */
export type Manifest = {
  version: number
  createdAt: string
  updatedAt: string
}

export type Project = {
  path: string
  manifest: Manifest
}

/**
 * A project the studio has opened before. Session state kept beside `storage.lastProject`, for
 * the same reason it is: the settings are replicated in every window, so the home reads the
 * list without a channel of its own.
 *
 * The NAME is not here — it is read off the path by `projectName`, and a rename moves the folder.
 */
export type RecentProject = {
  /**
   * 🛑 The one identity, and the NAME is read off it — see `projectName`. Stored beside the path,
   * the name was a third copy: a rename had to write it separately, and a shelf that kept the old
   * one listed a project twice under two names for one folder.
   */
  path: string
  /** ISO 8601, stamped when it was last opened. What decides which entry is evicted. */
  openedAt: string
  /**
   * ISO 8601, copied from the manifest — when the PROJECT was made, not when it was last touched.
   * What decides the order it is listed in.
   *
   * Optional because a settings file written before 13 August has no such field, and dropping
   * those entries to make it required would empty the list of anyone upgrading. Read through
   * `listedAt`, never directly.
   */
  createdAt?: string
}

/**
 * The date a project is ORDERED by, falling back to when it was last opened for an entry stored
 * before `createdAt` existed. A missing value must not sort as the epoch: that would bury every
 * project this studio already knows under the first one made after the upgrade.
 */
export function listedAt(entry: RecentProject): string {
  return entry.createdAt ?? entry.openedAt
}

/**
 * The list as the studio SHOWS it: newest project first, by the date it was created.
 *
 * Apart from the stored order on purpose, and the two answer different questions. Storage is
 * ordered by opening because that is what decides which entry `RECENT_PROJECTS_MAX` evicts —
 * sorting the stored array by creation instead would throw away the oldest project one owns, which
 * may well be the one opened every morning. What the eye wants is a list that does not reshuffle
 * under the click that opens something, and creation date is the only key a click cannot move.
 *
 * The path breaks a tie, so two projects made in the same second do not swap between renders.
 *
 * Neither key is read as words, so neither takes a collator: a stamp sorts chronologically by code
 * unit, and the path is here to be STABLE rather than to be read — a tie broken in the locale the
 * OS was installed in would break it two ways on two machines, which is the one thing a
 * tie-breaker must not do.
 */
export function projectsByCreation(recent: readonly RecentProject[]): RecentProject[] {
  return [...recent].sort((one, other) => {
    const when = byCodeUnit(listedAt(other), listedAt(one))
    return when === 0 ? byCodeUnit(one.path, other.path) : when
  })
}

/**
 * How many are kept. Long enough to hold a month of work, short enough that the shelf stays a
 * shortcut rather than a file manager.
 */
export const RECENT_PROJECTS_MAX = 12

/**
 * The folder the system's picker should open on, or nothing to let it reopen wherever it was
 * left.
 *
 * Letting it decide alone is what put the second project of a session INSIDE the first: the
 * dialog reopens where it last was, and after a creation that is the project's own folder.
 *
 * Derived rather than stored, from the shelf rather than from `lastProject` — the shelf survives
 * a folder being forgotten. The preference wins when it is set: it is the answer the user typed,
 * and an empty one means "follow me", which is precisely what the fallback does.
 */
export function projectPickerFolder(
  projectsFolder: string | undefined,
  recent: readonly RecentProject[],
): string | undefined {
  if (projectsFolder) return projectsFolder

  const [last] = projectsByCreation(recent)
  return last && parentFolder(last.path)
}

/**
 * What a project is CALLED: the name of its folder, and nothing else — one source of truth.
 *
 * NFC like every other name this studio reads off the disk: macOS writes `Été` as two code
 * points, and a name compared or drawn as it came would not match the same word typed here.
 */
export function projectName(path: string): string {
  // 🛑 The trailing separator goes FIRST: `/Projets/jeu1/` is a path a model writes and a picker
  // returns, and read as it came the name is the empty string — an unnamed project everywhere.
  return pathBaseNameOf(path.replace(/[/\\]+$/, '')).normalize('NFC')
}

/**
 * The folder holding an absolute path, or nothing when there is no folder above it to name.
 *
 * Both separators, unlike `parentOf` in `domain/folder.ts`, which walks the `/`-joined ids the
 * explorer uses: this one reads paths the OS wrote, and a Windows project would otherwise answer
 * its own whole path.
 *
 * A project at a drive root answers nothing rather than `C:` — that is not a folder but a
 * drive-relative prefix, which the system resolves against a working directory nobody chose.
 */
function parentFolder(path: string): string | undefined {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (cut <= 0) return undefined

  const parent = path.slice(0, cut)
  return parent.endsWith(':') ? undefined : parent
}

/**
 * Whether a path names a place on this disk, or only a folder to be put somewhere.
 *
 * 🛑 Both shapes, and Windows too: a model that answers `test3` means a NAME, and one that
 * answers `C:\\Projets\\test3` or `/Users/…/test3` means a place. Read wrong either way, the
 * studio writes a project where nobody asked for one.
 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/**
 * Why a folder will not serve as a project. Each case asks the person for a different thing: pick
 * another folder, repair this one, update the studio, or — for a folder inside a project already,
 * or one holding projects — name one that is neither.
 */
export type ProjectOpenFailure =
  'not-a-project' | 'unreadable' | 'too-new' | 'nested' | 'holds-projects'

/** Why a project cannot take a NAME. About the name asked for, never about the folder. */
export type ProjectRenameFailure = 'unsafe-name' | 'taken'

const PROJECT_RENAME_FAILURES: readonly ProjectRenameFailure[] = ['unsafe-name', 'taken']

const PROJECT_OPEN_FAILURES: readonly ProjectOpenFailure[] = [
  'not-a-project',
  'unreadable',
  'too-new',
  'nested',
  'holds-projects',
]

/**
 * The reason inside a rejection that crossed the boundary, or nothing for a failure that is not
 * about the folder.
 *
 * 🛑 Matched at the END, never compared whole: `ipcMain.handle` wraps what it rethrows — `Error
 * invoking remote method 'project:create': Error: holds-projects` — so an equality test never
 * fires and every refusal reads as unexpected.
 */
export const projectFailureIn = (message: string): ProjectOpenFailure | null =>
  codeIn(message, PROJECT_OPEN_FAILURES)

export const projectRenameFailureIn = (message: string): ProjectRenameFailure | null =>
  codeIn(message, PROJECT_RENAME_FAILURES)

/**
 * Where a project called `name` goes when the model named no place: under the folder this person
 * keeps projects in. Nothing where none is known yet, which is the first project of a machine.
 */
export function projectPathFor(name: string, within: string | undefined): string | undefined {
  if (isAbsolutePath(name)) return name
  if (!within) return undefined

  /**
   * 🛑 A NAME, never a path: `../Secret` joined to the projects folder leaves it, and the main
   * process only checks that what it receives is absolute — `..` passes that. A model that means
   * somewhere else says so absolutely, where a person can read it in the question.
   */
  if (/[\\/]/.test(name) || name.split(/[\\/]/).includes('..') || name.startsWith('~')) {
    return undefined
  }

  return `${within.replace(/[\\/]$/, '')}/${name}`
}

/**
 * The list after a project has been opened: most recently opened first, one entry per path,
 * bounded. This is STORAGE order — what gets evicted — and not what any screen draws; see
 * `projectsByCreation`.
 *
 * Pure, and here rather than in the main process, because it is the whole of the policy — and
 * because "opening a project I already have must not list it twice" is the sort of rule that
 * only ever gets checked by a test.
 */
export function withRecentProject(
  recent: readonly RecentProject[],
  project: Project,
  openedAt: string,
): RecentProject[] {
  const entry: RecentProject = {
    path: project.path,
    openedAt,
    createdAt: project.manifest.createdAt,
  }

  return [entry, ...withoutRecentProject(recent, project.path)].slice(0, RECENT_PROJECTS_MAX)
}

/**
 * What opening a project asks of the account list.
 *
 * `adopt` and `missing` both end with the project pointed at whatever is active. They stay apart
 * because only one of them owes the user a sentence: a project that never had a key is not a
 * project whose key went away.
 */
export type ProjectAccountPlan =
  | { kind: 'keep' }
  | { kind: 'adopt' }
  | { kind: 'restore'; account: AccountSummary }
  | { kind: 'missing' }

/**
 * Which account a project should open on, given the accounts held.
 *
 * Here rather than in the main process, for the reason `withRecentProject` gives above: this is
 * the whole of the policy, and it is the sort of rule only a test ever checks.
 *
 * An absent link means "nothing said", never "no account" — removing a key and adding it back
 * mints a fresh id, so a live key can leave a link naming nothing.
 */
export function planProjectAccount(
  link: string | undefined,
  accounts: readonly AccountSummary[],
): ProjectAccountPlan {
  if (link === undefined) return { kind: 'adopt' }

  const held = accounts.find(account => account.id === link)
  if (!held) return { kind: 'missing' }

  return held.active ? { kind: 'keep' } : { kind: 'restore', account: held }
}

/**
 * A table keyed BY FOLDER, re-keyed onto the folder a project moved to.
 *
 * 🛑 Three of them exist — `storage.projectAccounts`, `ai.projectRoles`, and the layouts a window
 * adopts — and a rename moves the key of all three since 2026-08-31. Left behind, the account link
 * is orphaned and `planProjectAccount` answers `adopt`: the project silently comes back on
 * whichever key is active, and the write that follows is destructive.
 */
export function movedProjectKey<T>(
  held: Record<string, T>,
  from: string,
  to: string,
): Record<string, T> {
  const moving = held[from]
  if (moving === undefined) return held

  return {
    ...Object.fromEntries(Object.entries(held).filter(([key]) => key !== from)),
    [to]: moving,
  }
}

/**
 * The list with one entry moved to the folder it now lives in, and nothing else touched — not its
 * dates, and above all not its ORDER: a rename is not an opening.
 *
 * 🛑 The destination is dropped FIRST. Left in, a rename onto a folder the shelf already knew
 * listed it twice — two rows, one folder, measured 2026-08-31. The name is not written at all: it
 * is read off the path, so moving the entry IS renaming it.
 *
 * A path the list does not hold is not an error: the open project need not be a remembered one.
 */
export function movedRecentProject(
  recent: readonly RecentProject[],
  from: string,
  to: string,
): RecentProject[] {
  return recent
    .filter(entry => entry.path !== to || entry.path === from)
    .map(entry => (entry.path === from ? { ...entry, path: to } : entry))
}

/**
 * The list without one folder — what a project moved or deleted since it was last opened comes
 * to. Beside the other half of the policy rather than written into whichever surface noticed:
 * an opening can fail anywhere, and a list that only forgets when the home clicked it is a list
 * that keeps offering a folder nothing can open.
 */
export function withoutRecentProject(
  recent: readonly RecentProject[],
  path: string,
): RecentProject[] {
  return recent.filter(candidate => candidate.path !== path)
}

/**
 * Rebuildable cache, not user content: proxies, waveforms and filmstrips of ingested media.
 * Named rather than spelled out at each use — the folder the ingest writes into and the folder
 * the project creates have to be the same string.
 */
export const PROXIES_FOLDER = `${INDEX_FOLDER}/proxies`
export const PEAKS_FOLDER = `${INDEX_FOLDER}/peaks`
export const FILMSTRIPS_FOLDER = `${INDEX_FOLDER}/filmstrips`
/**
 * Stills for the assets that are not pictures: a mesh's, brought down with its bytes, and a
 * rush's — the library's when it came from there, one grabbed by ffmpeg when it came off a disk.
 */
export const POSTERS_FOLDER = `${INDEX_FOLDER}/posters`
/**
 * What the explorer draws on its tiles, for every file it shows — asset or not. Beside the
 * catalogue rather than beside the file: `.index/` is thrown away without breaking anything,
 * and a project that changes machine carries its own previews.
 */
export const THUMBNAILS_FOLDER = '.index/thumbnails'
/**
 * How much of the disk those previews may take, per project, before the least recently read of
 * them are dropped. A folder of ten thousand pictures would otherwise grow without end.
 */
export const THUMBNAILS_MAX_BYTES = 200 * 1024 * 1024
/**
 * How large one is rendered — ONE size for every reader, the tree's little slot included, which
 * the browser then draws smaller. Here because the main process renders them and cannot read the
 * renderer; `MAX_THUMBNAIL`, the gauge the grid zooms to, IS this number.
 */
export const THUMBNAIL_SIZE = 208

/**
 * The machine's own, created with the project and never the user's to touch: hidden, read-only,
 * rebuildable. Every one of them sits under a leading dot, which is what `isStudioPrivate` reads
 * instead of this list — a list is what gets a fifth entry added without the predicate hearing
 * about it.
 */
export const MACHINE_FOLDERS: readonly string[] = [
  INDEX_FOLDER,
  PROXIES_FOLDER,
  PEAKS_FOLDER,
  FILMSTRIPS_FOLDER,
  POSTERS_FOLDER,
  THUMBNAILS_FOLDER,
]

/**
 * The one folder every asset used to be filed under, back when the tree was the studio's.
 *
 * Nothing writes into it any more and nothing is migrated out of it: a project made before the
 * change keeps its files exactly where they are, and the next import lands in `Images/` beside
 * them. That leaves a project wearing two trees, which is a decision rather than an accident —
 * named here only so the studio can SAY it once, in the journal, instead of leaving the user to
 * work it out from a folder that appeared on its own.
 */
export const LEGACY_ASSETS_FOLDER = 'assets'

/**
 * Whether an asset that just landed at `path` was filed in the DEFAULT folder for its kind.
 *
 * Half of what says a project wears two trees, and the free half: the other is whether the old
 * folder is still there, which only the disk knows. Asked FIRST, so a project that never had one
 * does not pay a `stat` per import to be told so.
 *
 * False for a second pull, which keeps the path the row already had — under `assets/img` for a
 * project of that age — and false for a file the user has since filed deeper. Neither is the
 * studio choosing a tree.
 */
export function landedInDefaultFolder(path: string | undefined, folder: string): boolean {
  return path !== undefined && parentOf(path) === folder
}

/**
 * How far the pass reconciling the catalogue with the project folder has got.
 *
 * `total` is 0 until the pass knows how much it will read — and stays 0 for the ordinary pass,
 * where every row is where the catalogue says and nothing is read at all. A window shows the
 * counts only once there is something to count.
 */
export type RescanState = {
  running: boolean
  done: number
  total: number
}

export const IDLE_RESCAN: RescanState = { running: false, done: 0, total: 0 }

export {
  RECENT_DOCUMENTS_MAX,
  withRecentDocument,
  withoutProjectDocuments,
  type RecentDocument,
} from './projectRecent'
