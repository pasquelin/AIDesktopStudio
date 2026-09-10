import { isAbsolute } from 'node:path'
import { z } from 'zod'
import {
  ASSET_PATHS_MAX,
  ASSET_SEARCH_LIMIT_MAX,
  ASSET_TYPES,
  isAssetType,
  isSyncStatus,
  type AssetQuery,
  type AssetType,
  type SyncStatus,
} from '@shared/domain/asset'
import {
  DOCUMENT_VERSION,
  isDocumentKind,
  type DocumentDraft,
  type DocumentEnvelope,
  type DocumentKind,
} from '@shared/domain/document'
import { isReadFidelity, type ReadFidelity } from '@shared/domain/readFidelity'
import { isPrivatePath } from '@shared/domain/folder'
import { isFolderRole, type FolderRole } from '@shared/domain/folderRole'
import { isOraSurfacePath, type OraStack } from '@shared/domain/openRaster'
import { isPbrChannel, type PbrChannel } from '@shared/domain/material'
import { MESH_IMPORT_LOSSES } from '@shared/domain/meshImport'
import type {
  SaveAudioRequest,
  SaveAnimationRequest,
  SaveLayeredRequest,
  SaveMeshRequest,
  ConvertMeshRequest,
  SavePictureRequest,
  SavePlayerModuleRequest,
  SaveTextureRequest,
} from '@shared/ipc'
import { assetId } from '@main/assets/validation'
import { isPngBytes } from '@main/media/png'
import { pathSegment, withinCodePoints } from '@main/validation'
import { base64Payload } from '@main/provider/validation'

export {
  parseContextCards,
  parseGame,
  parseManifest,
  parseProjectContext,
} from './manifestValidation'

// Absolute paths only, and enforced rather than merely intended: a relative one would resolve
// against the main process's working directory, which is wherever Electron happened to be
// launched from — so `project:open('..')` would reach a folder nobody chose.
const projectPath = z.string().trim().min(1).refine(isAbsolute)

export function parseProjectPath(value: unknown): string {
  return projectPath.parse(value)
}

export function parseProjectName(value: unknown): string {
  return pathSegment.parse(value)
}

/** A role a window may ask the folder of — refused rather than trusted, it crosses the frontier. */
export function parseFolderRole(value: unknown): FolderRole {
  if (!isFolderRole(value)) throw new Error('invalid-folder-role')
  return value
}

// In code points, and generous rather than exact: `mkdirSync` takes an absolute path of 1 023
// BYTES on APFS and refuses at 1 024 — swept a byte at a time, with segments under `NAME_MAX` —
// so nothing a relative path this long names is a folder the disk would hold.
const withinPathBound = withinCodePoints(1024)

/**
 * A path inside the project, as the explorer asks for it: `''` for the root, then segments joined
 * by `/`. Bounded, never absolute, never climbing, and never through a backslash — Windows takes
 * that as a separator, so `..\..` would walk out through a check that only looked at `/`.
 *
 * 🛑 The drive letter is spelt OUT rather than left to `isAbsolute`, which answers for the system
 * it RUNS on: `C:/Users/x` reads as relative on macOS and on the Linux runner alike.
 *
 * A control character is deliberately NOT refused, unlike `pathSegment`: that one names what gets
 * CREATED, this one names what already exists. APFS holds such a name and `folder.list` hands it
 * straight back, so refusing here would lose a folder the disk really has.
 */
export function isProjectRelativeFolder(value: string): boolean {
  return (
    withinPathBound(value) &&
    !isAbsolute(value) &&
    !/^[A-Za-z]:/.test(value) &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    value.split('/').every(segment => segment !== '.' && segment !== '..')
  )
}

// One `refine`, and short-circuited, because zod runs every check after a failed one: a bound of
// its own would still let a 5 MB string be split, two thousand at a time via `folderPaths`.
const folderPath = z.string().refine(isProjectRelativeFolder)

export function parseFolderPath(value: unknown): string {
  return folderPath.parse(value)
}

/**
 * A batch of paths, each held to exactly the rule above.
 *
 * Bounded, like every list this side takes from a window: what a hand selects in a tree is
 * hundreds at the outside, and the writes run one after another in the process that owns every
 * window. `min(1)` because a batch of nothing is a caller that has lost track of its selection,
 * not a gesture that does nothing.
 */
const folderPaths = z.array(folderPath).min(1).max(2000)

export function parseFolderPaths(value: unknown): string[] {
  return folderPaths.parse(value)
}

/**
 * What a search box holds. Bounded like every string this side takes from a window — a term
 * longer than a file name can be matches nothing, and walking the whole folder to prove it is
 * work the process that owns every window would pay for.
 */
const searchTerm = z.string().max(200)

export function parseSearchTerm(value: unknown): string {
  return searchTerm.parse(value)
}

