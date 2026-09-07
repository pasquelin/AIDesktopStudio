import { getBridge } from '@/services/bridge'
import { reportFailure, reportNotice } from '@/services/diagnostics'
import { assetsById, useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useLivePreviews } from '@/stores/livePreviews'
import { useMaterialViews } from '@/stores/materialViews'
import { useMonitorPair } from '@/stores/monitorPair'
import { usePlayback } from '@/stores/playback'
import { useSkyboxViews } from '@/stores/skyboxViews'
import { type CloseChoice, type DocumentDescriptor } from '@shared/domain/document'
import { FOLDER_ROOT, parentOf } from '@shared/domain/folder'
import {
  formatOfFile,
  lossesFor,
  type CapabilityTrait,
  type WritableFormat,
} from '@shared/domain/formatCapability'
import type { StudioBridge } from '@shared/ipc'
import i18next from 'i18next'
import { closePanel, openDocument } from './components/dockviewApi'
import { IO_BY_KIND, ioOf, type CapturedDraft, type DocumentIo } from './documentIoAdapters'
import { queueDocumentSave } from './documentSaveQueue'
const unreadable = new Set<string>()
const assetBehind = new Set<string>()
const flattenAgreed = new Set<string>()
const documentEpochs = new Map<string, number>()
const capturing = new Map<string, Set<AbortController>>()

const epochOf = (documentId: string): number => documentEpochs.get(documentId) ?? 0

function beginCapture(documentId: string): AbortController {
  const controller = new AbortController()
  const active = capturing.get(documentId) ?? new Set<AbortController>()
  active.add(controller)
  capturing.set(documentId, active)
  return controller
}

function endCapture(documentId: string, controller: AbortController): void {
  const active = capturing.get(documentId)
  active?.delete(controller)
  if (active?.size === 0) capturing.delete(documentId)
}

function invalidateDocument(documentId: string): void {
  documentEpochs.set(documentId, epochOf(documentId) + 1)
  cancelLoad(documentId)
  const active = capturing.get(documentId)
  if (!active) return
  capturing.delete(documentId)
  for (const controller of active) controller.abort()
}
async function agreedToFlatten(
  document: DocumentDescriptor,
  format: WritableFormat,
  losses: readonly CapabilityTrait[],
): Promise<boolean> {
  if (flattenAgreed.has(document.id)) return true
  const agreed = await askedToFlatten(
    document.title,
    format.toUpperCase(),
    losses.map(trait => i18next.t(`traits.${trait}`)).join(', '),
  )
  if (agreed) flattenAgreed.add(document.id)
  return agreed
}
const askedToFlatten = async (title: string, format: string, lost: string): Promise<boolean> =>
  (await getBridge()?.documents.confirmFlatten(title, format, lost)) ?? true
type SavableDocument = {
  bridge: StudioBridge
  document: DocumentDescriptor
  io: DocumentIo
}
type WritableSavableDocument = Omit<SavableDocument, 'io'> & {
  io: Extract<DocumentIo, { assetOnly?: undefined }>
}
type CapturedDocument = Awaited<
  ReturnType<NonNullable<Extract<DocumentIo, { assetOnly?: undefined }>['capture']>>
>
type CaptureResult = { ok: true; captured: CapturedDocument } | { ok: false; error: unknown }

function savableDocument(documentId: string, byHand = true): SavableDocument | null {
  const bridge = getBridge()
  const document = useDocuments.getState().documents[documentId]
  const io = ioOf(documentId)
  if (!bridge || !document || !io) return null
  if (unreadable.has(documentId) || !io.holds(documentId)) return null
  const refusal = io.incomplete?.(documentId)
  if (refusal) {
    if (byHand) reportNotice('document.save', refusal)
    return null
  }
  return { bridge, document, io }
}
export async function saveDocument(documentId: string, byHand = true): Promise<boolean> {
  const savable = savableDocument(documentId, byHand)
  if (!savable) return false
  const { io } = savable
  if (io.assetOnly) return await io.saveOwn(documentId)
  const writable: WritableSavableDocument = { ...savable, io }
  const epoch = epochOf(documentId)
  const controller = beginCapture(documentId)
  const capture = captureForSave(io, documentId, controller)
  return await queueDocumentSave(documentId, async () =>
    writeCaptured(writable, epoch, controller, await capture, byHand),
  )
}

