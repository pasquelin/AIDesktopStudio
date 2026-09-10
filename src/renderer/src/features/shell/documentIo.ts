import { isAbortError } from '@shared/guards'
import { localizedError } from '@shared/localizedError'
import { getBridge } from '@/services/bridge'
import { reportFailure, reportNotice } from '@/services/diagnostics'
import { assetsById, useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useLivePreviews } from '@/stores/livePreviews'
import {
  type CloseChoice,
  type DocumentDescriptor,
  type FlattenChoice,
} from '@shared/domain/document'
import { FOLDER_ROOT, parentOf } from '@shared/domain/folder'
import { nearestEncodableFor } from '@shared/domain/encodableFormat'
import {
  formatOfFile,
  lossesFor,
  type CapabilityTrait,
  type WritableFormat,
} from '@shared/domain/formatCapability'
import { mayOverwriteSource, readFidelityOf } from '@shared/domain/readFidelity'
import { keepsWrittenFormat } from '@shared/domain/writtenFormat'
import i18next from 'i18next'
import { ioOf, type CapturedDraft, type DocumentIo } from './documentIoAdapters'
import { epochIsCurrent, epochOf, restoreDocument } from './documentLoad'
import {
  assetIsBehind,
  beginCapture,
  clearAssetBehind,
  endCapture,
  forgetDocument,
  forgetDocumentState,
  invalidateDocument,
  markAssetBehind,
  writableDocument,
  type SavableDocument,
} from './documentTab'
import { documentIsDirty, unsavedDocumentIds } from './documentDirty'
import { queueDocumentSave } from './documentSaveQueue'
/**
 * Asked at EVERY save, never remembered — §5.1.
 *
 * The answer used to be kept for the life of the document, which made the question a one-time
 * toll rather than a decision: say yes once to a text layer and every ⌘S after it flattened the
 * file without a word, including the ones where the layer had since been undone. What a save may
 * destroy is a property of the state it is about to write, and that state changes between saves.
 *
 * Three answers and not two, the third being the one §5.1 asks for: a format that cannot carry
 * the document is a reason to offer ANOTHER destination, not only a reason to destroy what it
 * cannot hold. `saveAs` is the default button for that reason — the path that loses nothing.
 */
async function flattenChoice(
  document: DocumentDescriptor,
  format: WritableFormat,
  losses: readonly CapabilityTrait[],
): Promise<FlattenChoice> {
  const lost = losses.map(trait => i18next.t(`traits.${trait}`)).join(', ')
  return (
    (await getBridge()?.documents.confirmFlatten(document.title, format.toUpperCase(), lost)) ??
    'flatten'
  )
}
type WritableSavableDocument = Omit<SavableDocument, 'io'> & {
  io: Extract<DocumentIo, { assetOnly?: undefined }>
}
type CapturedDocument = Awaited<
  ReturnType<NonNullable<Extract<DocumentIo, { assetOnly?: undefined }>['capture']>>
>
type CaptureResult = { ok: true; captured: CapturedDocument } | { ok: false; error: unknown }

/**
 * Why a save wrote nothing at all. Named rather than boolean: the two say different things to the
 * person in front of them, and each has its own sentence.
 */
export type SaveRefusal = 'sourceReadReduced' | 'sourceReadUnknown' | 'sourceFormatChange'

export const SAVE_REFUSALS: readonly SaveRefusal[] = [
  'sourceReadReduced',
  'sourceReadUnknown',
  'sourceFormatChange',
]

/**
 * The two ways a save is refused before it writes ANYTHING — the protections of §5.7.
 *
 * Before, and that is the whole of it: refusing after the document file is written leaves an
 * `.ora` beside a picture the user never asked to convert, which is the file this refusal exists
 * to keep off the disk. The document stays modified, and nothing on disk moved.
 *
 * `null` when the save may proceed, including for every document that writes no asset at all.
 */