/** Whether a reader asked to see the studio's own bookkeeping. Read, never written to. */
export function parseHiddenShown(value: unknown): boolean {
  return z.boolean().parse(value)
}

// `z.custom` rather than `z.enum`: the values live in `shared/domain/asset.ts`, and zod's enum
// wants a literal tuple, which the project's ban on `as const` rules out.
const assetQuery = z.object({
  type: z.custom<AssetType>(isAssetType).optional(),
  // What a workspace asks for. Bounded by the number of kinds there are: a longer list is a
  // caller that has lost track of what it wants.
  types: z.array(z.custom<AssetType>(isAssetType)).max(ASSET_TYPES.length).optional(),
  tags: z.array(z.string().min(1)).max(32).optional(),
  text: z.string().max(200).optional(),
  // The same shape the explorer's own channel is held to: it is the surface that asks this.
  path: folderPath.optional(),
  // A whole listing at once, one placeholder each in the statement built from it. The bound is
  // shared with the caller, which cuts its question into batches of it — read on one side only,
  // a project past it lost every answer rather than one batch.
  paths: z.array(folderPath).max(ASSET_PATHS_MAX).optional(),
  // Absent here, `z.object` STRIPS it and the query reaching SQL is unfiltered: reading back a
  // generation's output answered with the first rows of the whole catalogue.
  ids: z.array(assetId).max(ASSET_PATHS_MAX).optional(),
  // Which of a page of library assets this project already holds. Held to the same bound and
  // stripped for the same reason as `ids` just above — the ids are the API's, not this side's,
  // so they go through the plain string rule rather than through `assetId`.
  remoteAssetIds: z.array(z.string().trim().min(1).max(200)).max(ASSET_PATHS_MAX).optional(),
  location: z.enum(['local', 'cloud']).optional(),
  syncStatus: z.custom<SyncStatus>(isSyncStatus).optional(),
  groupId: z.string().trim().min(1).optional(),
  derivedFrom: assetId.optional(),
  generated: z.literal(true).optional(),
  // Bounded here rather than in SQL: the renderer chooses the page size, and an unbounded
  // one would pull an entire well-stocked project across the IPC boundary in one message.
  limit: z.number().int().min(1).max(ASSET_SEARCH_LIMIT_MAX).optional(),
  offset: z.number().int().min(0).optional(),
})

export function parseAssetQuery(value: unknown): AssetQuery {
  return assetQuery.parse(value)
}

// An edited take crosses the boundary as bytes. Bounded rather than trusted: the renderer is
// the sandboxed side, and an unbounded buffer written to disk is a full partition away.
const MAX_AUDIO_BYTES = 512 * 1024 * 1024

const saveAudio = z.object({
  replaces: assetId.optional(),
  name: z.string().trim().min(1).max(200),
  derivedFrom: assetId.optional(),
  wav: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= MAX_AUDIO_BYTES),
})

export function parseSaveAudio(value: unknown): SaveAudioRequest {
  return saveAudio.parse(value)
}

// A derived channel is at most the size of what it was derived from, and 8K RGBA encodes well
// under this. Bounded for the same reason a take is: the renderer is the sandboxed side.
const MAX_PICTURE_BYTES = 256 * 1024 * 1024

const saveTexture = z.object({
  name: z.string().trim().min(1).max(200),
  map: z.custom<PbrChannel>(isPbrChannel),
  derivedFrom: assetId.optional(),
  // Checked, not merely bounded: an encoder that answered with nothing would otherwise be
  // catalogued as a channel, and the tile would show an empty frame for a file that is not a
  // picture — with no way, from there, to read why.
  png: z
    .instanceof(Uint8Array)
    .refine(bytes => bytes.byteLength <= MAX_PICTURE_BYTES)
    .refine(isPngBytes),
})

export function parseSaveTexture(value: unknown): SaveTextureRequest {
  return saveTexture.parse(value)
}

/**
 * Base64 grows by four bytes for every three, so the same ceiling as a channel's bytes is this
 * much text. Bounded before it is decoded: the decoding is what would allocate.
 */
const MAX_PICTURE_BASE64 = Math.ceil((MAX_PICTURE_BYTES * 4) / 3)

const savePicture = z.object({
  replaces: assetId.optional(),
  name: z.string().trim().min(1).max(200),
  derivedFrom: assetId.optional(),
  // The same rule the export applies, for the same reason: a `data:image/png;base64,` prefix
  // reaching the file would be written as part of the picture. That the payload really decodes
  // to a PNG is checked once, by the handler, on the bytes it decodes anyway.
  png: z.string().max(MAX_PICTURE_BASE64).pipe(base64Payload),
})

export function parseSavePicture(value: unknown): SavePictureRequest {
  return savePicture.parse(value)
}

