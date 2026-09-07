import type { Asset } from '@shared/domain/asset'
import { opensInStudio } from '@shared/domain/fileRole'
import { nameOf } from '@shared/domain/folder'
import { fileViewOf } from '@shared/domain/fileView'
import { openDocument, openFileView } from '@/features/shell/components/dockviewApi'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { documentAtPath, useDocuments } from '@/stores/documents'

/**
 * What became of one entry of the project folder — the answer a caller has to say out loud.
 *
 * The screen never reads it: a double-click that lands says nothing, and a refusal is already in
 * the journal. `file.open` does, because a model told only "done" tells the person the same.
 */
export type FileOpening =
  'document' | 'editor' | 'asset' | 'system' | 'folder' | 'missing' | 'unreachable' | 'failed'

type Bridge = NonNullable<ReturnType<typeof getBridge>>

async function openAdopted(path: string, asset: Asset, bridge: Bridge): Promise<FileOpening> {
  if (!opensInStudio(nameOf(path))) {
    return (await bridge.project.openFile(path)) ? 'system' : 'failed'
  }
  const { openAsset } = await import('./openAsset')
  return (await openAsset(asset)) ? 'asset' : 'failed'
}

async function openOutsideStudio(path: string, bridge: Bridge): Promise<FileOpening> {
  const facts = await bridge.project.fileFacts(path)
  if (!facts) return 'missing'
  if (facts.kind === 'folder') return 'folder'
  return (await bridge.project.openFile(path)) ? 'system' : 'failed'
}

async function reportAdoptionFailure(
  path: string,
  bridge: Bridge,
  error: unknown,
): Promise<FileOpening> {
  if ((await bridge.project.fileFacts(path)) === null) return 'missing'
  reportFailure('explorer.open', path, error)
  return 'failed'
}

/**
 * Opening a file of the project folder, whatever it is — the Explorer's double-click, and the
 * one gesture `file.open` runs. A picture, a model, a texture and a document all come here.
 *
 * The three destinations, in the order they are tried: a document goes to its tab, anything the
 * catalogue will adopt goes to the editor of its kind, and the rest is handed to the system —
 * a `.txt` and a `.pdf` have no editor here, and pretending otherwise would be worse.
 */
export async function openProjectFile(path: string): Promise<FileOpening> {
  const document = documentAtPath(useDocuments.getState(), path)
  if (document) {
    openDocument(document)
    return 'document'
  }

  const fileView = fileViewOf(path)
  if (fileView) {
    openFileView(fileView)
    return 'editor'
  }

  const bridge = getBridge()
  if (!bridge) return 'unreachable'

  // A REJECTION is not an answer of `null`, and telling them apart is the whole point: the two
  // used to be one, and a busy catalogue sent a `.glb` to macOS Preview seconds after a download.
  let adopted: Asset | null
  try {
    adopted = await bridge.media.adopt(path)
  } catch (error) {
    // A path that is not there answers `null` below, never a throw — so what reaches here is a
    // catalogue or a volume that failed, and the disk is asked only to tell the two apart.
    // `explorer.open` names the gesture, not its caller.
    return await reportAdoptionFailure(path, bridge, error)
  }

  // Loaded on the call, as it was from the Explorer: `openAsset` reaches `ASSET_INTENTS`, which
  // names every editor's destination, and `eager-graph.test.ts` holds the first screen to less.
  if (adopted) {
    return await openAdopted(path, adopted, bridge)
  }

  // Asked only HERE, on the one path that is about to leave the studio: a `stat` on every
  // double-click would pay for what the answer above already settled. It is what tells an entry
  // that is not there from one no editor of ours takes.
  return await openOutsideStudio(path, bridge)
}
