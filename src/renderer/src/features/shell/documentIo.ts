import { isAbortError } from '@shared/guards'
import { localizedError } from '@shared/localizedError'
import { getBridge } from '@/services/bridge'
import { reportFailure, reportNotice } from '@/services/diagnostics'
import { assetsById, useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { takenDocumentNames } from '@/stores/documentNames'
import { useLivePreviews } from '@/stores/livePreviews'
import { useMaterialViews } from '@/stores/materialViews'
import { useMonitorPair } from '@/stores/monitorPair'
import { usePlayback } from '@/stores/playback'
import { useSkyboxViews } from '@/stores/skyboxViews'
import {
  documentFolderOf,
  type CloseChoice,
  type DocumentDescriptor,
} from '@shared/domain/document'
import { nextFreeDocumentName } from '@shared/domain/documentName'
import { FOLDER_ROOT, parentOf } from '@shared/domain/folder'
import {
  formatOfFile,
  lossesFor,
  type CapabilityTrait,
  type WritableFormat,
} from '@shared/domain/formatCapability'
import { mayOverwriteSource, readFidelityOf, type ReadFidelity } from '@shared/domain/readFidelity'
import { keepsWrittenFormat } from '@shared/domain/writtenFormat'
import type { StudioBridge } from '@shared/ipc'
import i18next from 'i18next'
import { closePanel, openDocument } from './components/dockviewApi'
import { IO_BY_KIND, ioOf, type CapturedDraft, type DocumentIo } from './documentIoAdapters'
import {
  epochIsCurrent,
  epochOf,
  forgetLoadState,
  invalidateLoad,
  isUnreadable,
  restoreDocument,
} from './documentLoad'
import { documentIsDirty, unsavedDocumentIds } from './documentDirty'
import { queueDocumentSave } from './documentSaveQueue'
const assetBehind = new Set<string>()
const capturing = new Map<string, Set<AbortController>>()

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
  invalidateLoad(documentId)
  const active = capturing.get(documentId)
  if (!active) return
  capturing.delete(documentId)
  for (const controller of active) controller.abort()
}
/**
 * Asked at EVERY save, never remembered — §5.1.
 *
 * The answer used to be kept for the life of the document, which made the question a one-time
 * toll rather than a decision: say yes once to a text layer and every ⌘S after it flattened the
 * file without a word, including the ones where the layer had since been undone. What a save may
 * destroy is a property of the state it is about to write, and that state changes between saves.
 */
async function agreedToFlatten(
  document: DocumentDescriptor,
  format: WritableFormat,
  losses: readonly CapabilityTrait[],
): Promise<boolean> {
  return await askedToFlatten(
    document.title,
    format.toUpperCase(),
    losses.map(trait => i18next.t(`traits.${trait}`)).join(', '),
  )
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
  if (isUnreadable(documentId) || !io.holds(documentId)) return null
  const refusal = io.incomplete?.(documentId)
  if (refusal) {
    if (byHand) reportNotice('document.save', refusal)
    return null
  }
  return { bridge, document, io }
}
/**
 * Why a save wrote nothing at all. Named rather than boolean: the two say different things to the
 * person in front of them, and each has its own sentence.
 */
export type SaveRefusal = 'sourceReadReduced' | 'sourceFormatChange'

export const SAVE_REFUSALS: readonly SaveRefusal[] = ['sourceReadReduced', 'sourceFormatChange']

/**
 * The two ways a save is refused before it writes ANYTHING — the protections of §5.7.
 *
 * Before, and that is the whole of it: refusing after the document file is written leaves an
 * `.ora` beside a picture the user never asked to convert, which is the file this refusal exists
 * to keep off the disk. The document stays modified, and nothing on disk moved.
 *
 * `null` when the save may proceed, including for every document that writes no asset at all.
 */