/**
 * The studio's own canvas state, as text. Generous: it holds the whole layer tree, every text
 * layer's string and every adjustment's parameters, for a document that may have hundreds of
 * layers — and refusing it would lose the half of the document the standard cannot carry.
 */
const MAX_STUDIO_STATE = 64 * 1024 * 1024

/** The studio state's ceiling rather than a picture's: a mesh swapped in for the stand-in grows one. */
const savePlayerModule = z.object({
  name: z.string().trim().min(1).max(200),
  derivedFrom: assetId.optional(),
  gltf: z.string().min(1).max(MAX_STUDIO_STATE),
})

export function parseSavePlayerModule(value: unknown): SavePlayerModuleRequest {
  return savePlayerModule.parse(value)
}

const oraBase = {
  name: z.string().max(200),
  x: z.number(),
  y: z.number(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  composite: z.string().max(64),
}

/** One flat entry under `data/`, or the flatten's own name — `isOraSurfacePath` is the rule. */
const oraPath = z.string().max(300).refine(isOraSurfacePath)

const oraLayer = z.object({
  ...oraBase,
  kind: z.literal('layer'),
  src: oraPath,
})

/**
 * Depth-bounded on purpose: `z.lazy` would accept a nesting deep enough to blow the stack when
 * the writer walks it, and no picture has eight levels of groups.
 */
const oraNode = (depth: number): z.ZodType<unknown> =>
  depth === 0
    ? oraLayer
    : z.union([
        oraLayer,
        z.object({
          ...oraBase,
          kind: z.literal('group'),
          isolation: z.enum(['auto', 'isolate']),
          children: z.array(oraNode(depth - 1)).max(500),
        }),
      ])

const oraStack = z.object({
  // Non-negative rather than positive, and that is not laxity: a container written elsewhere may
  // carry no `w`/`h` on its `<image>`, which the unpacker reads as zero. Refusing that HERE — on
  // the way out — makes the document unsaveable for good, the value having come from the read.
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  nodes: z.array(oraNode(8)).max(2000),
  studio: z.string().max(MAX_STUDIO_STATE),
})

/**
 * A stack on its way into a container. Called on the CONTENT of an image document, which the
 * renderer wrote and the file layer is about to turn into `stack.xml` and a list of ZIP entries.
 */
export function parseOraStack(value: unknown): OraStack {
  // The shape is checked field by field above; the cast names what zod has just proved, the
  // recursive `nodes` being typed as `unknown` by the depth-bounded builder.
  return oraStack.parse(value) as OraStack
}

/**
 * One surface, on its way into a container.
 *
 * `png` is a `Uint8Array` and never base64: a 4K stack of ten layers is hundreds of megabytes of
 * text otherwise. Its ceiling is the picture ceiling, applied to the bytes themselves.
 */
export const oraSurface = z.object({
  path: oraPath,
  png: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= MAX_PICTURE_BYTES),
})

/**
 * A character's own container. Bounded like a take is, and for the same reason: the renderer is
 * the sandboxed side, and a model of a million triangles with its maps inside runs to hundreds
 * of megabytes.
 */
export const MAX_MESH_BYTES = 1024 * 1024 * 1024

const saveMesh = z.object({
  // Required, unlike every neighbour: ⌘S rewrites the file the window opened, in place.
  replaces: assetId,
  glb: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= MAX_MESH_BYTES),
})

export function parseSaveMesh(value: unknown): SaveMeshRequest {
  return saveMesh.parse(value)
}

const saveConverted = z.object({
  replaces: assetId,
  projectPath,
  glb: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= MAX_MESH_BYTES),
  type: z.enum(['mesh', 'animation']),
  losses: z.array(z.enum(MESH_IMPORT_LOSSES)).max(MESH_IMPORT_LOSSES.length),
})

export function parseSaveConverted(value: unknown): ConvertMeshRequest {
  return saveConverted.parse(value)
}

const saveAnimation = z.object({
  name: z.string().trim().min(1).max(200),
  derivedFrom: assetId.optional(),
  replaces: assetId.optional(),
  glb: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= MAX_MESH_BYTES),
})

export function parseSaveAnimation(value: unknown): SaveAnimationRequest {
  return saveAnimation.parse(value)
}

const saveLayered = z.object({
  replaces: assetId.optional(),
  name: z.string().trim().min(1).max(200),
  derivedFrom: assetId.optional(),
  document: z.object({
    stack: oraStack,
    surfaces: z.array(oraSurface).max(2048),
  }),
})

export function parseSaveLayered(value: unknown): SaveLayeredRequest {
  // Cast for the reason `parseOraStack` gives — the recursive nodes are typed `unknown`.
  return saveLayered.parse(value) as SaveLayeredRequest
}

export function parseDocumentId(value: unknown): string {
  return pathSegment.parse(value)
}

const documentKind = z.custom<DocumentKind>(isDocumentKind)

