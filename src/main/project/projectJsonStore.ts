import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { isPrivatePath, type FolderEntry } from '@shared/domain/folder'
import { byCodeUnit } from '@shared/text'
import { pathIsInside } from '@main/export/pathIsInside'
import { writeAtomic, writeQueue } from '@main/persistence'
import { fileInsideProject } from './fileInsideProject'
import { folderInsideProject } from './folderInsideProject'

/** The three gestures a project makes on one family of JSON files it owns. */
export type ProjectJsonStore<T> = {
  list: () => Promise<string[]>
  read: (path: string) => Promise<T | null>
  write: (path: string, value: T) => Promise<boolean>
}

export type ProjectJsonStoreDeps<T> = {
  /** What names one, dot included — `.input.json`, `.anim.json`. */
  extension: string
  /** What a file has to parse as, throwing for one that does not. Also run before writing. */
  parse: (value: unknown) => T
  rootOf: () => string | null
  walk: () => Promise<FolderEntry[]>
  /** Told what a write landed on. A PORT, so this module owes Electron nothing. */
  announce?: (path: string) => void
}

/**
 * A family of JSON files a project holds, read and written under the same guards.
 *
 * 🛑 Every path is checked against the ROOT and refused if it escapes or reaches into what the
 * studio keeps private — the one place that is enforced for these files. The parse runs on the
 * way in AND on the way out: a file nobody can read back is not one to write.
 */
export function createProjectJsonStore<T>(deps: ProjectJsonStoreDeps<T>): ProjectJsonStore<T> {
  const writes = writeQueue()
  const pathIn = (root: string, path: string): string | null => safePath(root, path, deps.extension)

  return {
    list: async () => {
      const root = deps.rootOf()
      if (root === null) return []
      return (await deps.walk())
        .filter(entry => entry.kind === 'file' && pathIn(root, entry.path))
        .map(entry => entry.path)
        .sort(byCodeUnit)
    },

    read: async path => {
      const root = deps.rootOf()
      if (root === null) return null
      const target = pathIn(root, path)
      const file = target === null ? null : await fileInsideProject(root, target)
      if (file === null) return null
      return deps.parse(JSON.parse(await readFile(file, 'utf8')))
    },

    write: async (path, value) => {
      const root = deps.rootOf()
      if (root === null) return false
      const file = pathIn(root, path)
      if (file === null) return false
      const folder = await safeFolder(root, relative(root, dirname(file)))
      if (folder === null) return false

      deps.parse(value)
      await writes.next(() =>
        writeAtomic(resolve(folder, basename(file)), `${JSON.stringify(value, null, 2)}\n`),
      )
      // 🛑 Every window, not the one that wrote: a control map is resolved once and held, so a
      // rebind saved in one window left the studio's own navigation reading the version from
      // before it — until the project was closed and opened again.
      deps.announce?.(path)
      return true
    },
  }
}

/** Each segment checked in turn, so a path climbing out is refused before anything is made. */
async function safeFolder(root: string, folder: string): Promise<string | null> {
  let walked = ''
  for (const segment of folder.split(sep).filter(Boolean)) {
    walked = walked === '' ? segment : `${walked}${sep}${segment}`
    const safe = await folderInsideProject(root, walked)
    if (safe === null) return null
    await mkdir(safe, { recursive: true })
  }
  return await folderInsideProject(root, folder)
}

function safePath(root: string, path: string, extension: string): string | null {
  if (isAbsolute(path) || !path.endsWith(extension) || isPrivatePath(path)) return null
  const target = resolve(root, path)
  const within = relative(root, target)
  if (!pathIsInside(root, target) || isPrivatePath(within.split(sep).join('/'))) return null
  return target
}
