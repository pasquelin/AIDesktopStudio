import { isPrivatePath } from './folder'
import { INDEX_FOLDER } from './project'

/**
 * Which of the three stores a copy sits in, read off its path alone.
 *
 * Established, never guessed, and that is why it belongs on the row: the three stores must not
 * be confused, and a person told « these two files hold the same bytes » cannot decide anything
 * without knowing that one of them is the studio's own and not theirs to have put there.
 */
export type CopyStore = 'visible' | 'internal' | 'machine'

/** All three, for the guard that holds the bundles to the labels composed from them. */
export const COPY_STORES: readonly CopyStore[] = ['visible', 'internal', 'machine']

/**
 * What the studio holds `path` for: nothing (the user's), a durable internal resource, or a
 * cache it can rebuild.
 *
 * `.index/` is the one cache — `isPrivatePath` already says what the studio owns, and the rest
 * of what it owns travels with the project. Two facts, both already spelt once elsewhere; no
 * third list of folders to fall out of step.
 */
export function copyStoreOf(path: string): CopyStore {
  if (!isPrivatePath(path)) return 'visible'
  return path === INDEX_FOLDER || path.startsWith(`${INDEX_FOLDER}/`) ? 'machine' : 'internal'
}

/** One file holding the group's bytes. Everything here is measured off the row, not inferred. */
export type FileCopy = {
  assetId: string
  path: string
  name: string
  /** `null` for a row that never recorded a length — the catalogue's own gap, said as one. */
  bytes: number | null
  addedAt: string
  store: CopyStore
}

/**
 * Files whose fingerprints match — CANDIDATES, and the word is the whole contract.
 *
 * What is established: these paths carry the same fingerprint, and each one is where it says.
 * What is NOT: that any of them is redundant. A `.gltf` and its texture may legitimately hold
 * one picture twice, an export keeps its own copy on purpose, and the studio itself files the
 * original of a converted mesh beside the conversion. Nothing here decides; it reports.
 */
export type CopyGroup = {
  hash: string
  copies: readonly FileCopy[]
}

/**
 * How many bytes a group would give back if every copy but one went. Never acted on alone.
 *
 * Summed rather than multiplied out from the first row: `bytes` is a column of its own, written
 * at its own moment, so two rows of one fingerprint can disagree — and a figure the surface
 * calls measured must not be extrapolated from one of them.
 */
export function redundantBytesOf(group: CopyGroup): number | null {
  const sized = group.copies.filter(copy => copy.bytes !== null)
  if (sized.length !== group.copies.length || sized.length < 2) return null
  return sized.slice(1).reduce((total, copy) => total + (copy.bytes ?? 0), 0)
}

/** URL fragment the shared bundle reads to render the copies diagnosis. */
export const COPIES_ROUTE = 'copies'

export function isCopiesRoute(hash: string): boolean {
  return hash.replace(/^#/, '') === COPIES_ROUTE
}