function sourceWriteRefusal({ document, io }: WritableSavableDocument): SaveRefusal | null {
  const source = document.sourceAssetId
  if (!source || !io.writeAsset) return null

  // P1. Read off the document rather than measured now: what tells a reduction from a crop is
  // WHO shrank the picture, and only the read knows that.
  if (!mayOverwriteSource(readFidelityOf(document.sourceFidelity))) return 'sourceReadReduced'

  // P2. Against what the writer PRODUCES, never against the format it was asked for: asked for a
  // JPEG it hands back a PNG, and `replaceBytes` then renames the file and deletes the original.
  const path = assetsById(useAssets.getState()).get(source)?.path
  const { format } = writePlanFor(document, io, source)
  return keepsWrittenFormat(path, io.writtenExtension(format)) ? null : 'sourceFormatChange'
}

export async function saveDocument(documentId: string, byHand = true): Promise<boolean> {
  const savable = savableDocument(documentId, byHand)
  if (!savable) return false
  const { io } = savable
  // Waited HERE rather than at the doors: `capture` reads the mounted engine, which trails the
  // store by a render — see `createAppliedGate`. One of the seven callers had it, so ⌘S right
  // after an edit still wrote the pixels from before it.
  await io.settled?.(documentId)
  if (io.assetOnly) return await io.saveOwn(documentId)
  const writable: WritableSavableDocument = { ...savable, io }
  const refusal = sourceWriteRefusal(writable)
  if (refusal) {
    // Said every time, even under autosave: a refusal nobody hears is the silence these two
    // protections were written to end.
    reportNotice('document.save', i18next.t(`documents.${refusal}`))
    return false
  }
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
  if (!epochIsCurrent(document, epoch, controller.signal)) return false
  document = useDocuments.getState().documents[document.id] ?? document
  const { draft, commit, wasEdited } = captured
  const payload = {
    ...draft,
    title: document.title,
    ...(document.sourceAssetId ? { sourceAssetId: document.sourceAssetId } : {}),
    // Carried into the file, so a document reopened next session does not regain the right to
    // overwrite a source this session read reduced.
    ...(document.sourceFidelity ? { sourceFidelity: document.sourceFidelity } : {}),
  }
  if (!(await writeDraft(savable, document, payload, epoch, controller.signal, byHand)))
    return false
  if (!epochIsCurrent(document, epoch, controller.signal)) return false
  commit()
  // Only what this save COVERS — §9.1, guarantee 3. Asked after the commit and re-read from the
  // store, so an edit made WHILE the file was being written keeps its entry.
  const { clearRecoveryCovered } = await import('./documentRecovery')
  await clearRecoveryCovered(document.id)
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
  draft: CapturedDraft & { title: string; sourceAssetId?: string; sourceFidelity?: ReadFidelity },
  epoch: number,
  signal: AbortSignal,
  byHand: boolean,
): Promise<boolean> {
  const folder = parentOf(document.path) ?? FOLDER_ROOT
  const result = await bridge.documents.write(document.id, document.kind, draft, false, folder)
  if (result !== 'stale') return true
  if (!byHand || !(await bridge.documents.confirmOverwrite(document.title))) return false
  if (!epochIsCurrent(document, epoch, signal)) return false
  await bridge.documents.write(document.id, document.kind, draft, true, folder)
  return true
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
    if (!written) throw localizedError('bakeContentEmpty')
    assetBehind.delete(document.id)
    useLivePreviews.getState().revokePreview(source)
    useAssets.getState().invalidate()
  } catch (error) {
    assetBehind.add(document.id)
    reportFailure('assets.save', document.title, error)
  }
}
/**
 * What a copy is called, freed of a name the folder already holds: the store leaves a view of an
 * asset its asset's name, and copying one document twice stood two tabs on one file, each saving
 * over the other (2026-09-09).
 */
const copyName = (document: DocumentDescriptor): string =>
  nextFreeDocumentName(
    i18next.t('documents.copyName', { name: document.title }),
    document.kind,
    takenDocumentNames(useDocuments.getState(), documentFolderOf(document.kind)),
  )

