import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { orElse } from '@shared/promises'
import type { Asset } from '@shared/domain/asset'
import { documentPath, type DocumentKind } from '@shared/domain/document'
import type { GatherReport, GatheredFile } from '@shared/domain/gather'
import { CATALOG_FILE, MANIFEST_FILE } from '@shared/domain/project'
import type { AsyncCatalog } from './catalogClient'

export type GatherDeps = {
  /** Where the OPEN project sits, which is what every relative path below is against. */
  projectPath: () => string | null
  citedBy: (documentId: string, kind: DocumentKind) => Promise<Asset[]>
  exists: (file: string) => boolean
  /** `null` for a file that could not be read — the same answer the ingest's own hash gives. */
  hash: (file: string) => Promise<string | null>
  /** The destination's own catalogue, opened for the write and closed after it. */
  openCatalog: (file: string) => Promise<AsyncCatalog>
}

/**
 * Puts a document and everything it cites into ANOTHER project, so that project can open it.
 *
 * The rows travel with the bytes, ids unchanged — that is the whole of what makes the
 * destination autonomous rather than merely full: a scene names its sky, its clips and its
 * images by catalogue id, and a destination that minted its own would resolve none of them.
 *
 * 🛑 It never overwrites. A destination already holding a file at that path is left alone: the
 * same bytes are `held` and the copy skipped, different bytes are `refused` and SAID. Landing a
 * suffixed copy beside it would break every citation written by name, quietly.
 */
export async function gatherIntoProject(
  deps: GatherDeps,
  request: { documentId: string; kind: DocumentKind; destination: string },
): Promise<GatherReport> {
  const root = deps.projectPath()
  const { documentId, kind, destination } = request

  if (!root) return { files: [], rows: 0, refused: 'no-document' }
  if (await isOneFolder(root, destination)) return { files: [], rows: 0, refused: 'same-project' }
  if (!deps.exists(join(destination, MANIFEST_FILE))) {
    return { files: [], rows: 0, refused: 'not-a-project' }
  }

  const cited = await deps.citedBy(documentId, kind)
  const paths = [documentPath(documentId, kind), ...cited.flatMap(one => one.path ?? [])]
  const files: GatheredFile[] = []
  // One file's failure is that file's, never the batch's: a disk that fills on the fourth of
  // six must still report the three that landed, and which one stopped.
  for (const path of paths) {
    files.push(await orElse(placeOne(deps, root, destination, path), { path, state: 'refused' }))
  }

  const landed = new Set(files.filter(file => file.state !== 'refused').map(file => file.path))
  const rows = cited.filter(one => one.path !== undefined && landed.has(one.path))

  return { files, rows: await fileRows(deps, destination, rows) }
}

/**
 * Whether the two paths name the SAME folder, whatever they are spelt as.
 *
 * 🛑 By inode and device, not by string: a symlink, a trailing slash and a case-different
 * spelling on APFS all reach one folder under three names. Compared as text, a « gathering »
 * into the open project would open a second, uncoordinated connection onto its own catalogue
 * and replace its rows — `INSERT OR REPLACE` raises nothing — stripping the derived paths the
 * live window is still using.
 */
async function isOneFolder(one: string, other: string): Promise<boolean> {
  if (one === other) return true

  const [here, there] = await Promise.all([orElse(stat(one), null), orElse(stat(other), null)])
  return here !== null && there !== null && here.ino === there.ino && here.dev === there.dev
}

/**
 * One file, copied unless the destination already has something at that path.
 *
 * The fingerprint is what tells the two cases apart, and it is MEASURED rather than assumed
 * from the size or the date: « the same file is already there » is the answer that lets a
 * second gathering of the same document cost nothing, and it must not be guessed.
 */
async function placeOne(
  deps: GatherDeps,
  root: string,
  destination: string,
  path: string,
): Promise<GatheredFile> {
  const from = join(root, path)
  const to = join(destination, path)

  if (!deps.exists(from)) return { path, state: 'refused' }

  if (deps.exists(to)) {
    const [here, there] = await Promise.all([deps.hash(from), deps.hash(to)])
    return { path, state: here !== null && here === there ? 'held' : 'refused' }
  }

  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
  return { path, state: 'copied' }
}

/** A row as the destination should receive it: its own bytes, none of what was derived here. */
function withoutDerived(row: Asset): Asset {
  const kept = { ...row }
  delete kept.proxyPath
  delete kept.peaksPath
  delete kept.posterPath
  return kept
}

/**
 * Writes the rows into the destination's own catalogue, then closes it.
 *
 * Opened for the write alone: the destination is not the open project, so nothing else holds
 * that database — and SQLite takes one writer at a time, which is the reason this is not left
 * open a moment longer than the write.
 */
async function fileRows(
  deps: GatherDeps,
  destination: string,
  rows: readonly Asset[],
): Promise<number> {
  if (rows.length === 0) return 0

  const file = join(destination, CATALOG_FILE)
  // 🛑 The folder first: `.index/` is git-ignored, so a project cloned again after being opened
  // elsewhere carries a manifest and no cache — and `better-sqlite3` throws on a missing parent
  // rather than making one, which would leave the bytes copied and no row to find them by.
  await mkdir(dirname(file), { recursive: true })
  const catalog = await deps.openCatalog(file)
  try {
    // The derived files did not travel: they are the destination's to make again, and a row
    // naming a proxy that is not there makes playback open nothing at all.
    for (const row of rows) await catalog.add(withoutDerived(row))
    return rows.length
  } finally {
    await catalog.close()
  }
}
