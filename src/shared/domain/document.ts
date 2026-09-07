import { extensionOf } from './fileName'
import { DEFAULT_ROLE_PATHS, type FolderRole } from './folderRole'
import { SCRIPT_EXTENSION } from './game'
import type { OraSurface } from './openRaster'
import { WORKSPACE_IDS, type WorkspaceId } from './workspace'

/**
 * Document registry, shared by both processes: the native menu will need it for
 * "File ▸ New", and duplicating the type would degrade `DocumentKind` to `string`.
 */
export type DocumentKind =
  'image' | 'scene' | 'sequence' | 'audio' | 'skybox' | 'material' | 'script' | 'gui' | 'character'

/** The values beside the type: a file read back off disk has to be checked against them. */
export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  'image',
  'scene',
  'sequence',
  'audio',
  'skybox',
  'material',
  'script',
  'gui',
  'character',
]

/**
 * The kinds with a file in the project — every one but the character, whose tab edits a model of
 * the library. Derived so the day a second kind loses its file, this list follows.
 */
export const FILED_KINDS: readonly FiledKind[] = DOCUMENT_KINDS.filter(
  (kind): kind is FiledKind => kind !== 'character',
)

/**
 * The file a kind writes, or `null` for one that has no file in the project — the character,
 * whose tab edits a model of the library. What a caller holding any kind asks.
 */
export function extensionOfKind(kind: DocumentKind): string | null {
  return isFiledKind(kind) ? EXTENSIONS_BY_KIND[kind] : null
}

export function isFiledKind(kind: DocumentKind): kind is FiledKind {
  return FILED_KINDS.includes(kind as FiledKind)
}

export function isDocumentKind(value: unknown): value is DocumentKind {
  return DOCUMENT_KINDS.some(candidate => candidate === value)
}

export type DocumentDescriptor = {
  /**
   * Never shown. It used to BE the file name, so a folder of documents read as a folder of
   * uuids — and renaming one gave the document a new identity, which is why renaming an open
   * one had to be forbidden. It now lives in the envelope and survives being renamed.
   */
  id: string
  kind: DocumentKind
  title: string
  workspace: WorkspaceId
  /**
   * Where this document was read from, relative to the project folder, extension included —
   * `Repérages/Niveau.gltf`. The same spelling every other path on this boundary uses, `/` on
   * every platform.
   *
   * The whole path and not the entry alone, since a document may sit anywhere in the project:
   * two folders may each hold a `Niveau.gltf`, and a listing joined on the name would hand the
   * explorer one document's descriptor for the other one's row.
   *
   * Carried because the id no longer spells it: whoever joins a folder listing to a document has
   * only the path to go on, and rebuilding it from the title would be a second answer free to
   * disagree with the disk.
   */
  path: string
  /**
   * The asset this document was opened to edit, when it was opened for one.
   *
   * What tells "the image document that is open" from "the document OF this image": a
   * double-click on an asset must come back to its own tab rather than pile a second copy into
   * whichever tab happens to be of the right kind.
   */
  sourceAssetId?: string
}

/** Last of two same paths wins — the path is the tree's id for a row, not the document id. */
export function documentsByPath(
  documents: readonly DocumentDescriptor[],
): Map<string, DocumentDescriptor> {
  return new Map(documents.map(document => [document.path, document]))
}

/**
 * What each space opens, FIRST one first.
 *
 * A list rather than one kind, since the 3D space holds two: a scene and the interfaces a game
 * shows over it. The head of the list is what its New button makes — a second table saying which
 * would be free to disagree with this one.
 */
const KINDS_BY_WORKSPACE: Record<WorkspaceId, readonly DocumentKind[]> = {
  image: ['image'],
  '3d': ['scene', 'gui', 'character'],
  video: ['sequence'],
  audio: ['audio'],
  materials: ['material'],
  skyboxes: ['skybox'],
  code: ['script'],
}

/**
 * Whether a kind can be made out of nothing — what « New » offers.
 *
 * A character cannot: it is a model the library already holds, opened to be rigged, so a blank
 * one would be a tab with no mesh in it. A `Record` so the next kind answers before it compiles.
 */
const MADE_FROM_NOTHING: Record<DocumentKind, boolean> = {
  image: true,
  scene: true,
  sequence: true,
  audio: true,
  skybox: true,
  material: true,
  script: true,
  gui: true,
  character: false,
}

