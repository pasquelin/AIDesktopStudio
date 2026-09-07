import { refused, type ActionOutcome } from '@shared/domain/assistant'
import type {
  SnapshotDocument,
  SnapshotSelection,
  StudioSnapshot,
} from '@shared/domain/studioSnapshot'
import { scopeOfWorkspace } from '@shared/domain/command'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { PlayState } from '@shared/domain/gameRuntime'
import { SNAPSHOT_TASKS_MAX, type SnapshotTask } from '@shared/domain/studioSnapshot'
import { briefingName, TARGET_ID_MAX } from '@shared/domain/target'
import { EXPORT_FORMATS } from '@shared/domain/scene'
import { MATERIAL_EXPORT_TARGETS } from '@shared/domain/materialExport'
import type { FolderExportRequest } from '@shared/ipc'
import {
  closeDocument,
  documentIsDirty,
  dropDocument,
  saveDocument,
} from '@/features/shell/documentIo'
import { openDocument } from '@/features/shell/components/dockviewApi'
import { layerById } from '@/engines/canvas/canvasState'
import { selectedNodes } from '@/engines/scene/sceneState'
import { designatedIn } from '@/engines/timeline/timelineState'
import { reportFailure } from '@/services/diagnostics'
import type { DocumentKind } from '@shared/domain/document'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import {
  activeImageId,
  activeMontageId,
  activeSceneId,
  documentAtPath,
  useDocuments,
  type DocumentsSlice,
} from '@/stores/documents'
import { toolSurface, useLayouts } from '@/stores/layouts'
import { playReportOf, usePlay } from '@/stores/play'
import { useTasks, type TaskRow } from '@/stores/tasks'
import { useSettings } from '@/stores/settings'
import { useModels } from '@/stores/models'
import { useProject } from '@/stores/project'
import { sceneOf, sceneStore, useScenes } from '@/stores/scenes'
import { sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'
import { withBridge, type ActionHandlers } from './actionHandler'
import { numberOf, oneOf, textOf } from './actionInputs'
import { documentRevisionOf, documentStateOf } from './documentStateProviders'

/** The face a sky is exported at when a client names none — the row the native menu offers. */
const DEFAULT_FACE = 2048

const SCENE_SCOPES: readonly ('scene' | 'selection')[] = ['scene', 'selection']

/**
 * What the studio is, read from the stores the screen reads. Nothing here computes a second
 * answer — the surface comes from `toolSurface`, the dirty mark from the predicate the tab
 * bullet uses: a client and the person at the machine must see one studio, not two.
 */

const summaryOf = (document: DocumentDescriptor, activeId: string | null): SnapshotDocument => ({
  id: document.id,
  title: document.title,
  kind: document.kind,
  workspace: document.workspace,
  path: document.path,
  active: document.id === activeId,
  modified: documentIsDirty(document.id),
})

function selectionNow(documents: DocumentsSlice): SnapshotSelection | null {
  const imageId = activeImageId(documents)
  if (imageId !== null) return imageSelection(imageId)

  const sceneId = activeSceneId(documents)
  if (sceneId !== null) return sceneSelection(sceneId)

  const montageId = activeMontageId(documents)
  return montageId === null ? null : montageSelection(montageId)
}

function imageSelection(imageId: string): SnapshotSelection | null {
  const canvases = useCanvases.getState()
  if (!canvasStore.hasState(canvases, imageId)) return null

  const canvas = canvasOf(canvases, imageId)
  const layer = layerById(canvas, canvas.activeLayerId)
  return layer ? { kind: 'layer', items: [{ id: layer.id, name: layer.name }] } : null
}

function sceneSelection(sceneId: string): SnapshotSelection | null {
  const scenes = useScenes.getState()
  if (!sceneStore.hasState(scenes, sceneId)) return null

  const scene = sceneOf(scenes, sceneId)
  const chosen = selectedNodes(scene.nodes, scene.selectedIds)
  return chosen.length === 0
    ? null
    : { kind: 'node', items: chosen.map(node => ({ id: node.id, name: node.name })) }
}

function montageSelection(montageId: string): SnapshotSelection | null {
  const sequences = useSequences.getState()
  if (!sequenceStore.hasState(sequences, montageId)) return null

  // The one answer `InspectorFace` reads. A clip has no name of its own, so it stands under its id.
  const designated = designatedIn(sequenceOf(sequences, montageId))
  if (designated === null) return null

  const { id, name } =
    designated.kind === 'track'
      ? designated.track
      : { id: designated.clip.id, name: designated.clip.id }
  return { kind: designated.kind, items: [{ id, name }] }
}

/** What the tab in front IS — what puts ⌘Z in one history rather than another. */
const frontKind = (documents: DocumentsSlice): DocumentKind | null =>
  (documents.activeId ? documents.documents[documents.activeId] : undefined)?.kind ?? null

/**
 * The running tasks a briefing may name, newest first — what a person just started is what they
 * ask about. Cut and scrubbed like a target: `TaskRow.label` is a document title, unbounded, and
 * an over-long one fails `parseSnapshot` and takes the WHOLE studio block out of the briefing.
 */
function publishedTasks(running: Readonly<Record<string, TaskRow>>): SnapshotTask[] {
  return Object.values(running)
    .filter(one => one.id.length <= TARGET_ID_MAX)
    .reverse()
    .slice(0, SNAPSHOT_TASKS_MAX)
    .map(one => ({
      id: one.id,
      label: briefingName(one.label),
      // `taskRatio` divides what is done by an ESTIMATED total, so it overshoots.
      ratio: Math.min(1, Math.max(0, one.ratio)),
    }))
}

/** The state of the game on the scene in front, or `edit` when none is in front at all. */
function playAhead(documents: DocumentsSlice): PlayState {
  const sceneId = activeSceneId(documents)
  return sceneId === null ? 'edit' : playReportOf(usePlay.getState(), sceneId).state
}

/**
 * 🛑 Typed as `StudioSnapshot` rather than composed loose: this leaves the window as `unknown`
 * and is read key by key in the main process. Untyped, a field renamed here left `describeStudio`
 * composing an empty sentence, and the model acting on a studio that is not there.
 */
export function studioSnapshot(): StudioSnapshot {
  const documents = useDocuments.getState()
  const surface = toolSurface()
  const project = useProject.getState()
  // The window's mirror avoids probing the API before every assistant turn.
  const auth = useSettings.getState()
  const activeDocument = documents.activeId ? documents.documents[documents.activeId] : undefined

  return {
    project: project.project,
    // 🛑 Beside the project itself: its initial `null` means "not asked yet", and a reader that
    // took it for an answer would tell a model there is no project over an open one.
    projectKnown: project.known,
    workspace: useLayouts.getState().activeWorkspace,
    /**
     * The surface, and the scope it puts a command in — the two facts `command.runStudioCommand` refuses on.
     * A client that reads `wrongSurface` needs the SCOPE to know what to activate, and deriving
     * it here rather than leaving it to be looked up is what makes the refusal actionable.
     */
    surface,
    commandScope: scopeOfWorkspace(surface, frontKind(documents)),
    documents: Object.values(documents.documents).map(one => summaryOf(one, documents.activeId)),
    documentRevisions: Object.values(documents.documents).flatMap(document => {
      const revision = documentRevisionOf(document)
      return revision ? [revision] : []
    }),
    ...(activeDocument
      ? { activeDocumentState: documentStateOf(activeDocument) ?? undefined }
      : {}),
    // What the person has designated, which is what a spoken request most often means by "it".
    selection: selectionNow(documents),
    armedModels: useModels.getState().selected,
    // Off the scene IN FRONT: a game runs per document, and another tab's would aim
    // « reprends la partie » at a scene the person is not looking at.
    play: playAhead(documents),
    tasks: publishedTasks(useTasks.getState().running),
    authenticated: auth.auth.authenticated,
    // Same reason as `projectKnown`, and the store keeps the flag for it.
    authKnown: auth.authKnown,
  }
}

export const studioState = (): ActionOutcome => ({ ok: true, data: studioSnapshot() })

function listDocuments(): ActionOutcome {
  const { stored, documents, activeId } = useDocuments.getState()
  const open = new Set(Object.keys(documents))

  return {
    ok: true,
    // `stored` is the folder and `documents` is what tabs show; a document may be in either or
    // both, and a client asking "what is there" means the union.
    data: [
      ...stored,
      ...Object.values(documents).filter(one => !stored.some(s => s.id === one.id)),
    ].map(one => ({ ...summaryOf(one, activeId), open: open.has(one.id) })),
  }
}

async function openByPath(input: Record<string, unknown>): Promise<ActionOutcome> {
  const path = textOf(input, 'path')
  if (path === null)
    return refused(
      'badInput',
      '"path" is wanted — the path of a document inside the open project, as documents.list answers it',
    )

  // Re-read first: the listing a client holds may predate a file that has since arrived, and
  // answering "no such document" for one sitting on the disk is the least useful refusal there is.
  // `'own-write'` rather than a bare call, which joins a listing already in flight — one that may
  // have STARTED before the file appeared, and would answer without it.
  if (!documentAtPath(useDocuments.getState(), path)) {
    await useDocuments.getState().relist('own-write')
  }

  const document = documentAtPath(useDocuments.getState(), path)
  if (!document)
    return refused(
      'notFound',
      `no document at "${path}" in this project — documents.list answers what is there, each with its path`,
    )

  openDocument(document)
  return { ok: true, data: { documentId: document.id } }
}

/**
 * The open document a call names — by id, by path, or by a title only one of them wears.
 *
 * 🛑 By TITLE as well, because the id is the one thing a caller may never have seen: the briefing
 * names open documents in quotes and nothing else, so a model told to bring one back to the front
 * had only its title to answer with, and was refused for it.
 *
 * A title two documents share resolves to neither: guessing between them would activate the wrong
 * one silently, where `notFound` sends the caller to `documents.list` for the id.
 */
function namedDocument(input: Record<string, unknown>): DocumentDescriptor | null {
  const named = textOf(input, 'documentId') ?? ''
  const { documents } = useDocuments.getState()
  const byId = documents[named]
  if (byId || named === '') return byId ?? null

  const titled = Object.values(documents).filter(one => one.title === named || one.path === named)
  return titled.length === 1 ? (titled[0] ?? null) : null
}

function named(input: Record<string, unknown>): string | null {
  return namedDocument(input)?.id ?? null
}

/** What a caller does about a document nobody answers to — spelled once for the five sites. */
const noDocument = (input: Record<string, unknown>): string =>
  `no open document answers to "${textOf(input, 'documentId') ?? ''}" — documents.list answers what ` +
  'is open, by id, by path and by title, and a title two documents share resolves to neither'

async function close(input: Record<string, unknown>): Promise<ActionOutcome> {
  const documentId = named(input)
  if (documentId === null) return refused('notFound', noDocument(input))

  /**
   * The same path the tab's cross takes, question about unsaved work included — and the reason
   * this action commits `none`: `closeDocument` raises the only question that knows whether
   * there is anything at stake, so a second one before it would ask twice for one gesture.
   */
  return (await closeDocument(documentId))
    ? { ok: true }
    : refused(
        'declined',
        'the person at the screen kept the document open rather than lose its unsaved work — document.save writes it first',
      )
}

async function rename(input: Record<string, unknown>): Promise<ActionOutcome> {
  const documentId = named(input)
  const title = textOf(input, 'title') ?? ''
  if (documentId === null) return refused('notFound', noDocument(input))

  const failure = await useDocuments.getState().rename(documentId, title)
  if (failure) {
    reportFailure('document.rename', title, failure)
    // The cause, not just the refusal: `duplicate` and `too-long` are repaired by a caller,
    // and `badInput` alone had one send the same title back — bench pass of 2026-08-26.
    return refused('badInput', `the title "${title}" is ${failure}`)
  }

  return { ok: true }
}

/**
 * ⌘S on a named document, AWAITED — the difference from `command.runStudioCommand('document.save')`, which
 * saves whatever is in front and answers before the write lands.
 *
 * A throw is a refusal rather than an exception across the boundary: an image whose engine is
 * still booting its GPU context cannot hand its pixels over, and that is `notRenderable` — the
 * same answer an export gives for the same cause.
 */
async function save(input: Record<string, unknown>): Promise<ActionOutcome> {
  const documents = useDocuments.getState()
  const documentId = textOf(input, 'documentId') ?? documents.activeId
  if (documentId === null || !documents.documents[documentId])
    return refused(
      'notFound',
      `no open document answers to "${textOf(input, 'documentId') ?? ''}", and nothing is in front to save — documents.list answers what is open`,
    )

  try {
    return { ok: true, data: { written: await saveDocument(documentId) } }
  } catch (error) {
    reportFailure('document.save', documentId, error)
    return refused(
      'notRenderable',
      'the document could not be composed for writing — its engine may still be starting; the journal holds the cause',
    )
  }
}

/** Deletes the document's file and closes its tab — see `dropDocument` for why nothing is asked. */
async function remove(input: Record<string, unknown>): Promise<ActionOutcome> {
  const documentId = named(input)
  if (documentId === null) return refused('notFound', noDocument(input))

  return (await dropDocument(documentId))
    ? { ok: true }
    : refused('failed', 'the studio did not delete that document — the journal holds why')
}

/**
 * The files an export of the document in front comes to, one space at a time.
 *
 * Loaded on the call rather than imported at the top: this table is evaluated by the first screen,
 * and `eager-graph.test.ts` holds that chunk to reaching no third module out of an editor's
 * folder. Each of them is the SAME rendering the native menu goes through.
 *
 * A montage answers with its CUT rather than a film of it: the film is rendered frame by frame
 * through a session the viewport drives and no outside client can hold, while the `.otio` is one
 * encoding of plain data. The two audio-and-video kinds share it — they share the montage.
 *
 * **Every kind answers, so there is no `default`** — the compiler is what keeps the next one from
 * being forgotten. `null` is an answer: the kind sends nothing out.
 */
async function exportOf(
  document: DocumentDescriptor,
  input: Record<string, unknown>,
): Promise<FolderExportRequest | null> {
  switch (document.kind) {
    case 'image':
    case 'scene':
    case 'skybox':
    case 'material':
      return visualExportOf(document, input)
    case 'gui':
      return null
    case 'character':
      return null
    case 'sequence':
    case 'audio': {
      const { otioExportFiles } = await import('@/features/shell/components/otioExport')
      return otioExportFiles(document.id)
    }
    case 'script':
      return null
  }
}

async function visualExportOf(
  document: DocumentDescriptor,
  input: Record<string, unknown>,
): Promise<FolderExportRequest | null> {
  switch (document.kind) {
    case 'image':
      return imageExportOf(document.id)
    case 'scene':
      return sceneExportOf(document.id, input)
    case 'skybox':
      return skyboxExportOf(document.id, input)
    case 'material':
      return materialExportOf(document.id, input)
    default:
      return null
  }
}

async function imageExportOf(documentId: string): Promise<FolderExportRequest> {
  const { imageExportFiles } = await import('@/features/image/imageExportFiles')
  return imageExportFiles(documentId)
}

async function sceneExportOf(
  documentId: string,
  input: Record<string, unknown>,
): Promise<FolderExportRequest> {
  const { sceneExportFiles } =
    await import('@/features/scene/components/Scene/Document/sceneExportFiles')
  return sceneExportFiles(
    documentId,
    oneOf(input, 'format', EXPORT_FORMATS) ?? 'glb',
    oneOf(input, 'scope', SCENE_SCOPES) ?? 'scene',
  )
}

async function skyboxExportOf(
  documentId: string,
  input: Record<string, unknown>,
): Promise<FolderExportRequest> {
  const { skyboxExportFiles } =
    await import('@/features/skybox/components/Skybox/Document/skyboxExportFiles')
  return skyboxExportFiles(documentId, {
    kind: 'faces',
    size: numberOf(input, 'size') ?? DEFAULT_FACE,
  })
}

async function materialExportOf(
  documentId: string,
  input: Record<string, unknown>,
): Promise<FolderExportRequest> {
  const { materialExportFiles } = await import('@/features/material/materialExportFiles')
  return materialExportFiles(documentId, oneOf(input, 'target', MATERIAL_EXPORT_TARGETS) ?? 'raw')
}

/**
 * Writes the document in front into the project, in a folder of its own.
 *
 * Every rendering throws rather than answering half an export — a sky with no picture, a material
 * with no channel, an engine that is not mounted, a montage with no project to resolve its media
 * against. `notRenderable` names them; this used to answer `badInput`, which sent a client back
 * to check parameters that were never the cause.
 *
 * The `try` covers the RENDERING alone. It wrapped the write too, so a `folder` the main process
 * refuses — it takes one path segment — came back named as a rendering that never happened.
 */
async function exportDocument(input: Record<string, unknown>): Promise<ActionOutcome> {
  const documents = useDocuments.getState()
  const document = documents.activeId ? documents.documents[documents.activeId] : undefined
  if (!document)
    return refused(
      'wrongSurface',
      'nothing is in front to export — documents.list answers what is open, and document.activate brings one forward',
    )

  let request
  try {
    request = await exportOf(document, input)
  } catch (error) {
    reportFailure('document.export', document.id, error)
    return refused(
      'notRenderable',
      'the document could not be rendered for export — a sky with no picture, a material with no channel, an engine not yet mounted; the journal holds which',
    )
  }
  // A kind that sends nothing out, which is Code alone — told apart from a rendering that failed.
  if (request === null)
    return refused(
      'wrongSurface',
      `a "${document.kind}" document sends nothing out of the studio — it is already a file of the project`,
    )

  const folder = textOf(input, 'folder')
  return withBridge(bridge =>
    bridge.project.exportInto(folder === null ? request : { ...request, folder }),
  )
}

export const STATE_HANDLERS: ActionHandlers = {
  'studio.state': studioState,
  'document.export': exportDocument,
  'documents.list': listDocuments,
  'document.open': openByPath,
  'document.close': close,
  'document.rename': rename,
  'document.save': save,
  'document.deleteFromDisk': remove,

  // The same gesture as opening it: naming the tab in the store alone left an image in front of
  // a sky's panels, which no click can produce — the state this action exists to repair.
  'document.activate': input => {
    const document = namedDocument(input)
    if (document === null) return refused('notFound', noDocument(input))

    // Named here as well as opened: behind the home there is no centre to announce the tab, and
    // the state a client reads next would still be describing the document it just left.
    useDocuments.getState().activate(document.id)
    openDocument(document)
    return { ok: true }
  },

  'activity.recent': input => {
    const limit = numberOf(input, 'limit')
    return withBridge(bridge => bridge.activity.read(limit === null ? {} : { limit }))
  },
}
