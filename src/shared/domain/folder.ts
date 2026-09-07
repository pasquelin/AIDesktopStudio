/**
 * The project folder as the explorer walks it — one level at a time, never the whole tree.
 *
 * A project's `assets/img` can hold thousands of files, and a reader who never opens it should
 * not pay for them. So the panel asks for the folder it is expanding, and nothing else.
 */
/**
 * The two things a project folder holds. A list as well as a union: a screen composes a word
 * from it, and the bundles are held to that list.
 */
export type FileKind = 'folder' | 'file'

export const FILE_KINDS: readonly FileKind[] = ['folder', 'file']

export type FolderEntry = {
  /**
   * Where the entry is, relative to the project root, with `/` between segments on every
   * platform. It is the tree's id as well as the path: two entries of a folder cannot share a
   * name, so the path is already unique, and one identifier is one thing to keep in step.
   */
  path: string
  name: string
  kind: FileKind
}

/** The root of the tree, which is the project folder itself. */
export const FOLDER_ROOT = ''

/**
 * What the explorer does not show. The rule is the platforms' own — a leading dot — and it
 * covers exactly the two the studio puts there: `.index/`, which it can rebuild, and
 * `.project.json`, which is its own bookkeeping. Hiding them by name rather than by a list is
 * what keeps a third one from having to be remembered.
 *
 * Everything else shows, including what the studio cannot open: that is the whole difference
 * between an explorer and a list of documents.
 */
export function isHiddenEntry(name: string): boolean {
  return name.startsWith('.')
}

/**
 * Folders first, then by name — the order every file browser uses, and the one that makes a
 * long folder readable without scrolling it twice.
 *
 * `localeCompare` rather than `<`: a project written in French files `Étude` between `Etat` and
 * `Fond` for a reader, and after `Zoo` for a code unit comparison.
 *
 * The language is taken rather than left out, which is why this is a factory and not the
 * comparator itself. A bare `localeCompare` answers in whatever locale the OS was installed in —
 * a language the studio may not even speak: measured, a Swedish desktop files `Ärger` past `Zoo`
 * and a Turkish one splits the two `i`s, neither of which French or English asks for.
 */
export function entriesByName(
  language: string,
  /** Names the other way round. Folders stay first: reversing that is a different browser. */
  descending = false,
): (one: FolderEntry, other: FolderEntry) => number {
  return (one, other) => {
    if (one.kind !== other.kind) return one.kind === 'folder' ? -1 : 1
    const order = one.name.localeCompare(other.name, language)
    return descending ? -order : order
  }
}

/**
 * Whether `path` is inside `folder` — STRICTLY inside, so a folder is never under itself.
 *
 * That last word is the whole of it. A folder read again replaces what is under it, and a
 * folder counted as being under itself replaces its own row: opening `assets` emptied the tree
 * down to nothing, because the listing of `assets` never contains `assets`. Its row belongs to
 * its parent's listing, and only that listing may take it away.
 */
export function isUnder(path: string, folder: string): boolean {
  return folder === FOLDER_ROOT || path.startsWith(`${folder}/`)
}

/** The folder an entry sits in, which is its parent in the tree. `null` for a root entry. */
export function parentOf(path: string): string | null {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? null : path.slice(0, cut)
}

/**
 * What an entry is CALLED — the last segment of its path.
 *
 * Beside `parentOf` rather than taken from `node:path`: `basename` reads a backslash as a
 * separator on Windows and not elsewhere, where these paths use `/` on every platform and are
 * refused if they hold anything else. Both sides ask it, and the renderer has no `node:path`.
 */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * The path an entry called `name` has inside `folder` — the inverse of `parentOf`.
 *
 * The root is what makes this worth a function: `FOLDER_ROOT` is the empty string, so joining on
 * `/` unconditionally yields `/Notes`, an absolute path every boundary of the studio refuses.
 */
export function pathIn(folder: string, name: string): string {
  return folder === FOLDER_ROOT ? name : `${folder}/${name}`
}

