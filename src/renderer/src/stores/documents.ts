import {
  documentFolderOf,
  isFiledKind,
  kindForWorkspace,
  kindsForWorkspace,
  type DocumentDescriptor,
  type DocumentKind,
} from '@shared/domain/document'
import {
  checkDocumentName,
  documentPathFor,
  nextFreeDocumentName,
  DOCUMENT_NAME_FAILURES,
  type DocumentNameFailure,
  type NamedDocument,
} from '@shared/domain/documentName'
import { nameFailureOf } from '@shared/domain/fileName'
import type { ReadFidelity } from '@shared/domain/readFidelity'
import { workshopIdOf } from '@shared/domain/character'
import { parentOf } from '@shared/domain/folder'
import { refFromString } from '@shared/domain/ref'
import type { WorkspaceId } from '@shared/domain/workspace'
import { resolveLanguage } from '@shared/i18n'
import i18next from 'i18next'
import { create as createStore } from 'zustand'
import { getBridge } from '@/services/bridge'
import { newId } from '@/helpers/ids'
import { takenDocumentNames, untitledDocumentName } from './documentNames'
import { useLayouts } from './layouts'

/** What a caller that names its own document brings — the window's answer, an import, a copy. */
type DocumentCreation = {
  title: string
  sourceAssetId?: string
  sourceFidelity?: ReadFidelity
  folder?: string
  kind?: DocumentKind
  path?: string
}

type DocumentsState = {
  documents: Record<string, DocumentDescriptor>
  activeId: string | null
  recent: Partial<Record<WorkspaceId, string>>
  stored: DocumentDescriptor[]
  relist: (after?: 'own-write') => Promise<void>
  refresh: () => Promise<boolean>
  create: (workspace: WorkspaceId, of?: DocumentCreation) => Promise<DocumentDescriptor | null>
  activate: (id: string | null) => void
  adopt: (document: DocumentDescriptor) => void
  rename: (id: string, title: string) => Promise<DocumentNameFailure | null>
  noteSourceFidelity: (id: string, fidelity: ReadFidelity) => void
  retarget: (id: string, sourceAssetId: string, title: string) => void
  close: (id: string) => void
}

export type DocumentsSlice = Pick<DocumentsState, 'documents' | 'activeId'>

/** The slice a reader outside the store needs to answer about the FOLDER as well as the tabs. */
export type DocumentsRead = Pick<DocumentsState, 'documents' | 'stored' | 'activeId'>

export function activeIdOfKind(state: DocumentsSlice, kind: DocumentKind): string | null {
  const id = state.activeId
  return id !== null && state.documents[id]?.kind === kind ? id : null
}

export function documentOfKind(
  state: DocumentsSlice,
  kind: DocumentKind,
): DocumentDescriptor | null {
  const front = state.activeId !== null ? state.documents[state.activeId] : undefined
  if (front?.kind === kind) return front

  return Object.values(state.documents).find(document => document.kind === kind) ?? null
}

export function documentAtPath(
  state: Pick<DocumentsState, 'documents' | 'stored'>,
  path: string,
): DocumentDescriptor | null {
  return (
    state.stored.find(one => one.path === path) ??
    Object.values(state.documents).find(one => one.path === path) ??
    null
  )
}

export function documentById(
  state: Pick<DocumentsState, 'documents' | 'stored'>,
  id: string,
): DocumentDescriptor | null {
  return state.documents[id] ?? state.stored.find(one => one.id === id) ?? null
}

export function documentsOfKind(
  state: Pick<DocumentsState, 'documents' | 'stored'>,
  kind: DocumentKind,
): readonly DocumentDescriptor[] {
  return [
    ...new Map(
      [...state.stored, ...Object.values(state.documents)]
        .filter(one => one.kind === kind)
        .map(one => [one.id, one]),
    ).values(),
  ]
}

export function documentNamedOfKind(
  state: Pick<DocumentsState, 'documents' | 'stored'>,
  kind: DocumentKind,
  title: string,
): string | null {
  return documentsOfKind(state, kind).find(one => one.title === title)?.id ?? null
}

export function sceneDocumentNamed(named: string): string {
  const ref = refFromString(named)
  if (ref?.kind === 'prefab' || ref?.kind === 'document') return ref.id

  return documentNamedOfKind(useDocuments.getState(), 'scene', named) ?? named
}