function sourceWriteRefusal(
  { document, io }: WritableSavableDocument,
  plan: WritePlan | null,
): SaveRefusal | null {
  const source = document.sourceAssetId
  if (!source || !io.writeAsset || !plan) return null

  // P1. Read off the document rather than measured now: what tells a reduction from a crop is
  // WHO shrank the picture, and only the read knows that.
  //
  // The two answers are told apart, because they ask different things of the person: one says
  // the studio shrank the file on the way in, the other that nothing here knows how it was read
  // — a document filled from its own container rather than from the picture. Both refuse; only
  // the second has a gesture that clears it, and its sentence names that gesture.
  const fidelity = readFidelityOf(document.sourceFidelity)
  if (!mayOverwriteSource(fidelity)) {
    return fidelity === 'reduced' ? 'sourceReadReduced' : 'sourceReadUnknown'
  }

  // P2. Against what the writer PRODUCES, never against the format it was asked for: asked for a
  // JPEG it hands back a PNG, and `replaceBytes` then renames the file and deletes the original.
  const path = assetsById(useAssets.getState()).get(source)?.path
  return keepsWrittenFormat(path, io.writtenExtension(plan.format)) ? null : 'sourceFormatChange'
}

/**
 * A refusal with a way out — §5.1 and §5.6.
 *
 * A refusal PROTECTS; it does not make the gesture possible, and a save that only says no is the
 * dead end the five `incomplete` kinds and the two protections of §5.7 all ended in. The reason
 * is said, and the one destination that is always available is offered with it.
 *
 * Nothing is raised under autosave: nobody is at the machine to answer a window, and a question
 * that answers itself would either write somewhere nobody chose or block the pass.
 */
async function offerAnotherDestination(
  documentId: string,
  reason: string,
  byHand: boolean,
): Promise<boolean> {
  const document = useDocuments.getState().documents[documentId]
  const asked =
    byHand && document
      ? ((await getBridge()?.documents.confirmSaveElsewhere(document.title, reason)) ?? false)
      : false
  if (!asked) {
    // Said every time, even under autosave: a refusal nobody hears is the silence these
    // protections were written to end.
    reportNotice('document.save', reason)
    return false
  }
  return await savedElsewhere(documentId)
}

/** Through `import()` for the cycle: a Save as… reads the tab module this one reads too. */
async function savedElsewhere(documentId: string): Promise<boolean> {
  const { saveDocumentAs } = await import('./documentSaveAs')
  return await saveDocumentAs(documentId)
}

/**
 * Everything asked BEFORE a byte is written, and what it settled — `null` to go ahead, and
 * otherwise the answer the save itself hands back.
 *
 * Nothing is asked at all when nothing moved since the last save: this ⌘S then writes nothing
 * back over the file — `rewriteSourceAsset` holds the same gate — and a refusal or a flatten
 * question raised over a write that will not happen is a dialog for a gesture with no effect.
 */
async function askedBeforeWriting(
  savable: WritableSavableDocument,
  plan: WritePlan,
  byHand: boolean,
): Promise<boolean | null> {
  const { document, io } = savable
  if (!(io.dirty(document.id) || assetIsBehind(document.id))) return null

  const refusal = sourceWriteRefusal(savable, plan)
  if (refusal) {
    return await offerAnotherDestination(document.id, i18next.t(`documents.${refusal}`), byHand)
  }
  if (plan.losses.length === 0) return null

  const choice = await flattenChoice(document, plan.format, plan.losses)
  if (choice === 'flatten') return null
  return choice === 'saveAs' ? await savedElsewhere(document.id) : false
}

