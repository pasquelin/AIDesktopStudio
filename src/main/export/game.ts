import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import { ASSET_SEARCH_LIMIT_MAX, type Asset } from '@shared/domain/asset'
import { safeFileName } from '@shared/domain/fileName'
import { nameOf } from '@shared/domain/folder'
import type { GameExportOutcome, GameExportRequest } from '@shared/domain/gameExport'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { isMissing, writeQueue } from '@main/persistence'
import { folderInsideProject } from '@main/project/folderInsideProject'
import { pathSegment } from '@main/validation'
import { writeExportedGame, type ExportedAsset, type GameExportPorts } from './gameExport'
import { pathIsInside } from './pathIsInside'

export type GameExportDeps = {
  /** Injected, like every dialog: `dialog` needs a live app, which no test has. */
  pickFolder: () => Promise<string | null>
  projectPath: () => string | null
  /** The rows a catalogue holds, by id — where an asset's file sits inside the project. */
  assetsById: (ids: readonly string[]) => Promise<readonly Asset[]>
  /** Where the runtime bundle sits: `resources/gameRuntime` beside the app. */
  runtimeFolder: () => string
  /** The file one shipped animation folder holds, by that folder's name — or nothing. */
  bundledAnimation: (name: string) => Promise<string | null>
}

/** Writing a game that runs with no studio. The split is written on the channel, in `ipc.ts`. */
export function registerGameExportHandler(deps: GameExportDeps): void {
  const writes = new Map<string, ReturnType<typeof writeQueue>>()
  const admissions = writeQueue()
  handle(CHANNELS.gameExport, async (_event, request: GameExportRequest) => {
    const admitted = await admissions.next(async () => await admitExport(deps, writes, request))
    return admitted ? await admitted.answer : null
  })
}

async function admitExport(
  deps: GameExportDeps,
  writes: Map<string, ReturnType<typeof writeQueue>>,
  request: GameExportRequest,
): Promise<{ answer: Promise<GameExportOutcome> } | null> {
  // The project FIRST: asked the other way round, a person with none picked a folder and got
  // back the same `null` a cancel gives.
  const project = deps.projectPath()
  if (!project) return null

  const chosen = await folderFor(request.folder, project, deps.pickFolder)
  if (!chosen) return null

  const name = safeFileName(request.title, 'game')
  const root = join(chosen, name)
  await mkdir(chosen, { recursive: true })
  const queue = writes.get(root) ?? writeQueue()
  writes.set(root, queue)
  return { answer: queue.next(async () => await exportInto(deps, project, root, request)) }
}

async function exportInto(
  deps: GameExportDeps,
  project: string,
  root: string,
  request: GameExportRequest,
): Promise<GameExportOutcome> {
  const staging = `${root}.staging`
  const previous = `${root}.previous`
  await recoverExport(root, staging, previous)
  try {
    const report = await writeExportedGame(portsFor(deps, project, staging), request)
    await replaceExport(staging, root, previous)
    return { folder: basename(root), ...report }
  } catch (error) {
    await discard(staging)
    throw error
  }
}

/** Lands a complete export; cleanup after publication cannot turn success into failure. */
async function replaceExport(staging: string, target: string, previous: string): Promise<void> {
  const heldPrevious = await exists(target)
  if (heldPrevious) await rename(target, previous)

  try {
    await rename(staging, target)
  } catch (error) {
    if (heldPrevious) await rename(previous, target)
    throw error
  }

  if (heldPrevious) await discard(previous)
}

/** Repairs a process stopped between the two directory renames, then clears orphaned staging. */
async function recoverExport(target: string, staging: string, previous: string): Promise<void> {
  await discard(staging)
  if (!(await exists(target)) && (await exists(previous))) await rename(previous, target)
  else await discard(previous)
}

async function discard(folder: string): Promise<void> {
  try {
    await rm(folder, { recursive: true, force: true })
  } catch {
    // The export failure is the useful one; cleanup cannot replace it with a second error.
  }
}

/**
 * NOT `persistence.exists`, which answers `false` for a permission that refuses or a volume that
 * unmounted: what asks there is deciding whether to go and look. Here an unreadable `.previous`
 * decides whether to DESTROY a package, and it must raise rather than read as absent.
 */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

/**
 * 🛑 `pathSegment` FIRST: `folderInsideProject` says its own safety rests on that pre-check, and
 * refuses nothing about the SHAPE of a name. A picker is the one way OUTSIDE may be chosen.
 */
async function folderFor(
  folder: string | undefined,
  project: string,
  pickFolder: () => Promise<string | null>,
): Promise<string | null> {
  if (!folder) return pickFolder()

  const named = pathSegment.safeParse(folder)
  return named.success ? folderInsideProject(project, named.data) : null
}

function portsFor(deps: GameExportDeps, project: string, root: string): GameExportPorts {
  return {
    assetFiles: async ids => {
      const found = new Map<string, ExportedAsset>()
      // One round trip, in slices the catalogue accepts — see `ASSET_SEARCH_LIMIT_MAX`.
      for (let at = 0; at < ids.length; at += ASSET_SEARCH_LIMIT_MAX) {
        for (const row of await deps.assetsById(ids.slice(at, at + ASSET_SEARCH_LIMIT_MAX))) {
          if (!row.path) continue

          try {
            const bytes = await readFile(join(project, row.path))
            found.set(row.id, {
              name: nameOf(row.path),
              bytes,
              ...(row.hash ? { hash: row.hash } : {}),
            })
          } catch {
            // The row is in the catalogue and the file has gone: left out, and listed as missing.
          }
        }
      }
      return found
    },

    /** One folder of `resources/animations`, read by the name a graph spells. */
    bundledClip: async name => {
      const file = await deps.bundledAnimation(name)
      if (!file) return null
      try {
        return await readFile(file)
      } catch {
        // Gone from beside the app: the state plays nothing, as a lost project clip already does.
        return null
      }
    },

    runtime: async () => {
      const folder = deps.runtimeFolder()
      try {
        return await runtimeFiles(folder)
      } catch {
        // 🛑 In development the folder exists only once `pnpm game:runtime` has run, and git
        // ignores it. Said as a game with no runtime rather than as a bare ENOENT over the wire.
        throw new Error('no game runtime is built: run `pnpm game:runtime`')
      }
    },

    write: async (relative, body) => {
      const file = join(root, relative)
      // 🛑 The second lock, and the one that does not depend on who composed the name: `join`
      // resolves `..`, so a path that climbed out of the folder is refused here whatever the
      // caller thought it was writing.
      if (!pathIsInside(root, file)) {
        throw new Error(`refused to write outside the game folder: ${relative}`)
      }
      // `recursive`, as `export/folder.ts` does and for the same reason.
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, body)
    },
  }
}

async function runtimeFiles(
  root: string,
  folder: string = root,
): Promise<readonly { name: string; body: Uint8Array }[]> {
  const entries = await readdir(folder, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) return await runtimeFiles(root, path)
      if (!entry.isFile()) return []
      return [{ name: relative(root, path).split(sep).join('/'), body: await readFile(path) }]
    }),
  )
  return files.flat()
}
