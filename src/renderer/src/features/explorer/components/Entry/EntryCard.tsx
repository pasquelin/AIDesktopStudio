import { mdiCircleMedium } from '@mdi/js'
import { useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { InlineRename } from '@/components/InlineRename'
import { MediaTile } from '@/components/MediaTile'
import { rowDrag } from '@/components/rowDrag'
import { UiIcon } from '@/components/UiIcon'
import { cn } from '@/helpers/cn'
import { copiesDropTone, warnsDropTone, type DragLike, type DropTone } from '@/helpers/drag'
import { EntryFace } from './EntryFace'
import type { EntryKind } from './entryKind'

export type EntryCardProps = {
  /** What the card is called — the document's own name where there is one, the file name else. */
  name: string
  /** The glyph of a document's space, and of the section a folder serves — see `EntryFace`. */
  icon: string
  /** The section's hue. Only a folder silhouette wears it — see `EntryFace`. */
  ink?: string
  /** A preview of the file, asked of the main process and rendered there. */
  preview?: string
  /**
   * Drawn as a SHAPE filling the tile, with no frame around it — a folder, a file and a document
   * alike. What the grid was missing: a folder and a file were the same dark square wearing a
   * different little sign.
   */
  kind: EntryKind
  /** Whether a tab is showing this file right now. Only a document can be. */
  open: boolean
  /** Whether this entry has been CUT and is waiting for a paste. */
  waiting?: boolean
  /** Fired with the new name, or with the old one when the edit was abandoned. */
  onRename?: (name: string) => void
  /** What picking this card up carries — the whole selection where it is part of one. */
  dragIds: readonly string[]
  /** Whether it may be picked up at all. What the studio keeps for itself is shown, not moved. */
  pickable: boolean
  /** Whether what is in the hand may land IN this card — only the panel can say, see `onPickUp`. */
  accepts: boolean
  /**
   * A drag that did NOT start in this grid — the asset shelf's. The tree takes the same object
   * under the same name, so one gesture reads alike in both views of the folder.
   *
   * `accepts` is its own here rather than the one above: that one answers about what this grid
   * picked up, and nothing was. The panel resolves it from the same predicate the tree uses.
   */
  foreign?: {
    accepts: boolean
    carries: (event: DragLike) => boolean
    tone?: (event: DragLike) => DropTone
    onDrop: (event: DragEvent<HTMLElement>) => void
  }
  onDropInto: (ids: readonly string[]) => void
  /** What this card just picked up, so the panel can answer `accepts` for its neighbours. */
  onPickUp: (ids: readonly string[]) => void
  /** The gesture is over, however it ended — dropped here, dropped elsewhere, or abandoned. */
  onRelease: () => void
}

/**
 * One entry of the project folder, as a tile — the grid's counterpart to `EntryRow`.
 *
 * It carries the drag itself where the row leaves it to `Tree`: `Collection` owns selection,
 * activation and the menu for every panel that lists items, and none of the others drags.
 */
export function EntryCard({
  name,
  icon,
  ink,
  preview,
  kind,
  open,
  waiting,
  onRename,
  dragIds,
  pickable,
  accepts,
  foreign,
  onDropInto,
  onPickUp,
  onRelease,
}: EntryCardProps) {
  const { t } = useTranslation()
  const [over, setOver] = useState<DropTone | null>(null)

  return (
    <div
      // `draggable` on a container makes everything inside it draggable too, so the guard below is
      // what keeps a name being typed from starting a drag instead of selecting a word.
      draggable={pickable && onRename === undefined}
      onDragStart={event => {
        // Both conditions are read HERE and not left to `draggable`: a picture is natively
        // draggable, so its `dragstart` bubbles up even from a card the attribute refuses — what
        // the studio keeps for itself would otherwise be dragged by its preview.
        if (onRename || !pickable) return event.preventDefault()
        rowDrag.start(event, dragIds)
        onPickUp(dragIds)
      }}
      onDragOver={event => {
        if (foreign?.carries(event)) {
          if (!foreign.accepts) return
          event.preventDefault()
          const tone = foreign.tone?.(event) ?? 'accepted'
          event.dataTransfer.dropEffect = copiesDropTone(tone) ? 'copy' : 'none'
          return setOver(tone)
        }
        if (!accepts || !rowDrag.carries(event)) return
        // Without this the browser refuses the drop, and neither callback ever fires.
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver('accepted')
      }}
      onDragLeave={() => setOver(null)}
      onDragEnd={() => {
        setOver(null)
        onRelease()
      }}
      onDrop={event => {
        setOver(null)
        // Before the grid's own reading, which answers about what IT picked up — nothing did.
        if (foreign?.carries(event)) {
          event.preventDefault()
          if (foreign.accepts) foreign.onDrop(event)
          return
        }
        onRelease()
        if (!accepts) return
        event.preventDefault()
        const carried = rowDrag.idsFrom(event)
        if (carried.length > 0) onDropInto(carried)
      }}
      className={cn(
        'size-full',
        // The outline the tree draws on the row a drop lands in, so one gesture reads alike in both.
        over === 'accepted' && 'outline-accent rounded-(--radius-sc-md) outline -outline-offset-1',
        warnsDropTone(over) && 'outline-danger rounded-(--radius-sc-md) outline -outline-offset-1',
        // Cut, and on its way out. An opacity rather than a quiet ink: what dims is a PICTURE, and
        // there is no ink to quieten on one — exempted by name in `tokens.test.ts`.
        waiting && 'opacity-50',
      )}
    >
      <MediaTile
        caption={name}
        url={preview}
        bare
        // A thumbnail is cut to the file silhouette rather than framed: the tile then says what
        // the entry IS as plainly as the folder next to it, without hiding what it holds.
        cutout={kind === 'file'}
        face={<EntryFace kind={kind} icon={icon} ink={ink} />}
        {...(onRename
          ? {
              captionField: (
                <InlineRename value={name} label={t('documents.renameLabel')} onCommit={onRename} />
              ),
            }
          : {})}
        {...(open
          ? {
              // The corner rather than the glyph the row tints: `MediaTile` draws its own
              // fallback, and a tile that HAS a picture has no glyph left to colour.
              badge: (
                <UiIcon
                  path={mdiCircleMedium}
                  size={16}
                  className="text-accent-ink absolute top-0 left-0"
                />
              ),
            }
          : {})}
      />
    </div>
  )
}
