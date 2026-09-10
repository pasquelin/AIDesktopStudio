import { useState, type MouseEvent, type ReactNode } from 'react'
import type { Asset, AssetType } from '@shared/domain/asset'
import { carriesAsset, draggedAssetType, droppedAsset } from '@/helpers/assetDrag'
import {
  carriesExternalFiles,
  externalFileTargetTone,
  importExternalFilesInto,
} from '@/services/externalFiles'
import { cn } from '@/helpers/cn'
import { copiesDropTone, warnsDropTone } from '@/helpers/drag'

export type AssetDropTargetProps = {
  /** The kinds this target takes. A drag announcing none is taken anyway — see below. */
  accepts: readonly AssetType[]
  onDrop: (asset: Asset) => void
  /**
   * What an EXTERNAL file becomes once it has been filed in the project.
   *
   * Absent, it is `onDrop`: a surface takes a file the way it takes a shelf row. The middle of
   * the window is the exception and passes one that does nothing — copying a file is not opening
   * it (R2), and dropping twenty pictures beside the tabs used to stand twenty tabs up.
   */
  onFiles?: (asset: Asset) => boolean | void
  /**
   * Whether a FILE dropped here becomes a resource of the document rather than a file of the
   * project's tree (§7, G-V). Set by the surfaces that place what they take INTO a document and
   * resolve it by identity — a canvas layer names its asset and the engine fetches it by id.
   */
  filesAreInternal?: true
  /**
   * For a target sitting inside another: the surface behind must not LIGHT UP too.
   *
   * Only the outline — the drop itself is consumed by whichever target takes it, always, so a
   * surface never receives one another surface has already handled.
   */
  exclusive?: boolean
  /**
   * Whether the surface draws a frame while an asset hovers it.
   *
   * On a surface with an edge — a channel slot, a field — the frame IS the answer: it says which
   * of several places the drop would land in. On one that fills the middle of the window there is
   * nothing to choose between, so a frame only outlines what the user is already looking at, and
   * the pointer's own "+" says it better.
   */
  outlined?: boolean
  /** The surface is what a right-click lands on, where the caller holds a menu for it. */
  onContextMenu?: (event: MouseEvent) => void
  onDoubleClick?: (event: MouseEvent) => void
  className?: string
  children: ReactNode
}

async function handDroppedAsset(
  pending: Promise<Asset | null>,
  onDrop: (asset: Asset) => void,
): Promise<void> {
  const asset = await pending
  if (asset) onDrop(asset)
}

/** A target for catalogue assets and desktop files, imported before its callback receives them. */
export function AssetDropTarget({
  accepts,
  onDrop,
  onFiles,
  filesAreInternal,
  exclusive,
  outlined = true,
  onContextMenu,
  onDoubleClick,
  className,
  children,
}: AssetDropTargetProps) {
  const [state, setState] = useState<'idle' | 'over' | 'refused'>('idle')

  return (
    <div
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      className={cn(
        className,
        outlined && state !== 'idle' && 'outline-2 -outline-offset-2',
        outlined && state === 'over' && 'outline-accent',
        // Refusal is drawn too: a target that stays blank while nothing can happen reads as a
        // broken drop rather than as an answer.
        outlined && state === 'refused' && 'outline-danger',
      )}
      onDragOver={event => {
        if (carriesExternalFiles(event)) {
          const tone = externalFileTargetTone(event, accepts)
          if (exclusive && tone !== 'refused') event.stopPropagation()
          event.preventDefault()
          event.dataTransfer.dropEffect = copiesDropTone(tone) ? 'copy' : 'none'
          setState(tone === 'accepted' ? 'over' : warnsDropTone(tone) ? 'refused' : 'idle')
          return
        }
        if (!carriesAsset(event)) return
        if (exclusive) event.stopPropagation()

        const kind = draggedAssetType(event)
        const welcome = kind === null || accepts.includes(kind)
        if (welcome) {
          event.preventDefault()
          // The pointer's own answer, and the only one an unframed surface gives: "+" means the
          // drop adds something here. Without it the platform shows the arrow of a MOVE, which
          // reads as "this will be taken from where it is".
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
        }
        setState(welcome ? 'over' : 'refused')
      }}
      onDragLeave={event => {
        // `dragleave` bubbles from every child: crossing from the canvas onto the toolbar above
        // it is not leaving the target, and answering it would flicker the outline all drag long.
        const to = event.relatedTarget
        if (to instanceof Node && event.currentTarget.contains(to)) return
        setState('idle')
      }}
      onDrop={async event => {
        setState('idle')

        if (carriesExternalFiles(event)) {
          if (event.dataTransfer.files.length === 0) return
          // Consumed even when the surface takes none of them, and that is the fix: a refused
          // drop used to fall through to the fallback behind, which imported the files anyway
          // and opened each one in its own space. `importExternalFilesInto` says what it left.
          event.preventDefault()
          event.stopPropagation()
          void importExternalFilesInto(
            event.dataTransfer.files,
            accepts,
            onFiles ?? onDrop,
            filesAreInternal,
          )
          return
        }

        /**
         * Asked AGAIN here, and that is the whole point: `dragover` decides the outline, this
         * decides whether the drop is taken — and since the shell mounts a fallback that welcomes
         * every kind, a drop now lands on the deepest target whatever it holds. Reading only the
         * dragover verdict, a surface that had just drawn "refused" would still swallow the drop
         * and rob the fallback of it.
         */
        const kind = draggedAssetType(event)
        if (!carriesAsset(event) || (kind !== null && !accepts.includes(kind))) return

        event.preventDefault()
        // Consumed, which is what lets the shell hold ONE fallback rather than each surface
        // guessing whether it is the last one: what reaches the surface behind is what nobody took.
        event.stopPropagation()

        // Read synchronously, awaited after: a library asset is fetched first, and the event
        // is recycled the moment this handler returns.
        void handDroppedAsset(droppedAsset(event), onDrop)
      }}
    >
      {children}
    </div>
  )
}
