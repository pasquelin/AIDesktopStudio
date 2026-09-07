import { lstat, mkdir, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import type { Asset } from '@shared/domain/asset'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { ExternalFileImport, ExternalFileRefusal } from '@shared/domain/externalFile'
import { filingFolderOf, filingRoleOf, filingTypeOf } from '@shared/domain/filingType'
import { foldForFileName } from '@shared/domain/fileName'
import { isHiddenEntry, pathIn } from '@shared/domain/folder'
import type { FolderRole, RoleFolders } from '@shared/domain/folderRole'
import {
  IMPORTABLE_BUNDLE_EXTENSIONS,
  IMPORTABLE_DOCUMENT_EXTENSIONS,
  isImportableFile,
  importableAssetTypeOf,
} from '@shared/domain/importFormat'
import { SOURCES_FOLDER } from '@shared/domain/meshImport'
import type { MontageImportResult } from '@shared/ipc'
import { orElse } from '@shared/promises'
import type { TaskWatch } from '@shared/domain/taskProgress'
import { pathIsInside } from '@main/export/pathIsInside'
import { freeName } from '@main/project/filePlan'
import { folderInsideProject } from '@main/project/folderInsideProject'
import { pathSegment } from '@main/validation'
import { copyExternalFile, removeExternalCopy, removeExternalFolder } from './copyExternalFile'
import { referencesOf } from './importedReferences'

export type ImportFilesDeps = {
  projectPath: () => string
  names: (folder: string) => Promise<readonly string[] | null>
  adopt: (relative: string) => Promise<Asset | null>
  documents: () => Promise<readonly DocumentDescriptor[]>
  importBundle: (
    source: string,
    root: string,
    folder: string,
    watch: TaskWatch,
  ) => Promise<MontageImportResult | null>
  roles?: () => RoleFolders
  /** The write door for a role — marked folder, never a drawing snapshot + mkdir. */
  folderFor?: (role: FolderRole) => Promise<string>
}

type ImportState = {
  takenByFolder: Map<string, Set<string>>
  assets: Asset[]
  montages: MontageImportResult[]
  refusedBundles: ExternalFileRefusal[]
  documentPaths: Map<string, string>
  /** The folder a document with siblings owns, which a refusal removes instead of the file. */
  documentFolders: Map<string, string>
  failed: string[]
}

const importFolder = (root: string, folder: string): Promise<string | null> =>
  folder === '' ? orElse(realpath(root), null) : folderInsideProject(root, folder)

async function collectImportableFiles(
  paths: readonly string[],
  failed: string[],
): Promise<string[]> {
  const files: string[] = []
  for (const path of paths) {
    const found = await orElse(lstat(path), null)
    if (found?.isSymbolicLink()) {
      failed.push(basename(path))
      continue
    }
    if (!found) {
      if (isImportableFile(path)) files.push(path)
      else failed.push(basename(path))
      continue
    }
    if (found.isDirectory()) {
      const inside = await filesInTree(path)
      if (inside.files.length === 0) failed.push(basename(path))
      files.push(...inside.files)
      failed.push(...inside.skipped)
      continue
    }
    if (found.isFile() && isImportableFile(path)) {
      files.push(path)
      continue
    }
    failed.push(basename(path))
  }
  return files
}

async function filesInTree(root: string): Promise<{ files: string[]; skipped: string[] }> {
  const files: string[] = []
  const skipped: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (!dir) break
    const entries = await orElse(readdir(dir, { withFileTypes: true }), [])
    for (const entry of entries) {
      if (isHiddenEntry(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        skipped.push(entry.name)
        continue
      }
      if (entry.isDirectory()) stack.push(path)
      else if (entry.isFile() && isImportableFile(path)) files.push(path)
      else if (entry.isFile()) skipped.push(entry.name)
    }
  }
  return { files, skipped }
}

async function readyDestination(
  root: string,
  folder: string,
  deps: ImportFilesDeps,
  state: ImportState,
): Promise<{ target: string; taken: Set<string> } | null> {
  if (folder !== '') await mkdir(join(root, folder), { recursive: true })
  const target = await importFolder(root, folder)
  if (!target) return null

  const held = state.takenByFolder.get(folder)
  if (held) return { target, taken: held }

  const names = await deps.names(folder)
  if (names === null) return null
  const taken = new Set(names.map(foldForFileName))
  state.takenByFolder.set(folder, taken)
  return { target, taken }
}

async function importSource(
  source: string,
  root: string,
  folder: string,
  target: string,
  taken: Set<string>,
  roles: RoleFolders,
  watch: TaskWatch,
  deps: ImportFilesDeps,
  state: ImportState,
): Promise<void> {
  if (!isAbsolute(source) || !isImportableFile(source)) return
  const extension = extname(source).slice(1).toLowerCase()
  if (IMPORTABLE_BUNDLE_EXTENSIONS.includes(extension)) {
    return importBundle(source, root, folder, extension, watch, deps, state)
  }
  await importAssetOrDocument(source, target, folder, taken, extension, roles, watch, deps, state)
}

async function importBundle(
  source: string,
  root: string,
  folder: string,
  extension: string,
  watch: TaskWatch,
  deps: ImportFilesDeps,
  state: ImportState,
): Promise<void> {
  const montage = await deps.importBundle(source, root, folder, watch)
  if (montage) state.montages.push(montage)
  else if (!watch.signal?.aborted) state.refusedBundles.push({ name: basename(source), extension })
}

/** Where a copy lands, and whether it brought a folder of its own with it. */
type Landing = {
  nest: string
  into: string
  relative: string
  destination: string
  bound: string
}

/** A nest is a created folder name: `extname('...gltf')` yields stem `..`, which would climb. */
function nestName(stem: string, taken: Set<string>): string {
  return freeName(taken, pathSegment.safeParse(stem).success ? stem : 'document')
}

function nestedSourceName(canonicalName: string, stem: string, nest: string): string {
  const collision = pathSegment.safeParse(stem).success && nest !== stem
  return collision ? `${nest}${extname(canonicalName)}` : canonicalName
}

/**
 * A document that points at siblings takes a folder of its own: its references keep the spelling
 * the file holds, so nothing rewrites it and no neighbour collides with what the project has.
 */
function landingFor(
  canonicalName: string,
  stem: string,
  nested: boolean,
  target: string,
  folder: string,
  taken: Set<string>,
): Landing {
  let nest = nested ? nestName(stem, taken) : ''
  let into = nest === '' ? target : join(target, nest)
  if (nest !== '' && !pathIsInside(target, into)) {
    nest = nestName('document', taken)
    into = join(target, nest)
  }
  const name =
    nest === '' ? freeName(taken, canonicalName) : nestedSourceName(canonicalName, stem, nest)
  taken.add(foldForFileName(nest === '' ? name : nest))
  return {
    nest,
    into,
    relative: pathIn(folder, nest === '' ? name : `${nest}/${name}`),
    destination: join(into, name),
    bound: target,
  }
}

/**
 * The file a reference names, or `null` for anything that is not the source's own neighbour.
 *
 * `followable` refuses the SPELLING — a scheme, an absolute path, a climb — and a symbolic link
 * spells nothing suspicious while walking straight out, so both ends go through `realpath`.
 */
async function neighbourAt(from: string, reference: string): Promise<string | null> {
  const resolved = await orElse(realpath(resolve(from, reference)), null)
  return resolved !== null && pathIsInside(from, resolved) ? resolved : null
}

/** Documents keep neighbours beside them; models keep them under `.sources`, outside the catalogue. */
type NeighbourKeeping = 'beside' | 'sources'

/** Copies a neighbour and adopts it only when a document needs catalogue relinking. */
async function copyOneNeighbour(
  from: string,
  reference: string,
  landing: Landing,
  under: string,
  folder: string,
  keeping: NeighbourKeeping,
  watch: TaskWatch,
  deps: ImportFilesDeps,
  state: ImportState,
): Promise<void> {
  const neighbour = await neighbourAt(from, reference)
  if (neighbour === null) {
    state.failed.push(basename(reference))
    return
  }
  const destination = resolve(under, reference)
  if (!pathIsInside(landing.into, destination)) {
    state.failed.push(basename(reference))
    return
  }
  await mkdir(dirname(destination), { recursive: true })
  const copied = await orElse(
    copyExternalFile(neighbour, destination, watch, { follow: false }),
    false,
  )
  if (!copied) {
    state.failed.push(basename(reference))
    return
  }
  if (keeping === 'sources' || !importableAssetTypeOf(reference)) return
  const asset = await deps.adopt(pathIn(folder, `${landing.nest}/${reference}`))
  if (asset) state.assets.push(asset)
}

async function copyNeighbours(
  source: string,
  references: readonly string[],
  landing: Landing,
  folder: string,
  keeping: NeighbourKeeping,
  watch: TaskWatch,
  deps: ImportFilesDeps,
  state: ImportState,
): Promise<void> {
  const from = await orElse(realpath(dirname(source)), null)
  if (from === null) return
  const under = keeping === 'beside' ? landing.into : join(landing.into, SOURCES_FOLDER)
  for (const reference of references) {
    if (watch.signal?.aborted) return
    await copyOneNeighbour(from, reference, landing, under, folder, keeping, watch, deps, state)
  }
}

/** What a copy that landed becomes: a document to be listed, or a row of the catalogue. */
async function landed(
  source: string,
  references: readonly string[],
  landing: Landing,
  folder: string,
  isDocument: boolean,
  watch: TaskWatch,
  deps: ImportFilesDeps,
  state: ImportState,
): Promise<void> {
  if (!isDocument) {
    // Neighbours BEFORE the row: a cancelled import then leaves no half-dressed model behind.
    if (landing.nest !== '') {
      await copyNeighbours(source, references, landing, folder, 'sources', watch, deps, state)
      if (watch.signal?.aborted) return await removeExternalFolder(landing.into, landing.bound)
    }
    const asset = await deps.adopt(landing.relative)
    if (asset) state.assets.push(asset)
    return
  }
  if (landing.nest !== '') {
    state.documentFolders.set(landing.relative, pathIn(folder, landing.nest))
    await copyNeighbours(source, references, landing, folder, 'beside', watch, deps, state)
    // A cancelled import leaves nothing half-written: neighbours stop where they are, so the
    // folder goes with them rather than being listed as a document missing most of its parts.
    if (watch.signal?.aborted) {
      state.documentFolders.delete(landing.relative)
      return await removeExternalFolder(landing.into, landing.bound)
    }
  }
  // The name the user DROPPED, not the free one its copy took: both notices this feeds —
  // refused and failed — name a file that is no longer on disk under either.
  state.documentPaths.set(landing.relative, basename(source))
}

async function placeCopy(source: string, landing: Landing, watch: TaskWatch): Promise<boolean> {
  if (landing.nest !== '') await mkdir(landing.into, { recursive: true })
  if (await copyExternalFile(source, landing.destination, watch)) return true
  if (landing.nest !== '') await removeExternalFolder(landing.into, landing.bound)
  return false
}

function gathersNeighbours(isDocument: boolean, sourceName: string, extension: string): boolean {
  if (isDocument || extension === 'gltf') return true
  const kind = importableAssetTypeOf(sourceName)
  return kind === 'mesh' || kind === 'animation'
}

async function landOrUndo(
  source: string,
  references: readonly string[],
  landing: Landing,
  folder: string,
  isDocument: boolean,
  watch: TaskWatch,
  deps: ImportFilesDeps,
  state: ImportState,
): Promise<void> {
  try {
    await landed(source, references, landing, folder, isDocument, watch, deps, state)
  } catch (error) {
    if (landing.nest === '') await removeExternalCopy(landing.destination)
    else await removeExternalFolder(landing.into, landing.bound)
    throw error
  }
}

async function importAssetOrDocument(
  source: string,
  target: string,
  folder: string,
  taken: Set<string>,
  extension: string,
  roles: RoleFolders,
  watch: TaskWatch,
  deps: ImportFilesDeps,
  state: ImportState,
): Promise<void> {
  const sourceName = basename(source)
  const stem = sourceName.slice(0, -extname(sourceName).length)
  const isDocument =
    IMPORTABLE_DOCUMENT_EXTENSIONS.includes(extension) &&
    filingTypeOf(sourceName, folder, roles) !== 'animation'
  const references = gathersNeighbours(isDocument, sourceName, extension)
    ? await referencesOf(source, extension)
    : []
  const landing = landingFor(
    isDocument ? `${stem}.${extension}` : sourceName,
    stem,
    references.length > 0,
    target,
    folder,
    taken,
  )
  if (!(await placeCopy(source, landing, watch))) return
  await landOrUndo(source, references, landing, folder, isDocument, watch, deps, state)
}

const removeImported = async (
  root: string,
  relative: string,
  state: ImportState,
): Promise<void> => {
  const held = state.documentFolders.get(relative)
  if (held !== undefined) return await removeExternalFolder(join(root, held), root)
  await removeExternalCopy(join(root, relative))
}

async function importedDocuments(state: ImportState, deps: ImportFilesDeps, root: string) {
  try {
    const listed = state.documentPaths.size > 0 ? await deps.documents() : []
    const documents = listed.filter(document => state.documentPaths.has(document.path))
    const accepted = new Set(documents.map(document => document.path))
    const refused = [...state.documentPaths]
      .filter(([relative]) => !accepted.has(relative))
      .map(([relative, name]) => ({ relative, name }))
    for (const file of refused) await removeImported(root, file.relative, state)
    return { documents, refused }
  } catch {
    for (const [relative] of state.documentPaths) await removeImported(root, relative, state)
    state.failed.push(...state.documentPaths.values())
    return { documents: [], refused: [] }
  }
}

export async function importFiles(
  sources: readonly string[],
  folder: string,
  deps: ImportFilesDeps,
  watch: TaskWatch = {},
): Promise<ExternalFileImport> {
  const root = deps.projectPath()
  const roles = deps.roles?.() ?? {}
  const state: ImportState = {
    takenByFolder: new Map(),
    assets: [],
    montages: [],
    refusedBundles: [],
    documentPaths: new Map(),
    documentFolders: new Map(),
    failed: [],
  }
  const files = await collectImportableFiles(sources, state.failed)

  for (const source of files) {
    if (watch.signal?.aborted) break
    const dest =
      folder !== ''
        ? folder
        : deps.folderFor
          ? await deps.folderFor(filingRoleOf(basename(source), roles))
          : filingFolderOf(basename(source), roles)
    try {
      const ready = await readyDestination(root, dest, deps, state)
      if (!ready) {
        state.failed.push(basename(source))
        continue
      }
      await importSource(source, root, dest, ready.target, ready.taken, roles, watch, deps, state)
    } catch {
      if (!watch.signal?.aborted) state.failed.push(basename(source))
    }
  }
  const { documents, refused } = await importedDocuments(state, deps, root)
  return {
    assets: state.assets,
    documents,
    montages: state.montages,
    refused: [
      ...refused.map(file => ({
        name: file.name,
        extension: extname(file.name).slice(1).toLowerCase(),
      })),
      ...state.refusedBundles,
    ],
    failed: state.failed,
  }
}