export async function saveDocument(documentId: string, byHand = true): Promise<boolean> {
  const savable = writableDocument(documentId)
  if (!savable) return false
  const { io } = savable
  const held = io.incomplete?.(documentId)
  if (held) return await offerAnotherDestination(documentId, held, byHand)
  // Waited HERE rather than at the doors: `capture` reads the mounted engine, which trails the
  // store by a render — see `createAppliedGate`. One of the seven callers had it, so ⌘S right
  // after an edit still wrote the pixels from before it.
  await io.settled?.(documentId)
  if (io.assetOnly) return await io.saveOwn(documentId)
  const writable: WritableSavableDocument = { ...savable, io }
  // Walked ONCE per save: `traitsOf` is a walk of the whole layer stack, and the questions and
  // the write both need the same answer.
  const source = writable.document.sourceAssetId
  const plan = io.writeAsset && source ? writePlanFor(writable.document, io, source) : null
  // Awaited only where there is something to ask, which is a document that writes an ASSET: an
  // await on the way to `capture` puts a microtask between two ⌘S, and the order they reach the
  // disk in is what `documentIo06` holds.
  if (plan) {
    const asked = await askedBeforeWriting(writable, plan, byHand)
    if (asked !== null) return asked
  }
  const epoch = epochOf(documentId)
  const controller = beginCapture(documentId)
  const capture = captureForSave(io, documentId, controller)
  return await queueDocumentSave(documentId, async () =>
    writeCaptured(writable, plan, epoch, controller, await capture, byHand),
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
  plan: WritePlan | null,
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
  const { commit } = captured

  if (!(await writeWhereItBelongs(savable, plan, document, captured, epoch, controller, byHand))) {
    return false
  }
  if (!epochIsCurrent(document, epoch, controller.signal)) return false
  commit()
  // Only what this save COVERS — §9.1, guarantee 3. Asked after the commit and re-read from the
  // store, so an edit made WHILE the file was being written keeps its entry.
  const { clearRecoveryCovered } = await import('./documentRecovery')
  await clearRecoveryCovered(document.id)
  void useDocuments.getState().relist('own-write')
  return true
}

/**
 * ONE write per ⌘S, into the one destination the document has — §5.3.
 *
 * A document opened FOR an asset writes that asset's file and nothing else. It used to write
 * both: the studio's own `.ora` in the documents folder AND the picture, every single time. That
 * is where the two files came from, and the second of them was an export nobody asked for (R5).
 *
 * Every other document writes its own file, which IS its destination.
 */
async function writeWhereItBelongs(
  savable: WritableSavableDocument,
  plan: WritePlan | null,
  document: DocumentDescriptor,
  { draft, wasEdited }: CapturedDocument,
  epoch: number,
  controller: AbortController,
  byHand: boolean,
): Promise<boolean> {
  const source = document.sourceAssetId
  if (savable.io.writeAsset && source && plan) {
    return await rewriteSourceAsset(document, savable.io, source, plan, wasEdited, draft)
  }
  const payload = {
    ...draft,
    title: document.title,
    ...(source ? { sourceAssetId: source } : {}),
  }
  return await writeDraft(savable, document, payload, epoch, controller.signal, byHand)
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
  if (!epochIsCurrent(document, epoch, signal)) return false
  await bridge.documents.write(document.id, document.kind, draft, true, folder)
  return true
}

/** What a save is about to write, and what that would destroy — walked once per save. */
export type WritePlan = { format: WritableFormat; losses: CapabilityTrait[] }

export function writePlanFor(
  document: DocumentDescriptor,
  io: DocumentIo,
  sourceAssetId: string,
): WritePlan {
  const path = assetsById(useAssets.getState()).get(sourceAssetId)?.path ?? ''
  const traits = io.traitsOf?.(document.id) ?? []
  // A format the studio cannot even name falls back to the CLOSEST one it writes, not to the
  // richest: a flat `.gif` is offered a PNG, where the fallback used to send it to a container
  // of layers it holds none of (§5.5).
  const written = formatOfFile(path) ?? nearestEncodableFor('picture', traits)
  // No guard on `traitsOf`: an io that has none holds no traits, and `lossesFor([], …)` is empty.
  return { format: written, losses: lossesFor(traits, written) }
}
async function rewriteSourceAsset(
  document: DocumentDescriptor,
  io: Extract<DocumentIo, { writeAsset: object }>,
  source: string,
  { format }: WritePlan,
  wasEdited: boolean,
  captured: CapturedDraft,
): Promise<boolean> {
  // Nothing moved since the last save: a re-encode that changes nothing is a file rewritten for
  // no reason, and for a lossy format it is quality spent for no reason (§6.2).
  if (!wasEdited && !assetIsBehind(document.id)) return true
  try {
    const written = await io.writeAsset(
      document.id,
      { replaces: source, name: document.title, format },
      captured,
    )
    if (!written) throw localizedError('bakeContentEmpty')
    clearAssetBehind(document.id)
    useLivePreviews.getState().revokePreview(source)
    useAssets.getState().invalidate()
    return true
  } catch (error) {
    markAssetBehind(document.id)
    reportFailure('assets.save', document.title, error)
    return false
  }
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
 * `writes` selects the documents this pass still answers for — the ones the recovery area does
 * not hold, which is the character and the script. For every other kind this used to be the net,
 * and it wrote the user's own files to be one: opening a video grew an `.otio` beside it, a sky
 * a `.gltf`, neither asked for. See `documentRecovery.ts`.
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