export function isMadeFromNothing(kind: DocumentKind): boolean {
  return MADE_FROM_NOTHING[kind]
}

/**
 * Everything a space opens, in the order it offers them. Exported so `creatable.ts` can derive
 * what the studio can make from this table rather than relist it — the second list would be free
 * to disagree, and it is exactly how `gui` came to be unreachable from every New gesture.
 */
export function kindsForWorkspace(workspace: WorkspaceId): readonly DocumentKind[] {
  return KINDS_BY_WORKSPACE[workspace]
}

/** `null` for a workspace whose editor does not exist yet — the new-document button disables. */
export function kindForWorkspace(workspace: WorkspaceId): DocumentKind | null {
  return KINDS_BY_WORKSPACE[workspace][0] ?? null
}

/**
 * The workspace a document belongs to. Searched rather than tabulated: a second table would be
 * free to disagree with the first, and a document filed under a workspace that does not open it
 * is a tab nothing can render.
 *
 * `null` while a kind exists without an editor — the same half-open state `kindForWorkspace`
 * describes, read the other way round.
 */
export function workspaceForKind(kind: DocumentKind): WorkspaceId | null {
  return WORKSPACE_IDS.find(workspace => KINDS_BY_WORKSPACE[workspace].includes(kind)) ?? null
}

/**
 * 3 since the envelope carries the document's `id` — which is what let the file be named after
 * the document instead of after a uuid. A file written by version 2 is still read: its id is its
 * file name, exactly as it was. Version 1 is still read too, its whole body being one JSON
 * object, content included.
 */
export const DOCUMENT_VERSION = 3

/**
 * The one folder every document used to be filed under, whatever it was.
 *
 * Nothing writes into it any more and nothing is migrated out of it: a project made before the
 * roles keeps its files exactly where they are, and the next save lands beside its own kind. Read
 * for two things only — the path a pre-version-3 file still sits at, and the staging sweep, which
 * has to look where a stopped save may have left a copy.
 */
export const LEGACY_DOCUMENTS_FOLDER = 'documents'

/**
 * The role a document of this kind is filed under when its author names no folder.
 *
 * A `Record` rather than a chain of tests: an eighth kind does not compile until it has answered
 * where it lands, where a fallback would file it under one shelf without a word.
 *
 * Read by the STORE and not by the naming window alone: a caller that supplies a title opens no
 * window at all — the assistant and the MCP wire both do — and a second answer written there
 * would file the same gesture in two folders.
 */
const ROLE_BY_KIND: Record<DocumentKind, FolderRole> = {
  image: 'image',
  scene: 'scenes',
  sequence: 'video',
  audio: 'audio',
  skybox: 'skyboxes',
  material: 'materials',
  script: 'code',
  gui: 'gui',
  // Filed with the models it edits: a character IS one of them, opened to be given a skeleton.
  character: 'models',
}

export function roleForKind(kind: DocumentKind): FolderRole {
  return ROLE_BY_KIND[kind]
}

/** Where a document of this kind STARTS. Where it lands is `ProjectStore.folderFor`, which reads
 * the markers and lays the folder down. */
export function documentFolderOf(kind: DocumentKind): string {
  return DEFAULT_ROLE_PATHS[roleForKind(kind)]
}

export { STUDIO_METADATA_KEY } from './studioMetadata'

export const DOCUMENT_ID_KEY = 'documentId'

export const DOCUMENT_KIND_KEY = 'documentKind'

/**
 * The extension each kind reads and writes. A project folder is meant to be read by eye and
 * repaired by hand, and `a3f1.json` beside `b204.json` says nothing about what either is.
 *
 * No spelling of the studio's own is left: every kind names the open format it belongs in. **Only
 * the two montages have the BYTES to match** — the other four still hold the studio's envelope
 * under an open name, so no other application opens one of them yet.
 *
 * Exported so a test can hold it against `DOCUMENT_KINDS`: the compiler makes this table
 * complete, but nothing makes that list complete, and a kind missing from it would be refused
 * at the IPC boundary without a word.
 */
export type FiledKind = Exclude<DocumentKind, 'character'>

