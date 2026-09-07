import { mkdir, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { SCRIPT_EXTENSION, type GameScriptFile } from '@shared/domain/game'
import { extensionOf } from '@shared/domain/fileName'
import { isPrivatePath, type FolderEntry } from '@shared/domain/folder'
import { byCodeUnit } from '@shared/text'
import { pathIsInside } from '@main/export/pathIsInside'
import { isMissing, writeAtomic, writeQueue } from '@main/persistence'
import { orElse } from '@shared/promises'

export type GameScriptStore = {
  /** Every script the project holds, read whole: a PLAY compiles the lot. */
  list: () => Promise<GameScriptFile[]>
  /** Whether it was written. Refused for a path that is not a script of THIS project. */
  write: (path: string, source: string) => Promise<boolean>
}

export type GameScriptDeps = {
  rootOf: () => string | null
  /** The project's own walk — its depth bound and its refusals, shared with the explorer. */
  walk: () => Promise<FolderEntry[]>
}

/** The `.ts` files a game runs. Every path comes from the WINDOW — see `insideProject`. */
export function createGameScripts(deps: GameScriptDeps): GameScriptStore {
  const writes = writeQueue()

  return {
    list: async () => {
      const root = deps.rootOf()
      const base = root === null ? null : await resolvedRoot(root)
      if (base === null) return []

      // Read together rather than one after the other: a project of thirty scripts would
      // otherwise add thirty disk latencies to every Play.
      const found = await Promise.all((await deps.walk()).map(entry => read(base, entry.path)))
      return found
        .filter((one): one is GameScriptFile => one !== null)
        .sort((one, other) => byCodeUnit(one.path, other.path))
    },

    write: async (path, source) => {
      const root = deps.rootOf()
      const base = root === null ? null : await resolvedRoot(root)
      const file = base === null ? null : await insideProject(base, path)
      if (file === null) return false

      // The folder first: scripts land in `scripts/`, which a project made before this build —
      // or a project that has never held one — simply does not have. `writeAtomic` would ENOENT.
      await mkdir(dirname(file), { recursive: true })
      await writes.next(() => writeAtomic(file, source))
      return true
    },
  }
}

async function read(base: string, path: string): Promise<GameScriptFile | null> {
  const file = await insideProject(base, path)
  if (file === null) return null

  try {
    return { path, source: await readFile(file, 'utf8') }
  } catch (error) {
    // A file the walk saw and the read cannot: renamed underneath, or gone. Not a fault.
    if (!isMissing(error)) throw error
    return null
  }
}

/** The project root as the disk names it, or nothing when it is not there any more. */
async function resolvedRoot(root: string): Promise<string | null> {
  return orElse(realpath(root), null)
}

/**
 * 🛑 Both ends go through `realpath`, as `folderInsideProject` does and for its reason: a link
 * already sitting in the project names nothing suspicious and walks straight out. The root
 * arrives RESOLVED: a project of thirty scripts paid thirty identical `realpath` calls a Play.
 */
async function insideProject(base: string, path: string): Promise<string | null> {
  // A window names what it wants RELATIVE to the project; an absolute path is one it invented.
  if (isAbsolute(path)) return null
  if (extensionOf(path).toLowerCase() !== SCRIPT_EXTENSION) return null
  // Under a dot is the studio's own bookkeeping — the ONE spelling of that question.
  if (isPrivatePath(path)) return null

  try {
    const target = resolve(base, path)
    const resolved = await orElse(realpath(target), target)
    const within = relative(base, resolved)

    if (!pathIsInside(base, resolved)) return null
    return isPrivatePath(within.split(sep).join('/')) ? null : target
  } catch {
    return null
  }
}