/**
 * The folders leading to `folder`, the project itself first and `folder` last.
 *
 * Walked with `parentOf` rather than split on the separator, which is the same rule both
 * processes already read a path by.
 */
export function folderTrail(folder: string): readonly string[] {
  const above: string[] = []
  for (let at: string | null = folder; at !== null && at !== FOLDER_ROOT; at = parentOf(at))
    above.unshift(at)

  return [FOLDER_ROOT, ...above]
}

/**
 * Whether the studio holds `path` for itself — the ONE spelling of that question, and the whole
 * of what a project folder is not the user's to arrange.
 *
 * A leading dot on ANY segment, rather than a list of the folders the studio writes: `.index/`
 * and its four caches, `.project.json`, `.ai-desktop-studio/`. A list is what gets a sixth entry added
 * without this predicate hearing about it, and the failure that follows is a user renaming the
 * file that says the folder is a project at all. The dot is a rule the writer cannot forget,
 * because it is the same rule that hides the file.
 *
 * READ-ONLY, not invisible: the explorer offers to reveal these rows, and a row that can be seen
 * is a row a menu can be raised on — every gesture over them is refused rather than absent.
 *
 * `assets/` and `documents/` used to be here too, and that is what this phase removes: nothing
 * reads a file's role off the folder it sits in any more, so nothing is lost by letting a
 * picture leave `assets/img`. What kept the catalogue in step was the ban; what keeps it in step
 * now is `repath` and the rescan.
 */
function isStudioPrivate(path: string): boolean {
  return path.split('/').some(isHiddenEntry)
}

/**
 * Whether `path` is the studio's rather than the user's to act on — read on BOTH sides, as
 * `canMoveInto` is: the panel greys the gesture out and the main process refuses it regardless,
 * a window not being what decides what gets written.
 *
 * `contents` is the difference the trash draws, and after this phase it comes down to the
 * project folder itself: it RECEIVES, so it is not private to a drop, but throwing it away
 * would throw away the project. Nothing under a dot may go either way.
 */
export function isPrivatePath(path: string, contents: 'own' | 'shown' = 'own'): boolean {
  if (contents === 'shown' && path === FOLDER_ROOT) return true
  return isStudioPrivate(path)
}

/**
 * Why `path` may not go into `folder`, or `null` when it may.
 *
 * **The one spelling of the rule**, and it answers with a REASON rather than a boolean because
 * its two readers need different halves of the same answer: the panel greys the gesture out and
 * only needs to know THAT it is refused, while the main process reports what was refused and
 * why — 297 moved, 3 turned away, each with its sentence. Written twice, the two would be two
 * rules the day one of them is edited.
 *
 * What the studio holds for itself refuses on BOTH sides — as a source and as a destination.
 * `assets/` and `documents/` are no longer among them: a picture dragged out of `assets/img` is
 * still a picture, its role being read off its extension and its catalogue row, and the row
 * follows the file through `repath`.
 *
 * **The root receives**: dropping on the blank below the tree means "to the project folder", and
 * a file that could enter a folder the user made but never leave it was a browser missing one of
 * its two ordinary gestures.
 *
 * What it cannot answer is what only the disk knows: whether `folder` IS a folder, whether
 * either of them is still there, and whether the name is taken where it lands. The panel reads
 * the node's kind; `filePlan.ts` reads the folders and adds those refusals to this one.
 */
export function moveRefusal(path: string, folder: string): 'private' | 'into-itself' | null {
  if (isPrivatePath(path) || isPrivatePath(folder)) return 'private'

  // A folder dropped inside itself would take its own destination with it, and the rename that
  // carries it out would leave the whole subtree unreachable.
  if (folder === path || isUnder(folder, path)) return 'into-itself'

  return null
}

/** The same rule as the panel reads it: may this be dropped there, yes or no. */
export function canMoveInto(path: string, folder: string): boolean {
  return moveRefusal(path, folder) === null
}