export function parseDocumentKind(value: unknown): DocumentKind {
  return documentKind.parse(value)
}

const forceWrite = z.boolean().optional()

/** Absent reads as no: a payload that lost this field must not read as consent to overwrite. */
export function parseForceWrite(value: unknown): boolean {
  return forceWrite.parse(value) ?? false
}

/**
 * The studio's own folders are refused on top of the shape, which no other path channel needs
 * to say: the field offering these never lists a hidden folder, so nothing a user can click
 * reaches here — and a document written into `.index/` would be swept by the next rescan.
 */
const landingFolder = folderPath.refine(path => !isPrivatePath(path)).optional()

/**
 * Where a first save lands, held to the same rule as every other path a window names — absent
 * for a caller that has none to offer, which leaves the writer its own default.
 */
export function parseLandingFolder(value: unknown): string | undefined {
  return landingFolder.parse(value)
}

export const documentTitle = z.string().max(200)

/*
 * Never inspected, and now never parsed either: what a kind stores is its editor's business,
 * and it crosses this boundary as the string that editor serialized.
 *
 * Bounded all the same. The renderer is the sandboxed side, and a document is written to the
 * user's disk: an unbounded string is a full partition away.
 */
const MAX_CONTENT_BYTES = 256 * 1024 * 1024

export const documentContent = z.string().max(MAX_CONTENT_BYTES)

const documentDraft = z.object({
  // Trimmed and non-empty, where the envelope's twin is not: a title is now the NAME OF THE
  // FILE, and a document nobody named is a document nothing can be written to.
  title: z.string().trim().min(1).max(200),
  content: documentContent,
  // The surfaces of an image document's container. Declared or the schema STRIPS them in
  // silence, and a save then writes a stack with no pixels under it — the very loss this whole
  // field exists to prevent, and one that has already been paid for once.
  parts: z.array(oraSurface).max(2048).optional(),
  // The asset this document edits. Same reason as `parts`: a field the schema does not name is
  // a field the renderer writes and the disk never sees.
  sourceAssetId: assetId.optional(),
  // How faithfully that asset was read. Declared for the same reason as `parts` and
  // `sourceAssetId` above: a field the schema does not name is stripped in silence, and a
  // document reopened next session would regain the right to overwrite a file read reduced.
  sourceFidelity: z.custom<ReadFidelity>(isReadFidelity).optional(),
})

/** A title on its way into a dialog. Capped like the one a draft carries, and for the same reason. */
export function parseDocumentTitle(value: unknown): string {
  return documentTitle.parse(value)
}

/**
 * A project's name on its way in, at creation as at rename — and a project is named by its
 * FOLDER, so this name becomes a path segment. What it may not hold is `isSafeFileName`'s to
 * refuse; this bounds it.
 *
 * Trimmed and non-empty: a nameless project is a row nobody can find, and it is also how the root
 * of a volume is turned away — its basename is the empty string. Capped like every other string
 * crossing this boundary — the renderer is the sandboxed side, and this one is written to disk.
 */
const projectTitle = z.string().trim().min(1).max(200)

export function parseProjectTitle(value: unknown): string {
  return projectTitle.parse(value)
}

export function parseDocumentDraft(value: unknown): DocumentDraft {
  return documentDraft.parse(value)
}

const documentEnvelope = z.object({
  // Capped, not merely floored: a file written by a later build must be refused rather than
  // read as if it were this one and silently flattened by the next save.
  version: z.number().int().min(1).max(DOCUMENT_VERSION),
  kind: documentKind,
  // Left permissive where a draft's is not, and the asymmetry is deliberate: this is the READ
  // side. Refusing an empty title here would drop the document from the listing altogether —
  // present on disk, absent from every list — where `descriptorOf` instead falls back on the
  // file name. What may be WRITTEN is where the rule belongs.
  title: documentTitle,
  updatedAt: z.string().min(1),
  // Absent on every document written before assets could be opened, and on every document that
  // edits none — so an absent field means "not linked" rather than a file to migrate. Unbounded
  // where the draft above bounds it: this reads a file that EXISTS, and a bound would refuse it.
  sourceAssetId: z.string().min(1).optional(),
  // Absent on every document written before the read fidelity was carried — and absent reads as
  // `unknown`, which refuses to overwrite rather than assuming the read was whole.
  sourceFidelity: z.custom<ReadFidelity>(isReadFidelity).optional(),
  // Absent before version 3, where the file name was the id. Declared here or zod STRIPS it and
  // the field is written by the main process and never seen again — the very defect the comment
  // on `parts` records, which cost a save its pixels.
  id: z.string().min(1).optional(),
})

/** A document file is user territory, like the manifest: hand-edited, truncated, or older. */
export function parseDocumentEnvelope(value: unknown): DocumentEnvelope {
  return documentEnvelope.parse(value)
}
