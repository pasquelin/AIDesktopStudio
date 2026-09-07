import { mdiFile, mdiFolder } from '@mdi/js'
import { UiIcon } from '@/components/UiIcon'
import type { EntryKind } from './entryKind'

/** The tile draws a filled silhouette where the tree draws an outline, emblem apart. */
const SOLID: Record<Exclude<EntryKind, 'document'>, string> = { folder: mdiFolder, file: mdiFile }

export type EntryFaceProps = {
  kind: EntryKind
  /** A document's space glyph, or the section a folder serves. */
  icon: string
  /** The section's hue. Only a folder wears it; every other kind keeps the grey silhouette. */
  ink?: string
}

/**
 * The shape a grid tile draws where it has no picture.
 *
 * The tree inks the GLYPH and the grid inks the FOLDER: measured, a section's ink on the grey
 * silhouette reads 1.65:1 dark and 1.36 light, under the 3 WCAG 1.4.11 asks of a glyph that
 * informs. `tokensHue.test.ts` holds the pair the tinted folder makes instead.
 */
export function EntryFace({ kind, icon, ink }: EntryFaceProps) {
  // A folder of no section keeps the plain grey silhouette: `icon` is then the folder glyph
  // itself, and knocking it out of its own shape would draw a folder inside a folder.
  const emblazoned = kind === 'folder' && ink !== undefined

  return (
    // Squared off rather than left to fill the slot: the emblem is placed by the folder path's
    // own coordinates, which only hold over the box that path is drawn in.
    <div className="relative aspect-square h-full">
      <UiIcon
        path={kind === 'document' ? icon : SOLID[kind]}
        size="fill"
        className={emblazoned ? ink : 'text-muted/80'}
      />
      {emblazoned && (
        // The chassis grey the rails wear, Alban's call — not the ground the bare tile lets
        // through, which is `panel` and reads 1.19:1 against it.
        <span className="folder-emblem text-chassis">
          <UiIcon path={icon} size="fill" />
        </span>
      )}
    </div>
  )
}
