import { natureOf } from './fileRole'

/**
 * What a batch of file gestures did, and what it would not do.
 *
 * In `shared/` because the answer crosses the bridge whole: the window that asked shows what
 * was refused, and the window that did not ask hears the same thing as an echo and reads its
 * tree again. The main process is the only side that touches the disk; this is what it says
 * about it, in relative paths, as every path this studio hands a window is.
 */

/** One file that moved: where it was, where it now is. Both relative to the project folder. */
export type PathChange = {
  /** `''` for a file that CAME — a folder created, a copy laid down. */
  from: string
  /** `''` for a file that WENT — the trash, which is the one gesture with no way back. */
  to: string
}

/**
 * Why one member of a batch did not happen.
 *
 * `private` is what the studio holds for itself. It says nothing about the user's rights and
 * everything about what still reads a path: `assets/` is where a file's role is read from until
 * the reconciliation pass exists, so a picture dragged out of `assets/img` would stop being a
 * picture. Trashing one is a different question, and is allowed — the catalogue follows.
 */
type RefusalReason = 'exists' | 'into-itself' | 'missing' | 'private'

export type Refusal = { path: string; reason: RefusalReason }

/**
 * What a batch actually did. **A partial result is the ordinary one**: two hundred and
 * ninety-eight rushes moved and two names already taken is what a file browser answers, where a
 * throw would have undone the lot over them.
 *
 * `batch` names it, so the window that asked can tell its own echo from another window's, and
 * so the undo stack has something to pop by.
 */
export type FileOutcome = {
  done: readonly PathChange[]
  refused: readonly Refusal[]
  batch: string
}

/** Whether either half of the undo stack holds anything — what greys the two menu rows. */
export type FileHistory = { undo: boolean; redo: boolean }

/**
 * Whether a batch touched a file the studio opens as a DOCUMENT, and so whether the windows
 * have to list them again.
 *
 * Read off the name alone, which is the one table that answers it — `natureOf`. A scene document
 * moved into another folder is the same document at another path, and the panel that lists
 * documents walks the disk rather than a row, so it learns nothing until it is told.
 */
export function touchesDocuments(done: readonly PathChange[]): boolean {
  return done.some(({ from, to }) => natureOf(to || from).role === 'edit')
}
