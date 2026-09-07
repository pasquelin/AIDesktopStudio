import { realpath } from 'node:fs/promises'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isProjectReserved, pathIsInside } from '@main/export/pathIsInside'

/**
 * Which file a montage is allowed to have READ, decided by what the disk resolves to.
 *
 * The twin of `folderInsideProject`, for the other direction: bundling a montage hands this
 * process a list of media the SANDBOXED side named, and reading them is exactly what an export
 * does. Unchecked, a renderer asking for `file:///etc/passwd` would get it packed into a file it
 * then hands to somebody else.
 *
 * Both ends go through `realpath`, for the reason written next door — a link sitting in the
 * project names nothing suspicious and walks straight out. The file must already exist, which is
 * the difference: there is nothing to read otherwise.
 */
export async function fileInsideProject(root: string, url: string): Promise<string | null> {
  try {
    const base = await realpath(root)
    // A `file://` URL, which is how the timeline names its media; anything else is not a path.
    const resolved = await realpath(url.startsWith('file:') ? fileURLToPath(url) : url)
    if (!pathIsInside(base, resolved) || isProjectReserved(relative(base, resolved))) return null
    return resolved
  } catch {
    return null
  }
}
