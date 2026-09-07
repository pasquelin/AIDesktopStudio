import { isLocalPicture, type Asset } from '@shared/domain/asset'
import { DEFAULT_CANVAS, pixelLayer, type CanvasState } from '@/engines/canvas/canvasState'
import { addLayer } from '@/engines/canvas/commands'
import { newId } from '@/helpers/ids'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { canvasStore, useCanvases } from '@/stores/canvases'
import type { PictureMeasure } from './pictureSize'

/**
 * A picture laid on a document as a layer of its own — what a drop and a finished generation
 * end in.
 *
 * The asset is written into the layer rather than drawn at the engine: pixels pushed from here
 * would not survive an undo, a closed tab or a detached panel, and the engine only learns a
 * layer exists one React commit later anyway. It draws it the moment it builds the surface.
 *
 * The layer is named after the asset: a stack of "Layer 4, Layer 5, Layer 6" says nothing about
 * what is in it. `addLayer` arms it, so the brush lands on what was just dropped.
 */
export function placeAsset(documentId: string, asset: Asset, targetLayerId?: string): void {
  if (!isLocalPicture(asset)) {
    // Said rather than swallowed, exactly as `placeMaterialChannel` says it: `AssetDropTarget`
    // cannot refuse this one while it flies — a drag announces its TYPE and not where its file
    // is — so the refusal can only be spoken here, and a silent drop is the worse of the two.
    reportFailure('canvas.place', asset.id, new Error(`${asset.name} has no local file yet`))
    return
  }

  const layer = sourceLayer(asset)
  useCanvases.getState().runCommand(documentId, addLayer(layer, targetLayerId))
}

/** A layer that names the asset it draws, so the engine fetches the pixels rather than holding them. */
function sourceLayer(asset: Asset) {
  return { ...pixelLayer(newId(), asset.name), source: asset.id }
}

/**
 * Opens an asset that holds a whole stack, and answers whether it was one.
 *
 * `false` for every flat picture, which is the ordinary case and not a failure — the caller then
 * opens the one-layer document any picture opens as.
 */
async function becomeContainer(documentId: string, asset: Asset): Promise<boolean> {
  const layered = await getBridge()?.assets.readLayered(asset.id)
  if (!layered) return false

  const { canvasFromOra } = await import('@/engines/canvas/oraDocument')
  const { withinCeiling } = await import('./pictureSize')
  const opened = canvasFromOra(layered).state

  // The ceiling bites here too. This path never went through it — a 12000² container opened at
  // its full size, which is the very thing the ceiling exists to refuse, and ⌘S then wrote that
  // size back. Said out loud for the same reason the flat path says it.
  const held = withinCeiling(opened)
  if (held.width !== opened.width || held.height !== opened.height) {
    reportFailure('canvas.size', asset.name, new Error('picture opened below its own size'))
  }

  const canvases = useCanvases.getState()
  canvases.replace(documentId, { ...opened, width: held.width, height: held.height })
  canvases.markSaved(documentId, canvasStore.markOf(useCanvases.getState(), documentId))
  return true
}

/**
 * The document IS the picture — what a double-click on an asset makes.
 *
 * NOT `placeAsset` on a fresh canvas, and the difference is what ⌘S is allowed to write back. A
 * default canvas is 1024² with an opaque WHITE base layer, so a 4096×2048 photo opened that way
 * became a white-matted top-left quarter of itself — and flattening that over the asset deleted
 * the original. Here the document takes the picture's own size and holds one layer with no
 * fill, so the flatten is the picture, transparency included.
 *
 * `replace`, never a command, and marked saved straight after: opening is not something ⌘Z gives
 * back, and a history entry would leave the tab MODIFIED before the user has touched it — which
 * is exactly what tells ⌘S whether the asset behind it may be rewritten. `placeAsset` runs
 * `addLayer` as a command, which is why it cannot be the one that opens an asset.
 *
 * A picture that will not decode opens at the default size rather than not at all: the layer
 * still names its source, so the engine draws it, and the size guard on `writeAsset` then keeps
 * ⌘S off an asset this document does not faithfully carry.
 */
export async function becomeAsset(
  documentId: string,
  asset: Asset,
  measure?: PictureMeasure,
): Promise<void> {
  if (!isLocalPicture(asset)) {
    // Same refusal, same reason as `placeAsset`: a double-click on a cloud row that has not been
    // downloaded opened nothing and said nothing.
    reportFailure('canvas.place', asset.id, new Error(`${asset.name} has no local file yet`))
    return
  }
  // A container opens as the stack it holds. Its pixels arrive later, at `rehydrateDocument`:
  // no engine is mounted yet — the tab is being made — so there is nothing to hand them to.
  if (await becomeContainer(documentId, asset)) return

  // Reached through `import()`: this module is in the opening chunk — `eager-graph.test.ts`
  // holds that budget at two files — and measuring only ever happens on a double-click.
  const { measureAsset, withinCeiling } = await import('./pictureSize')
  const measured = await measureAsset(asset.id, measure)
  const size = measured ? withinCeiling(measured) : DEFAULT_CANVAS
  // Said out loud EVERY way the document can fail to be the picture, because ⌘S writes the
  // document's size back over the asset: one opened smaller than it is would be saved smaller
  // than it was, and that has to be a thing the user was told rather than one the studio did
  // quietly. The ceiling biting was said; the file that would not decode was NOT, and that
  // silence is how a 4112 × 2658 photo came to sit in a 1024² document and be overwritten by it.
  if (!measured) {
    reportFailure('canvas.size', asset.name, new Error('picture would not measure'))
  } else if (size.width !== measured.width || size.height !== measured.height) {
    reportFailure('canvas.size', asset.name, new Error('picture opened below its own size'))
  }
  const layer = sourceLayer(asset)
  const state: CanvasState = {
    ...DEFAULT_CANVAS,
    width: size.width,
    height: size.height,
    layers: [layer],
    activeLayerId: layer.id,
  }

  const canvases = useCanvases.getState()
  canvases.replace(documentId, state)
  // Read after the replace, like `install` does: the mark describes the state now in the store.
  canvases.markSaved(documentId, canvasStore.markOf(useCanvases.getState(), documentId))
}
