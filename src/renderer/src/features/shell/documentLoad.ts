import { isAbortError } from '@shared/guards'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { useDocuments } from '@/stores/documents'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { StudioBridge } from '@shared/ipc'
import { ioOf, type DocumentIo } from './documentIoAdapters'

/**
 * What restoring a document settled on.
 *
 * Answered rather than swallowed, because opening is asked for from OUTSIDE as well: the action
 * announced success the moment the tab went up, and the call after it read the space's default
 * instead of the file — a scene saved with a cube in it answered without one, measured
 * 2026-09-09. A readiness is the only proof that a tab holds what its file holds.
 *
 * `cancelled` and `unreadable` stay apart on purpose: a project changing under a read is nobody's
 * failure, where a file that would not read is one a caller has to be able to see.
 */
export type DocumentReadiness =
  | { state: 'ready' }
  | { state: 'unreadable'; error: unknown }
  | { state: 'cancelled' }
  | { state: 'noDocument' }
  | { state: 'noBridge' }

const unreadable = new Set<string>()
const documentEpochs = new Map<string, number>()

export const epochOf = (documentId: string): number => documentEpochs.get(documentId) ?? 0

type DocumentLoad = {
  document: DocumentDescriptor
  epoch: number
  controller: AbortController
}

/** The read in flight, so a panel mounting twice joins one rather than reading the file again. */
const loading = new Map<string, DocumentLoad & { promise: Promise<DocumentReadiness> }>()

/**
 * Opens a new epoch for the document, and drops the read in flight with it.
 *
 * Everything the previous epoch started is stale from here — a read on its way back, a capture on
 * its way to disk. Without it a file arriving late installs itself into a tab that has since
 * changed project.
 */
export function invalidateLoad(documentId: string): void {
  documentEpochs.set(documentId, epochOf(documentId) + 1)
  const current = loading.get(documentId)
  if (!current) return
  loading.delete(documentId)
  current.controller.abort()
}

/** Whether the last read failed — what keeps ⌘S from writing an empty tab over a real file. */
export const isUnreadable = (documentId: string): boolean => unreadable.has(documentId)

export function forgetLoadState(documentId: string): void {
  unreadable.delete(documentId)
}

/**
 * Fills a tab from its file, and answers when it holds it.
 *
 * Every caller gets the same promise for the same document: the panel that mounts, the project
 * that reopens, and the action asked for from outside all join one read.
 */
export function restoreDocument(documentId: string): Promise<DocumentReadiness> {
  const existing = loading.get(documentId)
  if (existing) return existing.promise
  const io = ioOf(documentId)
  const document = useDocuments.getState().documents[documentId]
  if (!io || !document) return Promise.resolve({ state: 'noDocument' })
  // Nothing is due: the state is already there, or the kind keeps its content in an asset the
  // library loads on its own rather than in a file this cycle ever reads.
  if (io.holds(documentId) || io.assetOnly) return Promise.resolve({ state: 'ready' })
  const bridge = getBridge()
  if (!bridge) {
    io.createDefault(documentId)
    return Promise.resolve({ state: 'noBridge' })
  }
  unreadable.delete(documentId)
  const load: DocumentLoad = {
    document,
    epoch: epochOf(documentId),
    controller: new AbortController(),
  }
  // Registered AFTER the call: `readDocument` runs to its first await synchronously, and nothing
  // it touches before then is this map.
  const promise = readDocument(load, io, bridge)
  loading.set(documentId, { ...load, promise })
  return promise
}

async function readDocument(
  load: DocumentLoad,
  io: DocumentIo & { assetOnly?: undefined },
  bridge: StudioBridge,
): Promise<DocumentReadiness> {
  const { document, controller } = load
  try {
    const file = await bridge.documents.read(document.id, document.kind)
    if (!epochIsCurrent(document, load.epoch, controller.signal)) return { state: 'cancelled' }
    // Filled while the read was in flight: the tab is live and the Add menu acts on it. What it
    // holds is what a caller reads next, so the document IS available — this read alone is dropped.
    if (io.holds(document.id)) return { state: 'ready' }
    if (file) io.install(document.id, file.content, file.parts)
    else io.createDefault(document.id)
    return { state: 'ready' }
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) return { state: 'cancelled' }
    unreadable.add(document.id)
    reportFailure('document.load', document.title, error)
    return { state: 'unreadable', error }
  } finally {
    if (loading.get(document.id)?.controller === controller) loading.delete(document.id)
  }
}

/**
 * Whether what was started at `epoch` still belongs to the tab in front — the one rule a read and
 * a write both answer to, written once because the two used to hold it in opposite polarities.
 */
export function epochIsCurrent(
  { id, kind }: Pick<DocumentDescriptor, 'id' | 'kind'>,
  epoch: number,
  signal: AbortSignal,
): boolean {
  return (
    !signal.aborted && epochOf(id) === epoch && useDocuments.getState().documents[id]?.kind === kind
  )
}

export async function rehydrateDocument(documentId: string): Promise<void> {
  const bridge = getBridge()
  const document = useDocuments.getState().documents[documentId]
  const io = ioOf(documentId)
  if (!bridge || !document || !io?.rehydrate) return
  if (!io.holds(documentId) || unreadable.has(documentId)) return
  try {
    const file = await bridge.documents.read(document.id, document.kind)
    if (file?.parts?.length) return io.rehydrate(documentId, file.content, file.parts)
    if (document.sourceAssetId) await io.rehydrateFromAsset?.(documentId, document.sourceAssetId)
  } catch (error) {
    reportFailure('document.load', document.title, error)
  }
}