export function documentForAsset(
  state: Pick<DocumentsState, 'documents' | 'stored'>,
  assetId: string,
  kind?: DocumentKind,
): DocumentDescriptor | null {
  const isIt = (document: DocumentDescriptor): boolean =>
    document.sourceAssetId === assetId && (kind === undefined || document.kind === kind)
  return Object.values(state.documents).find(isIt) ?? state.stored.find(isIt) ?? null
}

/**
 * The scene in front, as a selector. Shared rather than re-declared per panel: a selector built
 * inside a component body is a new identity on every render, and zustand re-subscribes to it.
 */
export const activeSceneId = (state: DocumentsSlice): string | null =>
  activeIdOfKind(state, 'scene')

/** The interface in front, as a selector. Same reason as `activeSceneId`, for its outliner. */
export const activeGuiId = (state: DocumentsSlice): string | null => activeIdOfKind(state, 'gui')

const activeCharacterId = (state: DocumentsSlice): string | null =>
  activeIdOfKind(state, 'character')

/**
 * The model a character tab was opened on, and `null` for any other document.
 *
 * The one way to ask, because three ask: the docks that draw the skeleton and the band from
 * outside the tab, and the ⌘S that patches the container.
 */
export function characterAssetOf(state: DocumentsSlice, documentId: string): string | null {
  const document = state.documents[documentId]
  return document?.kind === 'character' ? (document.sourceAssetId ?? null) : null
}

/** The same, for whichever tab is in front — what a dock reads, having no id of its own. */
export function activeCharacterAssetId(state: DocumentsSlice): string | null {
  const id = activeCharacterId(state)
  return id === null ? null : characterAssetOf(state, id)
}

/** The scene in front, or the workshop of the character in front — what every 3D dock reads. */
export function activeSceneOrWorkshopId(state: DocumentsSlice): string | null {
  const assetId = activeCharacterAssetId(state)
  return activeSceneId(state) ?? (assetId === null ? null : workshopIdOf(assetId))
}

/** The image in front, as a selector. Same reason as `activeSceneId`, for the layer stack. */
export const activeImageId = (state: DocumentsSlice): string | null =>
  activeIdOfKind(state, 'image')

/** The script in front, as a selector — what the code generator rewrites when asked to. */
export const activeScriptId = (state: DocumentsSlice): string | null =>
  activeIdOfKind(state, 'script')

/** The sequence in front, as a selector. Same reason again, for the montage and its inspector. */
export const activeSequenceId = (state: DocumentsSlice): string | null =>
  activeIdOfKind(state, 'sequence')

/**
 * The take in front, as a selector. Same reason again — and it names the SOUND MONTAGE the
 * timeline shows for it, not the waveform in the centre: an audio document carries both.
 */
export const activeAudioId = (state: DocumentsSlice): string | null =>
  activeIdOfKind(state, 'audio')

/**
 * The montage in front, whichever workspace shows it — a sequence in Video, a take's sound half
 * in Audio. Both hold a `SequenceState` in the same store, and a surface that reads only
 * `activeSequenceId` is blind to half of them: the inspector showed nothing at all for a clip
 * picked in the Audio workspace, so gain, speed and fades were editable from nowhere.
 */
export const activeMontageId = (state: DocumentsSlice): string | null =>
  activeSequenceId(state) ?? activeAudioId(state)

/** The sky in front, as a selector. Same reason again, for the skybox panel. */
export const activeSkyboxId = (state: DocumentsSlice): string | null =>
  activeIdOfKind(state, 'skybox')

/** The material in front, as a selector. Same reason again, for the material inspector. */
export const activeMaterialId = (state: DocumentsSlice): string | null =>
  activeIdOfKind(state, 'material')

/**
 * Whether this project holds the document an id names — open in a tab or sitting in the folder.
 *
 * Both halves, because a montage read back may name a scene nobody has opened yet: the listing
 * is the project's answer, the tabs are only what is in front of it right now.
 */
export function documentIsKnown(
  state: Pick<DocumentsState, 'documents' | 'stored'>,
  documentId: string,
): boolean {
  return documentById(state, documentId) !== null
}

