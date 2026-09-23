import type { Asset } from '@shared/domain/asset'
import { extensionOfKind } from '@shared/domain/document'
import { openDocument } from '@/features/shell/components/dockviewApi'
import { restoreDocument } from '@/features/shell/documentLoad'
import { documentForFile } from '@/stores/documentIdentity'
import { useDocuments } from '@/stores/documents'

/**
 * Whether this row is a glTF that could be opened as a scene — §2.6, case 2.
 *
 * The extension alone, because that is the whole of the question here: what the CONTENT proposes
 * is answered where the listing reads it (`gltfProposesScene`), and this is the gesture that
 * overrides the proposal either way. A `.glb` is left out: the studio writes its scenes as glTF
 * text, and a container it cannot write back into is no destination.
 */
export function opensAsScene(asset: Asset): boolean {
  const extension = extensionOfKind('scene')
  const path = asset.path
  return (
    extension !== null &&
    asset.type === 'mesh' &&
    asset.location === 'local' &&
    path !== undefined &&
    path.toLowerCase().endsWith(extension)
  )
}

/**
 * That glTF, opened as the scene it may be.
 *
 * The other half of the proposal a listing reads: a file whose cameras sit past the bounded head,
 * or one whose maker wrote none, is not listed as a document — and is still openable as a scene by
 * hand, which is what makes a guess correctable rather than final (E-24).
 *
 * What carries it is the destination the document is given: it READS that file and writes back
 * into it, instead of being written beside it under a freed name (§5.3).
 */
export async function openAssetAsScene(asset: Asset): Promise<boolean> {
  const path = asset.path
  if (!path) return false

  const already = documentForFile(useDocuments.getState(), asset, 'scene')
  if (already) {
    openDocument(already)
    await restoreDocument(already.id)
    return true
  }

  const created = await useDocuments.getState().create('3d', {
    kind: 'scene',
    title: asset.name,
    path,
    sourcePath: path,
    destination: path,
  })
  if (!created) return false

  openDocument(created)
  return (await restoreDocument(created.id)).state === 'ready'
}