async function captureForSave(
  io: Extract<DocumentIo, { assetOnly?: undefined }>,
  documentId: string,
  controller: AbortController,
): Promise<CaptureResult> {
  try {
    return { ok: true, captured: await io.capture(documentId, controller.signal) }
  } catch (error) {
    return { ok: false, error }
  } finally {
    endCapture(documentId, controller)
  }
}

async function writeCaptured(
  savable: WritableSavableDocument,
  epoch: number,
  controller: AbortController,
  result: CaptureResult,
  byHand: boolean,
): Promise<boolean> {
  const captured = capturedOrThrow(result, controller.signal)
  if (!captured) return false
  let { document } = savable
  if (!saveIsCurrent(document, epoch, controller.signal)) return false
  document = useDocuments.getState().documents[document.id] ?? document
  const { draft, commit, wasEdited } = captured
  const payload = {
    ...draft,
    title: document.title,
    ...(document.sourceAssetId ? { sourceAssetId: document.sourceAssetId } : {}),
  }
  if (!(await writeDraft(savable, document, payload, epoch, controller.signal, byHand)))
    return false
  if (!saveIsCurrent(document, epoch, controller.signal)) return false
  commit()
  if (!byHand) return true
  await rewriteSourceAsset(document, savable.io, wasEdited, draft)
  void useDocuments.getState().relist('own-write')
  return true
}

function capturedOrThrow(result: CaptureResult, signal: AbortSignal): CapturedDocument | null {
  if (result.ok) return result.captured
  if (signal.aborted || isAbortError(result.error)) return null
  throw result.error
}

async function writeDraft(
  { bridge }: WritableSavableDocument,
  document: DocumentDescriptor,
  draft: CapturedDraft & { title: string; sourceAssetId?: string },
  epoch: number,
  signal: AbortSignal,
  byHand: boolean,
): Promise<boolean> {
  const folder = parentOf(document.path) ?? FOLDER_ROOT
  const result = await bridge.documents.write(document.id, document.kind, draft, false, folder)
  if (result !== 'stale') return true
  if (!byHand || !(await bridge.documents.confirmOverwrite(document.title))) return false
  if (!saveIsCurrent(document, epoch, signal)) return false
  await bridge.documents.write(document.id, document.kind, draft, true, folder)
  return true
}

function saveIsCurrent(document: DocumentDescriptor, epoch: number, signal: AbortSignal): boolean {
  const current = useDocuments.getState().documents[document.id]
  return !signal.aborted && epochOf(document.id) === epoch && current?.kind === document.kind
}
function writePlanFor(
  document: DocumentDescriptor,
  io: DocumentIo,
  sourceAssetId: string,
): {
  format: WritableFormat
  losses: CapabilityTrait[]
} {
  const written =
    formatOfFile(assetsById(useAssets.getState()).get(sourceAssetId)?.path ?? '') ?? 'ora'
  if (!io.traitsOf) return { format: written, losses: [] }
  return { format: written, losses: lossesFor(io.traitsOf(document.id), written) }
}
async function rewriteSourceAsset(
  document: DocumentDescriptor,
  io: DocumentIo,
  wasEdited: boolean,
  captured: CapturedDraft,
): Promise<void> {
  const source = document.sourceAssetId
  if (!source || !io.writeAsset) return
  if (!wasEdited && !assetBehind.has(document.id)) return
  const { format, losses } = writePlanFor(document, io, source)
  if (losses.length > 0 && !(await agreedToFlatten(document, format, losses))) return
  try {
    const written = await io.writeAsset(
      document.id,
      { replaces: source, name: document.title, format },
      captured,
    )
    if (!written) throw new Error('nothing to bake yet')
    assetBehind.delete(document.id)
    useLivePreviews.getState().revokePreview(source)
    useAssets.getState().invalidate()
  } catch (error) {
    assetBehind.add(document.id)
    reportFailure('assets.save', document.title, error)
  }
}
async function copyDocumentAsset(
  documentId: string,
  { bridge, document, io }: SavableDocument,
): Promise<boolean> {
  const source = document.sourceAssetId
  if (!source || !io.writeAsset || io.assetOnly) {
    reportFailure('assets.copy', document.title, new Error('nothing to copy'))
    return false
  }
  const name = i18next.t('documents.copyName', { name: document.title })
  const { format, losses } = writePlanFor(document, io, source)
  try {
    const { draft } = await io.capture(documentId)
    const copy = await io.writeAsset(
      documentId,
      { derivedFrom: source, name, format: losses.length === 0 ? format : 'ora' },
      draft,
    )
    if (!copy) {
      reportFailure('assets.copy', document.title, new Error('nothing to bake yet'))
      return false
    }
    const created = await useDocuments
      .getState()
      .create(document.workspace, { title: name, sourceAssetId: copy.id })
    if (!created) {
      reportFailure('assets.copy', document.title, new Error('no document for the copy'))
      return false
    }
    await bridge.documents.write(
      created.id,
      created.kind,
      {
        ...draft,
        title: name,
        sourceAssetId: copy.id,
      },
      false,
      parentOf(created.path) ?? FOLDER_ROOT,
    )
    openDocument(created)
    await useAssets.getState().refresh()
    void useDocuments.getState().relist('own-write')
    return true
  } catch (error) {
    reportFailure('assets.copy', document.title, error)
    return false
  }
}