async function copyDocumentAsset(
  documentId: string,
  { bridge, document, io }: SavableDocument,
): Promise<boolean> {
  const source = document.sourceAssetId
  if (!source || !io.writeAsset || io.assetOnly) {
    reportFailure('assets.copy', document.title, localizedError('copyContentEmpty'))
    return false
  }
  const name = copyName(document)
  const { format, losses } = writePlanFor(document, io, source)
  try {
    const { draft } = await io.capture(documentId)
    const copy = await io.writeAsset(
      documentId,
      { derivedFrom: source, name, format: losses.length === 0 ? format : 'ora' },
      draft,
    )
    if (!copy) {
      reportFailure('assets.copy', document.title, localizedError('bakeContentEmpty'))
      return false
    }
    return await standUpCopy(bridge, document, name, copy.id, draft)
  } catch (error) {
    reportFailure('assets.copy', document.title, error)
    return false
  }
}

/**
 * The tab the copy carries on in. Its fidelity is `faithful` and can be nothing else: the copy IS
 * what the studio holds, written whole, so nothing was read to make it and nothing reduced.
 */
async function standUpCopy(
  bridge: StudioBridge,
  document: DocumentDescriptor,
  name: string,
  copyId: string,
  draft: CapturedDraft,
): Promise<boolean> {
  const created = await useDocuments
    .getState()
    .create(document.workspace, { title: name, sourceAssetId: copyId, sourceFidelity: 'faithful' })
  if (!created) {
    reportFailure('assets.copy', document.title, localizedError('copyDocumentMissing'))
    return false
  }
  await bridge.documents.write(
    created.id,
    created.kind,
    { ...draft, title: name, sourceAssetId: copyId, sourceFidelity: 'faithful' },
    false,
    parentOf(created.path) ?? FOLDER_ROOT,
  )
  openDocument(created)
  await useAssets.getState().refresh()
  void useDocuments.getState().relist('own-write')
  return true
}

export async function saveDocumentAs(documentId: string): Promise<boolean> {
  const savable = savableDocument(documentId)
  return savable ? await copyDocumentAsset(documentId, savable) : false
}
/** Through `import()` for the cycle: the recovery reads this module's own `documentIsDirty`. */
async function discardRecovery(documentId: string): Promise<void> {
  const { clearRecoveryOf } = await import('./documentRecovery')
  await clearRecoveryOf(documentId)
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
  return (await getBridge()?.documents.confirmClose(title)) ?? 'cancel'
}
export async function closeDocument(documentId: string): Promise<boolean> {
  return await whileSettling(async () => {
    if (documentIsDirty(documentId)) {
      const choice = await askAboutUnsavedWork(documentId)
      if (choice === 'cancel') return false
      if (choice === 'save' && !(await saveDocument(documentId))) return false
      // Purged at the CONFIRMED abandonment and never before — §9.1, guarantee 4.
      if (choice === 'discard') await discardRecovery(documentId)
    }
    forgetDocument(documentId)
    return true
  })
}
/**
 * The pass that still writes REAL files, and the two kinds left to it.
 *
 * `covers` is what the recovery area could not hold — the character and the script. For every
 * other kind this used to be the net, and it wrote the user's own files to be one: opening a
 * video grew an `.otio` beside it, a sky a `.gltf`, neither asked for. See `documentRecovery.ts`.
 */
export async function autosaveOpenDocuments(
  covers: (documentId: string) => boolean,
): Promise<void> {
  if (settling > 0) return
  let wrote = false
  for (const documentId of unsavedDocumentIds()) {
    if (!covers(documentId)) continue
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
      // 🛑 This `false` says BOTH "it failed" and "the person answered no to the overwrite
      // question", and nothing here tells them apart — so it stays silent rather than call a
      // deliberate cancel an error. `closeDocument` has the same line, and the same hole.
      if (choice === 'save' && !(await saveDocument(documentId))) return false
      if (choice === 'discard') await discardRecovery(documentId)
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
  forgetLoadState(documentId)
  assetBehind.delete(documentId)
  useMaterialViews.getState().forget(documentId)
  useSkyboxViews.getState().forget(documentId)
  useMonitorPair.getState().forgetMonitorPair(documentId)
  usePlayback.getState().clearHead(documentId)
}
