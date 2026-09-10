/**
 * What the studio can READ from another application, and what it will not rebuild.
 *
 * The twin of `exportRegistry`, and it answers the same question the other way round: an export
 * says what leaving destroys, an import says what arriving never brings. Both are said BEFORE the
 * click, because « it opened but half of it is gone » discovered afterwards is the worse of the
 * two failures.
 */

import { capabilityOf, type CapabilityTrait, type KnownFormat } from './formatCapability'
import type { DocumentKind } from './document'

/** A (section, format read) pair. Named for the section first, as the export targets are. */
export type ImportSourceId = 'montage.otioz'

export const IMPORT_SOURCE_IDS: readonly ImportSourceId[] = ['montage.otioz']

export type ImportSource = {
  /** What the picker filters on, and what a file has to be named to be offered this reader. */
  extension: string
  /** The document the studio makes of it. */
  kind: DocumentKind
  /**
   * The format the file's CONTENT is, so what the reader rebuilds is derived rather than listed
   * again: the same pair of functions writes it and reads it back, and two lists would disagree
   * the day one gains a trait.
   */
  format: KnownFormat
}

const SOURCES: Record<ImportSourceId, ImportSource> = {
  'montage.otioz': {
    extension: '.otioz',
    // A montage, never a take: a take keeps only its audio tracks, so a bundle carrying a picture
    // track would open on a surface that drops it — see `montageHoldsMore`'s own blind spot.
    kind: 'sequence',
    format: 'otio',
  },
}

export const importSourceOf = (id: ImportSourceId): ImportSource => SOURCES[id]

/**
 * What a file written by ANOTHER application does not bring — the STRUCTURAL half.
 *
 * Everything outside `interchange`: `extended` is what this studio writes beside the standard part
 * and reads back from its own files. Which is why the import asks `montageRebuildsExtended` of the
 * payload before saying any of it — a `.otioz` this studio wrote brings every one of them back.
 */
export function lossesImportingFrom(id: ImportSourceId): CapabilityTrait[] {
  const { interchange, extended, dropped } = capabilityOf(SOURCES[id].format)
  return [...extended, ...dropped].filter(trait => !interchange.includes(trait))
}