export async function saveDocumentAs(documentId: string): Promise<boolean> {
  const savable = savableDocument(documentId)
  return savable ? await copyDocumentAsset(documentId, savable) : false
}
type DocumentLoad = {
  document: DocumentDescriptor
  epoch: number
  controller: AbortController
  promise: Promise<void>
}
const loading = new Map<string, DocumentLoad>()

function cancelLoad(documentId: string): void {
  const current = loading.get(documentId)
  if (!current) return
  loading.delete(documentId)
  current.controller.abort()
}

export function restoreDocument(documentId: string): Promise<void> {
  const existing = loading.get(documentId)
  if (existing) return existing.promise
  const bridge = getBridge()
  const document = useDocuments.getState().documents[documentId]
  const io = ioOf(documentId)
  if (!io || io.holds(documentId)) return Promise.resolve()
  if (io.assetOnly) return Promise.resolve()
  if (!bridge || !document) {
    io.createDefault(documentId)
    return Promise.resolve()
  }
  unreadable.delete(documentId)
  const controller = new AbortController()
  const current: DocumentLoad = {
    document,
    epoch: epochOf(documentId),
    controller,
    promise: Promise.resolve(),
  }
  loading.set(documentId, current)
  current.promise = readDocument(current, io, bridge)
  return current.promise
}

async function readDocument(
  load: DocumentLoad,
  io: DocumentIo & { assetOnly?: undefined },
  bridge: StudioBridge,
): Promise<void> {
  const { document, controller } = load
  try {
    const file = await bridge.documents.read(document.id, document.kind)
    if (!loadIsCurrent(load, io)) return
    if (file) io.install(document.id, file.content, file.parts)
    else io.createDefault(document.id)
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) return
    unreadable.add(document.id)
    reportFailure('document.load', document.title, error)
  } finally {
    if (loading.get(document.id) === load) loading.delete(document.id)
  }
}