export function documentsIn(
  state: Pick<DocumentsState, 'documents'>,
  workspace: WorkspaceId,
): DocumentDescriptor[] {
  return Object.values(state.documents).filter(document => document.workspace === workspace)
}

/**
 * Which tab choosing a section brings forward, or `null` when that section has none open.
 *
 * The remembered one when it is still open, and any of the section's tabs otherwise: `recent`
 * is never cleaned when a tab closes, deliberately — a trail that has to be swept on every
 * close is a second bookkeeping to get wrong, and a stale id is answered here in one read.
 */
export function frontDocumentIn(
  state: Pick<DocumentsState, 'documents' | 'recent'>,
  workspace: WorkspaceId,
): string | null {
  const remembered = state.recent[workspace]
  if (remembered !== undefined && state.documents[remembered]) return remembered

  return documentsIn(state, workspace)[0]?.id ?? null
}

/**
 * The documents the layout still shows.
 *
 * Read off the persisted arrangement rather than off Dockview: the centre is unmounted whenever
 * the home covers it, and asking a torn-down api which panels it holds answers none — which
 * would drop every document the user is about to come back to.
 */
export function panelIds(layout: { panels?: object } | null): Set<string> {
  return new Set(Object.keys(layout?.panels ?? {}))
}

export const useDocuments = createStore<DocumentsState>()((set, get) => ({
  documents: {},
  stored: [],
  activeId: null,
  recent: {},

  activate: id => {
    const state = get()
    if (state.activeId === id) return

    const workspace = id === null ? undefined : state.documents[id]?.workspace
    set({
      activeId: id,
      ...(workspace && id ? { recent: { ...state.recent, [workspace]: id } } : {}),
    })
  },

  relist: async after => {
    if (listing && after !== 'own-write') {
      await listing
      return
    }

    const mine = ++generations.relist
    listing = listed()

    try {
      const found = await listing
      if (mine === generations.relist) set({ stored: sorted(found ?? []) })
    } finally {
      listing = null
    }
  },

  refresh: async () => {
    const mine = ++generations.refresh
    const found = await listed()
    if (mine !== generations.refresh) return false

    const inFolder = found ?? []
    const shown = panelIds(useLayouts.getState().layout)
    const documents = Object.fromEntries(
      inFolder.filter(document => shown.has(document.id)).map(document => [document.id, document]),
    )

    set(state => ({
      documents,
      stored: sorted(inFolder),
      activeId: state.activeId && documents[state.activeId] ? state.activeId : null,
    }))

    return found !== null
  },

  create: async (workspace, of) => {
    const wanted = of?.kind
    const kind =
      wanted && kindsForWorkspace(workspace).includes(wanted) ? wanted : kindForWorkspace(workspace)
    if (!kind) return null

    // Its own listing to name the document itself, the one held where the caller brings a name.
    const stored = of ? get().stored : ((await listed()) ?? [])
    const taken = takenDocumentNames(
      { documents: get().documents, stored },
      of?.folder ?? documentFolderOf(kind),
    )

    const title = titleFor(of, kind, taken)

    const document: DocumentDescriptor = {
      id: newId(),
      kind,
      workspace,
      title,
      path: of?.path ?? documentPathFor(title, kind, of?.folder),
      ...(of?.sourceAssetId ? { sourceAssetId: of.sourceAssetId } : {}),
      ...(of?.sourceFidelity ? { sourceFidelity: of.sourceFidelity } : {}),
    }

    set(state => ({ documents: { ...state.documents, [document.id]: document } }))
    return document
  },

  adopt: document =>
    set(state =>
      state.documents[document.id]
        ? state
        : { documents: { ...state.documents, [document.id]: document } },
    ),

  rename: async (id, title) => {
    const document = documentById(get(), id)
    if (!document) return 'invalid'
    if (!isFiledKind(document.kind)) return 'invalid'

    const taken = takenDocumentNames(
      { documents: {}, stored: get().stored },
      parentOf(document.path) ?? '',
    )
    const refused = checkDocumentName(title, document.kind, taken, id)
    if (refused) return refused

    const bridge = getBridge()
    if (!bridge) return 'invalid'

    let renamed
    try {
      renamed = await bridge.documents.rename(id, document.kind, title)
    } catch (error) {
      return asNameFailure(error)
    }

    if (typeof renamed === 'string') return renamed

    set(state => ({
      documents: state.documents[id] ? { ...state.documents, [id]: renamed } : state.documents,
      stored: state.stored.map(entry => (entry.id === id ? renamed : entry)),
    }))
    return null
  },

  noteSourceFidelity: (id, sourceFidelity) => set(state => amended(state, id, { sourceFidelity })),

  retarget: (id, sourceAssetId, title) =>
    set(state => amended(state, id, { sourceAssetId, title, sourceFidelity: 'faithful' })),

  close: id =>
    set(state => {
      const remaining = { ...state.documents }
      delete remaining[id]
      return { documents: remaining, activeId: state.activeId === id ? null : state.activeId }
    }),
}))

