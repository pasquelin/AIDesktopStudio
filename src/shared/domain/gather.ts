/**
 * What a file did or did not do on its way into another project.
 *
 * `held` is not a failure: the destination already carried those exact bytes at that path, so
 * copying them again would be a second copy of the same file — which is the one thing a
 * gathering must not leave behind.
 */
export type GatheredFile = { path: string; state: 'copied' | 'held' | 'refused' }

/**
 * What a gathering did, file by file, and how many catalogue rows the destination gained.
 *
 * `rows` is what makes the destination able to OPEN the document rather than merely hold its
 * files: a document cites its images and its clips by catalogue id as much as by name, so the
 * ids have to arrive with the bytes.
 */
export type GatherReport = {
  files: readonly GatheredFile[]
  rows: number
  /** Set when nothing was attempted at all, and why. */
  refused?: GatherRefusal
}

export type GatherRefusal = 'not-a-project' | 'same-project' | 'no-document'

/** All three, for the guard that holds the bundles to the sentence each one is said with. */
export const GATHER_REFUSALS: readonly GatherRefusal[] = [
  'not-a-project',
  'same-project',
  'no-document',
]

export function gatheredCountOf(report: GatherReport, state: GatheredFile['state']): number {
  return report.files.filter(file => file.state === state).length
}