function loadIsCurrent(load: DocumentLoad, io: DocumentIo): boolean {
  const current = useDocuments.getState().documents[load.document.id]
  return (
    !load.controller.signal.aborted &&
    epochOf(load.document.id) === load.epoch &&
    current?.kind === load.document.kind &&
    !io.holds(load.document.id)
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
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
export function documentIsDirty(documentId: string): boolean {
  const io = ioOf(documentId)
  return io !== undefined && io.holds(documentId) && io.dirty(documentId)
}
let settling = 0
async function whileSettling<T>(body: () => Promise<T>): Promise<T> {
  settling += 1
  try {
    return await body()
  } finally {
    settling -= 1
  }
}
async function askAboutUnsavedWork(documentId: string): Promise<CloseChoice> {
  const title = useDocuments.getState().documents[documentId]?.title ?? ''
  const choice = await getBridge()?.documents.confirmClose(title)
  // 🛑 Nobody answered — no bridge, or a dialog that gave nothing back. Read as `cancel` because
  // that is the only safe reading of an unanswered question about unsaved work, but SAID: the
  // caller that stops on it announces nothing of its own, and the gesture dies where it stood.
  if (choice === undefined) {
    reportFailure(
      'document.close',
      title,
      new Error('the question about unsaved work went unanswered'),
    )
    return 'cancel'
  }
  return choice
}
export async function closeDocument(documentId: string): Promise<boolean> {
  return await whileSettling(async () => {
    if (documentIsDirty(documentId)) {
      const choice = await askAboutUnsavedWork(documentId)
      if (choice === 'cancel') return false
      if (choice === 'save' && !(await saveDocument(documentId))) return false
    }
    forgetDocument(documentId)
    return true
  })
}
export function unsavedDocumentIds(): string[] {
  return Object.keys(useDocuments.getState().documents).filter(documentIsDirty)
}
export async function autosaveOpenDocuments(): Promise<void> {
  if (settling > 0) return
  let wrote = false
  for (const documentId of unsavedDocumentIds()) {
    if (ioOf(documentId)?.autosaves === false) continue
    try {
      wrote = (await saveDocument(documentId, false)) || wrote
    } catch {
      continue
    }
  }
  if (wrote) void useDocuments.getState().relist('own-write')
}
export async function settleUnsavedWork(): Promise<boolean> {
  return await settleUnsaved(true)
}
export async function settleUnsavedWorkForProjectChange(): Promise<boolean> {
  return await settleUnsaved(false)
}
async function settleUnsaved(andForget: boolean): Promise<boolean> {
  return await whileSettling(async () => {
    const answers: Array<{
      documentId: string
      choice: CloseChoice
    }> = []
    for (const documentId of unsavedDocumentIds()) {
      const choice = await askAboutUnsavedWork(documentId)
      if (choice === 'cancel') return false
      answers.push({ documentId, choice })
    }
    for (const { documentId, choice } of answers) {
      if (choice === 'save' && !(await saveDocument(documentId))) return false
      if (andForget) forgetDocument(documentId)
    }
    return true
  })
}
export async function deleteDocument(documentId: string): Promise<boolean> {
  const bridge = getBridge()
  const document = useDocuments.getState().documents[documentId]
  if (!bridge || !document) return false
  return (await bridge.documents.confirmDelete(document.title)) && dropDocument(documentId)
}
export async function dropDocument(documentId: string): Promise<boolean> {
  const bridge = getBridge()
  const document = useDocuments.getState().documents[documentId]
  if (!bridge || !document) return false
  await bridge.documents.remove(document.id, document.kind)
  forgetDocument(documentId)
  void useDocuments.getState().relist('own-write')
  return true
}
let activeProjectPath: string | null | undefined

export function renamedDocumentProject(from: string, to: string): void {
  if (activeProjectPath === from) activeProjectPath = to
}

export async function refreshDocuments(projectPath?: string | null): Promise<boolean> {
  const projectChanged =
    projectPath !== undefined &&
    activeProjectPath !== undefined &&
    projectPath !== activeProjectPath
  if (projectPath !== undefined) activeProjectPath = projectPath
  const wereOpen = Object.values(useDocuments.getState().documents)
  for (const document of wereOpen) invalidateDocument(document.id)
  const answered = await useDocuments.getState().refresh()
  const { documents } = useDocuments.getState()
  for (const document of wereOpen) {
    if (!documents[document.id]) forgetDocument(document.id, document)
    else if (projectChanged) forgetDocumentState(document.id, document)
  }
  for (const document of Object.values(documents)) void restoreDocument(document.id)
  return answered
}
function forgetDocument(documentId: string, gone?: DocumentDescriptor): void {
  invalidateDocument(documentId)
  const document = gone ?? useDocuments.getState().documents[documentId]
  forgetDocumentState(documentId, document)
  closePanel(documentId)
  useDocuments.getState().close(documentId)
}

function forgetDocumentState(documentId: string, document?: DocumentDescriptor): void {
  if (document) IO_BY_KIND[document.kind].forget(document)
  unreadable.delete(documentId)
  assetBehind.delete(documentId)
  flattenAgreed.delete(documentId)
  useMaterialViews.getState().forget(documentId)
  useSkyboxViews.getState().forget(documentId)
  useMonitorPair.getState().forgetMonitorPair(documentId)
  usePlayback.getState().clearHead(documentId)
}