/** A change to one open document, or nothing at all when no tab holds it. */
function amended(
  state: Pick<DocumentsState, 'documents'>,
  id: string,
  change: Partial<DocumentDescriptor>,
): Partial<DocumentsState> {
  const document = state.documents[id]
  if (!document) return {}
  return { documents: { ...state.documents, [id]: { ...document, ...change } } }
}

/** The four refusals travel as the error's message; anything else is not one of them. */
function asNameFailure(error: unknown): DocumentNameFailure {
  return nameFailureOf(error, DOCUMENT_NAME_FAILURES, 'invalid')
}

export function useDocumentIsInFront(documentId: string): boolean {
  return useDocuments(state => state.activeId === documentId)
}

/**
 * Bumped per listing, so one that comes back late cannot install itself — and one PER QUESTION.
 *
 * A shared counter looked harmless and was not: the Explorer relists from a mount effect while
 * `followProject` is still awaiting its own read, and the relist would then make the refresh
 * abandon — leaving every open tab without its descriptor, which is the very reconciliation
 * `refresh` exists for.
 */
const generations = { relist: 0, refresh: 0 }

/** The listing `relist` has in flight, shared by whoever asks while it is still travelling. */
let listing: Promise<DocumentDescriptor[] | null> | null = null

/**
 * 🛑 Never a name landing on the path another document already holds: importing one montage twice
 * stood two tabs on one file, each saving over the other (2026-09-09). Freed and not refused —
 * the name is the studio's own; a name a PERSON typed meets `checkDocumentName` instead.
 * Exempt: an explicit path, and a view of an ASSET, which wears that asset's name homonyms
 * included and is told apart by the link (`copyName` frees a copy's own).
 */
function titleFor(
  of: DocumentCreation | undefined,
  kind: DocumentKind,
  taken: readonly NamedDocument[],
): string {
  const asked = of?.title ?? untitledDocumentName(taken, kind)
  if (of?.path !== undefined || of?.sourceAssetId !== undefined) return asked

  return nextFreeDocumentName(asked, kind, taken)
}

/**
 * Sorted by title rather than by whatever order the folder was read in: a listing that
 * reshuffles between two reads is a list nobody can point at.
 *
 * In the reader's language, and not in the machine's: left bare, `localeCompare` answers in the
 * locale the OS was installed in, so the same project listed two orders on two desks — measured,
 * a Swedish one files `Ärger` past `Zoo`.
 *
 * Through `resolveLanguage` rather than on `i18next.language` raw, and that is not belt and braces:
 * the field is `undefined` until `initI18n` resolves, and it reads `pseudo` whenever the DEV
 * pseudo-locale flag is set. Measured, `new Intl.Collator(undefined)` and `new Intl.Collator
 * ('pseudo')` both resolve to `en-US` — handing the sort straight back to the machine, which is
 * the whole defect this call was fixed for.
 */
function sorted(found: readonly DocumentDescriptor[]): DocumentDescriptor[] {
  const language = resolveLanguage(i18next.language)
  return [...found].sort((left, right) => left.title.localeCompare(right.title, language))
}

/**
 * What the project folder holds, an empty list when no project is open, and `null` when the
 * read itself failed — a folder that went away while it was open.
 *
 * The failure is told apart from the empty answer rather than levelled to it: both leave an
 * empty centre, which is honest, but only the empty answer means a document is not there.
 * Neither is worth a throw nobody is placed to catch.
 */
async function listed(): Promise<DocumentDescriptor[] | null> {
  try {
    return (await getBridge()?.documents.list()) ?? []
  } catch {
    return null
  }
}
