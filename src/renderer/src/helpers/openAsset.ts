import type { Asset } from '@shared/domain/asset'
import { openDocument } from '@/features/shell/components/dockviewApi'
import { reportFailure } from '@/services/diagnostics'
import { assetsById, useAssets } from '@/stores/assets'
import { documentById, documentForAsset, useDocuments } from '@/stores/documents'
import { openCharacter } from '@/character/openCharacter'
import { getBridge } from '@/services/bridge'
import { useProject } from '@/stores/project'
import {
  editorIntent,
  opensAsCharacter,
  opensAsPlayerModule,
  pixelEditorIntent,
  type AssetIntent,
} from './assetIntents'

async function openSpecialAsset(asset: Asset, into?: AssetIntent): Promise<boolean | null> {
  if (into) return null
  if (opensAsPlayerModule(asset)) {
    await getBridge()?.playerModuleWindow.open(asset.id)
    return true
  }
  return opensAsCharacter(asset) ? openCharacter(asset.id) : null
}

function refusalFor(asset: Asset, intent: AssetIntent | null): string | null {
  if (!intent?.takes(asset)) return 'no destination'
  if (asset.location !== 'local') return 'not on disk'
  if (!useProject.getState().project) return 'no project'
  return null
}

async function createAssetDocument(asset: Asset, intent: AssetIntent): Promise<boolean> {
  const created = await useDocuments
    .getState()
    .create(intent.workspace, { title: asset.name, sourceAssetId: asset.id })
  if (!created) {
    reportFailure('assets.open', asset.name, new Error('no document'))
    return false
  }
  await (intent.become ?? intent.into)(created.id, asset)
  return true
}

/**
 * What opening an asset does — double-click or Enter: a tab of its own, in the space that edits
 * its kind. The context menu and the drag keep the destinations of `ASSET_INTENTS`, which serve
 * the document already open; this gesture serves the asset.
 *
 * It never reads the tab in front, deliberately. Doing so made one gesture mean two things —
 * a picture became a layer over an image tab and a sky over a skybox one — and neither was
 * "open this asset". A rule with no exception is the only one a hand can learn.
 *
 * `into` names another destination — a texture's PIXELS, which are edited in Images while its
 * channels are assembled in Materials. It is a second gesture with a row of its own, never a
 * second meaning of the double-click, which stays the one rule a hand can learn.
 *
 * A refusal is said out loud, as it has to be: the same double-click worked over one tab and did
 * nothing at all over another, without a word either way.
 *
 * Answers whether a tab is now in front. The screen ignores it — the journal is what it reads —
 * but `openProjectFile` reports the gesture back to a caller that has to say what happened.
 */
export async function openAsset(asset: Asset, into?: AssetIntent): Promise<boolean> {
  // Both are opened on the FILE and never as one node of a scene — the module in a window of its
  // own, the character on a tab. Only where nobody named a destination: « Send to », the viewport
  // drop and `node.addModel` all pass an intent, and each still puts a model in a scene.
  const special = await openSpecialAsset(asset, into)
  if (special !== null) return special

  const intent = into ?? editorIntent(asset)
  const already = documentForAsset(useDocuments.getState(), asset.id, intent?.kind)
  // Back to its own tab rather than a second one onto the same asset: two tabs of one document
  // are two histories of it, and the second save writes over the first.
  if (already) {
    // The section is not set here: bringing the tab forward is what sets it, so the two cannot
    // disagree — see `DocumentArea`.
    openDocument(already)
    // The tab is NOT resized to the asset: it keeps its size and the work done in it. But one
    // that no longer measures its asset writes a smaller file over it on the next ⌘S, so the
    // destination says so here — the first moment the user can still act on it.
    await intent?.revisit?.(already.id, asset)
    return true
  }

  const refusal = refusalFor(asset, intent)
  if (refusal || !intent) {
    reportFailure('assets.open', asset.name, new Error(refusal ?? 'no destination'))
    return false
  }
  return createAssetDocument(asset, intent)
}

/**
 * The same, from the id a document holds rather than from the asset itself.
 *
 * What every texture slot needs, and what none of them should write: `design/` reads no store, so
 * the caller resolves the id — and each one that did wrote its own `items.find`, which is exactly
 * what `assetsById` was indexed to stop. An id the catalogue no longer holds opens nothing, in
 * silence: the slot beside it already reads as empty, and a document outlives its picture.
 */
export function openAssetById(assetId: string | null): void {
  if (!assetId) return

  const asset = assetsById(useAssets.getState()).get(assetId)
  if (asset) void openAsset(asset)
}

/**
 * Bringing another DOCUMENT forward, from the id a slot holds — a material a model wears, a sky a
 * scene follows. Read at the press rather than subscribed to: a row has no business re-rendering
 * on every relist of the project.
 */
export function openDocumentById(documentId: string): void {
  const document = documentById(useDocuments.getState(), documentId)
  if (document) openDocument(document)
}

/** Painting a picture, and the space it happens in — a menu reads its glyph off the same answer. */
export type EditPixels = { workspace: AssetIntent['workspace']; run: () => void }

/**
 * Descending to a picture's PIXELS — what an assembling space offers, since none of them writes an
 * image back. `null` where there is nothing to paint: no asset, or one that is not on this disk.
 */
export function editPixelsOf(asset: Asset | null | undefined): EditPixels | null {
  const intent = asset ? pixelEditorIntent(asset) : null
  if (!asset || !intent) return null

  return { workspace: intent.workspace, run: () => void openAsset(asset, intent) }
}
