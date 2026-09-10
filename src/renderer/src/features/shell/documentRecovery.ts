import i18next from 'i18next'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { RecoveryEntry } from '@shared/domain/recovery'
import type { StudioBridge } from '@shared/ipc'
import { orElse } from '@shared/promises'
import { getBridge } from '@/services/bridge'
import { reportFailure, reportNotice } from '@/services/diagnostics'
import { useDocuments } from '@/stores/documents'
import { openDocument } from './components/dockviewApi'
import { ioOf, type DocumentIo } from './documentIoAdapters'
import { documentIsDirty, unsavedDocumentIds } from './documentDirty'

/**
 * The net under unsaved work — §9 of the spec.
 *
 * 🛑 It writes NOWHERE the user can see, and that is its whole reason for existing: the pass that
 * ran before it wrote the real files, so a video opened and left alone grew an `.otio` beside it
 * and a sky a `.gltf`, neither asked for. What this writes lives under `.recovery/`, is never
 * listed, never opened, and never taken for the work itself.
 *
 * The image, which had NO net at all, is covered like every other kind.
 */
export function recoverableDocument(documentId: string): DocumentIo | null {
  const io = ioOf(documentId)
  if (!io || io.assetOnly || io.recovers === false || !io.capture || !io.markUnsaved) return null
  return io.holds(documentId) ? io : null
}

/** One pass: every open document holding unsaved work, written where a crash cannot reach it. */
export async function recoverOpenDocuments(): Promise<void> {
  const bridge = getBridge()
  if (!bridge) return
  for (const documentId of unsavedDocumentIds()) {
    try {
      await recoverOne(bridge, documentId)
    } catch {
      // One document that will not capture must not cost every other open document its net.
      continue
    }
  }
}

/** The state each document was last written to the recovery area at — see `DocumentIo.markOf`. */
const written = new Map<string, unknown>()

async function recoverOne(bridge: StudioBridge, documentId: string): Promise<void> {
  const io = recoverableDocument(documentId)
  const document = useDocuments.getState().documents[documentId]
  if (!io?.capture || !document) return
  await io.settled?.(documentId)
  // Nothing moved since the entry: a picture re-captured on a timer is a GPU readback and a PNG
  // encode per layer, and a document stays dirty until it is SAVED, not until it stops changing.
  const mark = io.markOf?.(documentId)
  if (mark !== undefined && written.get(documentId) === mark) return
  // The capture's `commit` is deliberately NOT called: writing a recovery entry does not save
  // the document, and marking it saved is exactly how a net becomes a save.
  const { draft } = await io.capture(documentId)
  const outcome = await bridge.recovery.write({
    entry: entryFor(document),
    content: draft.content,
    ...(draft.parts ? { parts: draft.parts } : {}),
  })
  if (outcome === 'over-budget') reportNotice('document.save', i18next.t('documents.recoveryFull'))
  written.set(documentId, mark)
}

function entryFor(document: DocumentDescriptor): RecoveryEntry {
  return {
    documentId: document.id,
    kind: document.kind,
    title: document.title,
    workspace: document.workspace,
    path: document.path,
    savedAt: new Date().toISOString(),
    ...(document.sourceAssetId ? { sourceAssetId: document.sourceAssetId } : {}),
    ...(document.sourceFidelity ? { sourceFidelity: document.sourceFidelity } : {}),
  }
}

/**
 * Drops what a successful save COVERS, and only that — §9.1, guarantee 3.
 *
 * Asked after the save, and it reads the document again rather than trusting the moment: an edit
 * made WHILE the file was being written belongs to the unsaved work that follows it, so a
 * document still dirty keeps its entry.
 */
export async function clearRecoveryCovered(documentId: string): Promise<void> {
  if (documentIsDirty(documentId)) return
  await clearRecoveryOf(documentId)
}

/** Drops one entry outright — what a CONFIRMED discard asks for, and nothing else. */
export async function clearRecoveryOf(documentId: string): Promise<void> {
  written.delete(documentId)
  // A net that cannot be cleared is a stale offer at the next opening, never a lost file.
  await orElse(getBridge()?.recovery.clear(documentId), undefined)
}

/**
 * What is waiting, OFFERED rather than taken — §9.1, guarantee 5.
 *
 * Nothing is purged when the offer is declined: an entry the user did not want today is still the
 * only copy of that work, and it waits.
 */
export async function offerRecoveredWork(): Promise<void> {
  const bridge = getBridge()
  if (!bridge) return
  // A listing that failed says nothing about the work: no offer, and nothing purged either.
  const entries = await orElse(bridge.recovery.list(), [])
  const waiting = entries.filter(entry => !documentIsDirty(entry.documentId))
  if (waiting.length === 0) return
  if (!(await bridge.recovery.confirmRestore(waiting.length))) return

  for (const entry of waiting) await restoreEntry(entry)
}

async function restoreEntry(entry: RecoveryEntry): Promise<void> {
  const bridge = getBridge()
  if (!bridge) return
  try {
    const draft = await bridge.recovery.read(entry.documentId)
    if (!draft) return
    const document = documentFor(entry)
    useDocuments.getState().adopt(document)
    const io = ioOf(entry.documentId)
    if (!io?.install || !io.markUnsaved) return
    io.install(entry.documentId, draft.content, draft.parts)
    // Restored work is UNSAVED work: filled in and left clean, the next close would throw it
    // away without a question — the very loss this whole area exists to prevent.
    io.markUnsaved(entry.documentId)
    openDocument(document)
  } catch (error) {
    reportFailure('document.load', entry.title, error)
  }
}

/** The descriptor the work goes back into: the one the project holds, or the entry's own. */
function documentFor(entry: RecoveryEntry): DocumentDescriptor {
  const { documents, stored } = useDocuments.getState()
  return (
    documents[entry.documentId] ??
    stored.find(one => one.id === entry.documentId) ?? {
      id: entry.documentId,
      kind: entry.kind,
      title: entry.title,
      workspace: entry.workspace,
      path: entry.path,
      ...(entry.sourceAssetId ? { sourceAssetId: entry.sourceAssetId } : {}),
      ...(entry.sourceFidelity ? { sourceFidelity: entry.sourceFidelity } : {}),
    }
  )
}
