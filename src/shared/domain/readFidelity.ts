/**
 * How faithfully the studio read the file a document edits — the one thing that says whether a
 * save may write back over it.
 *
 * Established at the READ and never recomputed from the document: a crop, a resize and a rotation
 * all leave a document that no longer measures its file, and none of them is a reduction. What
 * `matchesAsset` answers cannot tell those two apart, which is why a refusal built on it refused
 * five crops in a row before being removed.
 *
 * `unknown` is the default, and it is a refusal rather than a shrug: a file the studio could not
 * measure is one it cannot promise to have read whole, and « no information » has never been a
 * licence to overwrite.
 */
export type ReadFidelity = 'faithful' | 'reduced' | 'unknown'

const READ_FIDELITIES: readonly ReadFidelity[] = ['faithful', 'reduced', 'unknown']

export function isReadFidelity(value: unknown): value is ReadFidelity {
  return READ_FIDELITIES.some(fidelity => fidelity === value)
}

/** What a file read off disk says, or `unknown` for one written before this was carried. */
export function readFidelityOf(value: unknown): ReadFidelity {
  return isReadFidelity(value) ? value : 'unknown'
}

/**
 * Whether the source file may be written over. Only a faithful read licenses it — see the type.
 */
export function mayOverwriteSource(fidelity: ReadFidelity): boolean {
  return fidelity === 'faithful'
}
