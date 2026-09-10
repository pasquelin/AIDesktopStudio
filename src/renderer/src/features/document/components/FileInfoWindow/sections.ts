import type { Asset } from '@shared/domain/asset'

/**
 * The four screens of a file's information window, in the order its column lists them.
 *
 * Here rather than in `FileInfoWindow.tsx` for the reason `features/usage/components/Usage/Window/sections.ts` is: the body is a
 * file of its own and shares this type, and importing it back from the parent makes a cycle.
 */
export type FileInfoSectionId = 'general' | 'media' | 'catalogue' | 'copies' | 'uses' | 'git'

/** All six, for the guard that holds the bundles to them — `fileInfoSectionsOf` picks. */
export const FILE_INFO_SECTIONS: readonly FileInfoSectionId[] = [
  'general',
  'media',
  'catalogue',
  'copies',
  'uses',
  'git',
]

/** What decides a screen other than `general`, each answered where the answer lives. */
export type FileInfoSources = {
  asset: Asset | null
  /** The project is under git AND this entry is a file — git reports files, never folders. */
  versioned: boolean
  /**
   * Whether this entry is a FILE. Only a file can be cited by a document, and the answer for a
   * folder would be « nothing cites it » — which reads as a fact rather than as a question that
   * does not apply.
   */
  file: boolean
}

/**
 * Which runs this entry actually has — `general` always, the disk answering for everything.
 *
 * ABSENT rather than empty, the arbitration this window was built on: a `.txt` will never have a
 * catalogue row, and a « Média » run saying nothing three times reads as a studio that failed.
 */
export function fileInfoSectionsOf({
  asset,
  versioned,
  file,
}: FileInfoSources): FileInfoSectionId[] {
  const media =
    asset !== null &&
    (asset.probe !== undefined || (asset.width !== undefined && asset.height !== undefined))

  return FILE_INFO_SECTIONS.filter(
    id =>
      id === 'general' ||
      (id === 'media' && media) ||
      (id === 'catalogue' && asset !== null) ||
      // A fingerprint is what makes the question askable at all: without one, « no other file
      // holds these bytes » would be a claim nothing measured.
      (id === 'copies' && asset?.hash !== undefined) ||
      (id === 'uses' && file) ||
      (id === 'git' && versioned),
  )
}