export const EXTENSIONS_BY_KIND: Record<FiledKind, string> = {
  image: '.ora',
  scene: '.gltf',
  sequence: '.otio',
  // The same montage as a sequence, so the same standard file. Which workspace wrote it is read
  // out of the file's own studio metadata — see `documentBody.ts`, the extension cannot say.
  audio: '.otio',
  // Held in the same container as the scene, for the same reason: a sky is an environment, and
  // glTF is what carries one. The file says which of the two it is.
  skybox: '.gltf',
  material: '.mtlx',
  // The one kind whose file the studio does not spell: a script IS its text, so the envelope has
  // no line to sit on. `PLAIN_TEXT` in `documentBody.ts` is the format, and the file NAME is the
  // id — a renamed script is therefore a different document, which is the price of that.
  script: SCRIPT_EXTENSION,
  // A COMPOUND suffix, and the only one: `extensionOf` answers `.json` for it, so anything
  // telling a document by its extension reads `documentExtensionOf` instead.
  gui: '.ui.json',
}

/**
 * The longest document extension this name ends with — `.ui.json` before `.json`.
 *
 * 🛑 `extensionOf` cuts at the LAST dot, so it answers `.json` for `hud.ui.json`: a compound
 * suffix is invisible to it, and every `.json` of the project would read as a document. What
 * tells a document apart therefore asks this, and only this.
 */
export function documentExtensionOf(fileName: string): string {
  const found = COMPOUND_EXTENSIONS.find(extension => fileName.endsWith(extension))
  return found ?? extensionOf(fileName)
}

/**
 * The name without the extension `documentExtensionOf` reads — `hud` for `hud.ui.json`.
 *
 * 🛑 The pair of the above, and it has to be: `stemOf` cuts at the last dot, so it answers
 * `hud.ui`. Paired with the compound extension, a copy came out `hud.ui 2.ui.json`, and a
 * second `hud.ui 2.ui 2.ui.json`.
 */
export function documentStemOf(fileName: string): string {
  const extension = documentExtensionOf(fileName)
  return extension ? fileName.slice(0, -extension.length) : fileName
}

/** Longest first, so `.ui.json` is tried before a plain `.json` ever could be. */
const COMPOUND_EXTENSIONS: readonly string[] = Object.values(EXTENSIONS_BY_KIND)
  .filter(extension => extension.slice(1).includes('.'))
  .sort((one, other) => other.length - one.length)

/**
 * Where a document of this id WOULD live had it never been named — which is where one written
 * before version 3 still lives, its file having been called after its id. Relative: a project
 * folder can be moved.
 *
 * NOT where a document lives in general: it is named after itself now and filed wherever the user
 * put it, so what says where one sits is its descriptor's `path`, read off the walk. This is only
 * the folder a first save falls back to.
 */
export function documentPath(id: string, kind: DocumentKind): string {
  return `${LEGACY_DOCUMENTS_FOLDER}/${id}${extensionOfKind(kind) ?? ''}`
}

/**
 * What a file name says the document is, read the other way round from `EXTENSIONS_BY_KIND`.
 * Listing a project folder needs it: the folder is what says which documents exist, and the
 * extension is all a directory entry carries.
 *
 * `null` for anything else in there — a stray note, an export, a staging copy.
 *
 * **Two pairs share a spelling** — the two montages under `.otio`, the scene and the sky under
 * `.gltf` — so this answers the first of each and the FILE settles it: the format declares
 * `kindFromHead`, and `documentBody.ts` reads which kind out of what the file itself carries.
 *
 * Case-sensitive on purpose: `documentPath` writes the extension in lower case, so a `.IMG`
 * accepted here would be listed under a name that `read` then fails to find on a case-sensitive
 * volume — an empty document, and a second file beside the first at the next save.
 */
export function kindForExtension(extension: string): DocumentKind | null {
  return kindsForExtension(extension)[0] ?? null
}

/**
 * EVERY kind this extension could name — one for most, two where a container serves two editors.
 * What a file's own head is allowed to claim: `.gltf` may say scene or sky, and nothing else.
 *
 * Reading the head is what settles it, and this is what bounds that reading. Trusting the head
 * outright would let an envelope reading `texture` open a `.gltf` in the material editor.
 */
export function kindsForExtension(extension: string): readonly DocumentKind[] {
  return FILED_KINDS.filter(kind => EXTENSIONS_BY_KIND[kind] === extension)
}

/**
 * Whether any kind is held under this extension — the same question without the array, for the
 * one caller that asks it of EVERY file in the project before a single one is opened.
 */
