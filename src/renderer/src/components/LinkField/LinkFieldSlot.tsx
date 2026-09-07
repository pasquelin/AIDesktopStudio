import type { MouseEvent, ReactNode } from 'react'
import type { Asset, AssetType } from '@shared/domain/asset'
import { AssetDropTarget } from '../AssetDropTarget'

export type LinkFieldSlotProps = {
  accepts?: readonly AssetType[]
  /** The ASSET, not its id: what a slot may refuse — a cloud row — is read off the row itself. */
  onDrop: (asset: Asset) => void
  /** The row is what a right-click lands on, droppable or not — absent where it holds nothing. */
  onContextMenu?: (event: MouseEvent) => void
  /** Opens the linked asset from the row while leaving its thumbnail's own gesture alone. */
  onDoubleClick?: (event: MouseEvent) => void
  children: ReactNode
}

/**
 * The row itself, made a drop target only where a drop means something.
 *
 * Wrapped rather than made conditional inside the row: `AssetDropTarget` owns the outline that
 * says WHICH slot a drop would land in, and a field that mounted one unconditionally would light
 * up on a drag it has no use for. `exclusive`, because these slots sit inside the panel's own
 * target — without it both would frame at once and the answer would name two places.
 *
 * NOT `AssetDropField`, whose name is one letter away: that one is a form control — it registers
 * with react-hook-form, draws an input, and holds the chosen id itself. This holds nothing.
 */
export function LinkFieldSlot({
  accepts,
  onDrop,
  onContextMenu,
  onDoubleClick,
  children,
}: LinkFieldSlotProps) {
  // `min-w-0` alone: the row inside is a `FIELD_ROW` and carries its own height, its own inset
  // and its own gutter, exactly like every other property line — which is the point of the row
  // having gone back to the shared two-column shape.
  if (!accepts) {
    return (
      <div className="min-w-0" onContextMenu={onContextMenu} onDoubleClick={onDoubleClick}>
        {children}
      </div>
    )
  }

  return (
    <AssetDropTarget
      accepts={accepts}
      exclusive
      onDrop={onDrop}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      className="min-w-0 rounded-(--radius-sc-sm)"
    >
      {children}
    </AssetDropTarget>
  )
}
