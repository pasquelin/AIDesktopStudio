import { orElse } from '@shared/promises'
import { realpath } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { isProjectReserved, pathIsInside, PROJECT_RESERVED } from '@main/export/pathIsInside'

/**
 * Where a write is allowed to land inside the open project, decided by what the disk RESOLVES TO
 * rather than by the shape of the name.
 *
 * `pathSegment` already refuses the shapes — a separator, `.`, `..`, a control character — so no
 * name reaching here can climb out by spelling. What it cannot refuse is a SYMBOLIC LINK already
 * sitting in the project under that name: it names nothing suspicious and walks straight out. Both
 * ends therefore go through `realpath`, as `git/blob.ts` does for reads, and for the same reason —
 * a project under a linked folder is ordinary, `/var` being one on macOS.
 *
 * The destination usually does not exist yet, which is the whole point of creating it: it is
 * resolved only when it is already there, and the ROOT is resolved either way.
 *
 * `.git` and `.index` are refused on top: the first holds the token a remote was cloned with, the
 * second is the catalogue database, and an export folder is neither.
 */
export async function folderInsideProject(root: string, folder: string): Promise<string | null> {
  if (PROJECT_RESERVED.includes(folder)) return null

  try {
    const base = await realpath(root)
    const target = join(base, folder)

    // Only when it is already there. A destination that does not exist cannot be resolved, and
    // its parent — the project root — has just been.
    const resolved = await orElse(realpath(target), target)
    const within = relative(base, resolved)

    if (!pathIsInside(base, resolved) || isProjectReserved(within)) return null
    return target
  } catch {
    return null
  }
}
