import { getBridge } from '@/services/bridge'
import { useDocuments } from '@/stores/documents'
import { useMaterialViews } from '@/stores/materialViews'
import { useMonitorPair } from '@/stores/monitorPair'
import { usePlayback } from '@/stores/playback'
import { useSkyboxViews } from '@/stores/skyboxViews'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { StudioBridge } from '@shared/ipc'
import { closePanel } from './components/dockviewApi'
import { IO_BY_KIND, ioOf, type DocumentIo } from './documentIoAdapters'
import { forgetLoadState, invalidateLoad, isUnreadable } from './documentLoad'

/**
 * What an open tab carries beside its content, and what taking it down clears.
 *
 * Apart from `documentIo` because a Save as… needs both halves of it — the document it is about
 * to write, and the tab it leaves behind — while `documentIo` needs to reach a Save as… when a
 * save is refused. Held in one file, those two would be an import cycle, and the graph carries
 * none.
 */
export type SavableDocument = {
  bridge: StudioBridge
  document: DocumentDescriptor
  io: DocumentIo
}

/**
 * The document, its io and the bridge — or `null` when there is nothing here to write at all: no
 * project, no tab, a read that failed, a store the editor has not filled yet.
 *
 * What a document HOLDS, told apart from what it may write over: five kinds refuse to save a file
 * they did not read whole (`incomplete`), and that refusal is not a reason to refuse a Save as…
 * — writing what the studio holds into a NEW file is exactly the way out §5.6 asks for.
 */
export function writableDocument(documentId: string): SavableDocument | null {
  const bridge = getBridge()
  const document = useDocuments.getState().documents[documentId]
  const io = ioOf(documentId)
  if (!bridge || !document || !io) return null
  if (isUnreadable(documentId) || !io.holds(documentId)) return null
  return { bridge, document, io }
}

/**
 * The documents whose asset a save failed to write. Read by the next save, which must then write
 * again even though nothing moved in the document since.
 */
const assetBehind = new Set<string>()

export const assetIsBehind = (documentId: string): boolean => assetBehind.has(documentId)
export const markAssetBehind = (documentId: string): void => void assetBehind.add(documentId)
export const clearAssetBehind = (documentId: string): void => void assetBehind.delete(documentId)

/** The captures in flight per document, so a document that goes away takes them with it. */
const capturing = new Map<string, Set<AbortController>>()

export function beginCapture(documentId: string): AbortController {
  const controller = new AbortController()
  const active = capturing.get(documentId) ?? new Set<AbortController>()
  active.add(controller)
  capturing.set(documentId, active)
  return controller
}

export function endCapture(documentId: string, controller: AbortController): void {
  const active = capturing.get(documentId)
  active?.delete(controller)
  if (active?.size === 0) capturing.delete(documentId)
}

export function invalidateDocument(documentId: string): void {
  invalidateLoad(documentId)
  const active = capturing.get(documentId)
  if (!active) return
  capturing.delete(documentId)
  for (const controller of active) controller.abort()
}

/** Takes the tab down without a question — what a Save as… leaves behind, its work now elsewhere. */
export function forgetDocument(documentId: string, gone?: DocumentDescriptor): void {
  invalidateDocument(documentId)
  const document = gone ?? useDocuments.getState().documents[documentId]
  forgetDocumentState(documentId, document)
  closePanel(documentId)
  useDocuments.getState().close(documentId)
}

export function forgetDocumentState(documentId: string, document?: DocumentDescriptor): void {
  if (document) IO_BY_KIND[document.kind].forget(document)
  forgetLoadState(documentId)
  clearAssetBehind(documentId)
  useMaterialViews.getState().forget(documentId)
  useSkyboxViews.getState().forget(documentId)
  useMonitorPair.getState().forgetMonitorPair(documentId)
  usePlayback.getState().clearHead(documentId)
}
