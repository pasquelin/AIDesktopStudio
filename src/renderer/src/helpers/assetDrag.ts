import { isAssetType, type Asset, type AssetType } from '@shared/domain/asset'
import type { FileOutcome } from '@shared/domain/fileOp'
import { getBridge } from '@/services/bridge'
import { assetsById, useAssets } from '@/stores/assets'
import { useCloud } from '@/stores/cloud'
import { dragChannel, type DragLike } from './drag'

/** Dragging an asset out of the browser and onto an editor. See `dragChannel` for the why. */
export const ASSET_DRAG_TYPE = 'application/x-ai-desktop-studio-asset'

const ASSETS = dragChannel(ASSET_DRAG_TYPE)

/**
 * Announced when what is flying is a LIBRARY asset — one the catalogue does not hold yet.
 *
 * A type rather than a payload, for the same reason the kind is one: `getData` answers nothing
 * until the drop, so a target that needed to know during the drag could not ask. Nothing reads
 * it during `dragover` today — a library asset is accepted exactly like a local one, which is
 * the whole point — but the drop needs it to tell "not in the catalogue yet" from "gone".
 */
const LIBRARY_DRAG_TYPE = `${ASSET_DRAG_TYPE}+library`

const LIBRARY = dragChannel(LIBRARY_DRAG_TYPE)

/**
 * The same drag, announced again under a type that names the kind being carried.
 *
 * Putting the kind in the MIME type is the one place a target can read it in time to say whether
 * it would accept the drop — `getData` answers nothing until the drop itself.
 */
const TYPED_PREFIX = `${ASSET_DRAG_TYPE}+`

/** Announces the drag under both types: the plain one for existing targets, the typed one too. */
export function startAssetDrag(
  event: DragLike,
  asset: {
    id: string
    type: AssetType
  },
): void {
  ASSETS.start(event, asset.id)
  dragChannel(`${TYPED_PREFIX}${asset.type}`).start(event, asset.id)

  // NARROWED after the channels, which allow both. Dropping an asset takes nothing away from the
  // shelf it came from, and `copy` is what puts the "+" under the pointer rather than the arrow.
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

/**
 * The same drag, for an asset that is still only in the account's library.
 *
 * Deliberately announced under the SAME types a local one uses, kind included: a target decides
 * whether it welcomes a drop from what is flying, and a library mesh is a mesh. Only the extra
 * type tells the two apart, and only at the drop — where the difference is a download, not a
 * refusal.
 */
export function startLibraryDrag(event: DragLike, asset: { id: string; type: AssetType }): void {
  // The marker FIRST: `startAssetDrag` ends by narrowing `effectAllowed` to `copy`, and a channel
  // announced after would widen it back. A `dropEffect` the allowed set forbids collapses the
  // operation to `none` with no `drop` at all — every library drag landed nowhere, in silence.
  LIBRARY.start(event, asset.id)
  startAssetDrag(event, asset)
}

export const assetIdFromDrag = ASSETS.idFrom

/** Whether an asset of ours is flying over, whatever its kind. */
export const carriesAsset = ASSETS.carries

/**
 * The kind being dragged, readable DURING the drag — which the identifier is not.
 *
 * `null` when the drag is not one of ours, or comes from a build that announced only the plain
 * type. A target that gets `null` should fall back to accepting, not to refusing: a drop that
 * silently does nothing is worse than one that lands somewhere sensible.
 */
export function draggedAssetType(event: DragLike): AssetType | null {
  // One read of `types`: it is a fresh array on every access, and this runs on every `dragover`.
  const announced = event.dataTransfer?.types.find(type => type.startsWith(TYPED_PREFIX))
  if (!announced) return null

  const kind = announced.slice(TYPED_PREFIX.length)
  return isAssetType(kind) ? kind : null
}

/**
 * The dropped asset, resolved once here rather than by each surface that takes one — and
 * fetched first when what was dragged came from the library.
 *
 * Read from the catalogue at the drop rather than subscribed to: only the id crosses the drag,
 * and a surface that subscribed would re-render every time the catalogue refreshes.
 *
 * The whole difference between a local drop and a library one is the wait: a target accepts the
 * same kinds, lands the same `Asset` and knows nothing of where it came from. Refusing the drag
 * instead would have made the library half of the browser a shelf one can only look at.
 *
 * **Every read of the event happens before the first `await`**, and that is not a style choice:
 * a `DragEvent` is recycled once the handler returns, so `dataTransfer` is empty by the time a
 * promise settles. Callers must therefore call this synchronously from `onDrop`, which is why it
 * takes the event rather than an id.
 */
export async function droppedAsset(event: DragLike): Promise<Asset | null> {
  const id = assetIdFromDrag(event)
  const fromLibrary = LIBRARY.carries(event)
  if (!id) return null

  const held = assetsById(useAssets.getState()).get(id) ?? null
  if (held || !fromLibrary) return held

  return await useCloud.getState().fetchOne(id)
}

/**
 * Landing a dragged asset in a folder of the project: the FILE moves there.
 *
 * The whole point of the gesture, and the sentence the studio now tells in one voice — what
 * leaves the shelf becomes a file of the project, and every editor takes it as one. A file the
 * project already holds MOVES; a library row is DOWNLOADED straight to the folder the pointer
 * named, which is one write where it used to be a write and a move (E-22).
 *
 * `null` when nothing moved, and three ways to get there: a drag carrying no asset of ours, an
 * asset the studio holds no file OF — a linked medium lives where the user left it, and moving
 * it is not this gesture's business — and the download, which lands where it was asked for and
 * leaves nothing to undo. **The second is silent**, which is the known cost: the kind cannot be
 * read at hover, so the drop cannot be refused before it happens.
 *
 * Reads the event synchronously, as `droppedAsset` requires.
 */
export async function landAssetIn(event: DragLike, folder: string): Promise<FileOutcome | null> {
  const id = assetIdFromDrag(event)
  const fromLibrary = LIBRARY.carries(event)
  if (!id) return null

  const held = assetsById(useAssets.getState()).get(id) ?? null
  // Downloaded STRAIGHT to where the pointer asked — E-22. It used to land in the folder its
  // kind names and be moved out of it, which showed one file in two places for one gesture.
  // Nothing moved afterwards, so nothing is handed back to undo: the catalogue's own change is
  // what the explorer redraws on.
  if (!held && fromLibrary) {
    await useCloud.getState().fetchOne(id, folder)
    return null
  }
  if (!held?.path) return null

  return (await getBridge()?.project.moveFiles([held.path], folder)) ?? null
}