const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set(Object.values(EXTENSIONS_BY_KIND))

export const isDocumentExtension = (extension: string): boolean =>
  DOCUMENT_EXTENSIONS.has(extension)

/**
 * What an editor hands over to be saved. `content` is already serialized, and that is the whole
 * point: the file layer never reads into it, so it never pays for it either. `JSON.parse` of a
 * scene of twenty thousand nodes is synchronous, and the main process owns every window.
 *
 * Every space already serializes to a string — `serializeScene`, `serializeCanvas`,
 * `serializeSequence` — so this is the form they were in anyway.
 *
 * The empty string means a document that holds nothing yet: a tab opened and not typed in.
 */
export type DocumentDraft = {
  title: string
  content: string
  /**
   * Carried into the file so the link survives the tab: a document reopened next session still
   * knows which asset it edits, which is what a save back onto that asset will read.
   */
  sourceAssetId?: string
  /**
   * The surfaces the container holds beside the stack, for a document one string cannot hold.
   * An image keeps one PNG per layer: the pixels live on the GPU, never in the state, so
   * `content` can only name them.
   *
   * `OraSurface.path` becomes an entry the studio writes AND reads back, so it is checked rather
   * than trusted — `isOraSurfacePath`. It is the one field of this contract crossing a security
   * boundary.
   *
   * Absent for every kind that fits in a string, which is all of them but the image.
   */
  parts?: readonly OraSurface[]
}

/** The suffix on a copy being written, before the rename that makes it the document. */
export const STAGING_SUFFIX = '.tmp'

/**
 * A staging copy of OURS, and only ours: `<file>.<uuid>.tmp`. The project folder is the user's
 * own, and a `render.tmp` they left in there is not something to delete on their behalf.
 *
 * Here rather than beside the writer because two readers need it and neither owns the other: the
 * listing sweeps these away, and the folder walk leaves them out of what it offers.
 */
export function isStagingName(name: string): boolean {
  return STAGING_PATTERN.test(name)
}

const STAGING_PATTERN = /\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i

/**
 * What a document weighs on disk: a draft under an envelope the file layer stamps itself. The
 * renderer supplies neither — it owns none of these three, and an `updatedAt` from its clock
 * or a `kind` that disagrees with the file name would both be its word against the folder's.
 *
 * `version` is the file format's, not the document's: it is what lets a project written by an
 * older build be migrated rather than refused.
 *
 * On disk, the envelope is the first line and the content is everything after it:
 *
 * ```
 * {"version":2,"kind":"scene","title":"Level","updatedAt":"2026-08-07T…"}
 * {"nodes":[…]}
 * ```
 *
 * Two lines rather than one object, so that listing a project reads a short head per file
 * instead of parsing every document in it — and a folder still reads by eye.
 */
export type DocumentFile = DocumentDraft & {
  version: number
  kind: DocumentKind
  updatedAt: string
  /**
   * Who this document is, told by the document rather than by where it sits.
   *
   * Optional because a file written before version 3 has none: there, the file name WAS the id,
   * and `descriptorOf` still reads it that way. Stamped by the main process on the next write,
   * which is what lets a document be renamed without becoming a different document — the layout,
   * the recent list and every open tab are keyed by this.
   */
  id?: string
}

/** The envelope alone, which is all a listing needs. */
export type DocumentEnvelope = Omit<DocumentFile, 'content'>

/**
 * The three answers to closing a document that has unsaved work. `cancel` is the safe one, so
 * it is what a dismissed dialog gives back — a tab must never close because a key was struck.
 */
export type CloseChoice = 'save' | 'discard' | 'cancel'

/**
 * What a write did, and the reason it is not a `void`.
 *
 * `stale` says the file changed under the studio since it was last read or written — another
 * application, or a sync service bringing a different copy back. Writing anyway destroys that
 * work without a word: the window asks, and writes again with `force` if the user says so.
 *
 * The freshness is held by the main process rather than stamped in the file, and it cannot be
 * otherwise: a file's modification time is set by the write that finishes it, so no value
 * written INSIDE it can ever match what the filesystem then reports.
 */
export type DocumentWrite = 'written' | 'stale'

/**
 * How much of a file the envelope may take. It holds a capped title and three short fields; a
 * head longer than this is not one, and reading further would be reading the document itself.
 */
export const ENVELOPE_LIMIT = 8 * 1024
