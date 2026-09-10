import type { DocumentKind } from './document'

/**
 * A document that cites files — the answer to « what would this deletion break? ».
 *
 * `used` names which of the files asked about this document mentions, so a selection of thirty
 * can be reported per file rather than as one undifferentiated warning.
 */
export type FileUse = {
  title: string
  path: string
  kind: DocumentKind
  used: readonly string[]
}
