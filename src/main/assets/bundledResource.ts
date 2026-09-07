import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { orElse } from '@shared/promises'
import { withoutSourcePath, type Asset, type AssetType } from '@shared/domain/asset'
import type { FolderRole } from '@shared/domain/folderRole'
import type { PbrChannel } from '@shared/domain/material'
import { pathIn } from '@shared/domain/folder'
import { extensionOf } from '@shared/domain/fileName'
import { resourceFolderOf } from '@shared/domain/project'
import { ownFileOf } from './protocol'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { LocalBackend } from './localBackend'

/**
 * One file the app ships, as putting it into a project needs to know it.
 *
 * `formerPaths` is what a project made before `.resources/` may hold it at: this folder is a
 * catalogue LOOKUP as much as a landing, and missing one installs a second copy under a fresh id
 * while the scenes go on pointing at the first.
 */
export type BundledResource = {
  /** The file beside the app, and what it is filed under — the two are the same stem. */
  file: string
  name: string
  type: AssetType
  role: FolderRole
  /** The PBR channel a texture answers, kept on the row as any other import would carry it. */
  map?: PbrChannel
  formerPaths?: readonly string[]
}

export type BundledResourceDeps = {
  catalog: () => AsyncCatalog
  assets: LocalBackend
  newAssetId: () => string
  /** The open project's folder, which is what a stored path is relative to. */
  projectPath: () => string
  /** Whether a file is still there. Injected, exactly as `assets:absent` takes it. */
  exists: (file: string) => boolean
}

function resourcePathOf(resource: BundledResource): string {
  return pathIn(resourceFolderOf(resource.role), resource.file)
}

/**
 * One shipped file, put into the open project — once.
 *
 * Copied rather than served from beside the app, and that is the whole design: a document holds
 * an asset id, and the `.gltf` it is written as has to point at a file another application can
 * open. A mesh living only inside the app would leave every exported scene bare.
 *
 * Idempotent through the catalogue AND the disk: a project that files one at its path keeps that
 * row, ids included — unless its file is gone, in which case it is written again rather than left
 * as a reference every scene resolves to nothing.
 *
 * **Two angles blind, in clear.** An asset RENAMED in the shelf moves its file, so the next open
 * installs a second copy under a new id — the old scenes go on resolving, which is why this is the
 * cheap end of the trade. And a foreign file already sitting at that exact path makes the copy
 * land suffixed, again at every open. Both want an identity that is not the path — a hash — and
 * neither has been seen in practice.
 */
export async function installBundledResource(
  { catalog, assets, newAssetId, projectPath, exists }: BundledResourceDeps,
  folder: string,
  resource: BundledResource,
): Promise<Asset> {
  // ONE round trip for every candidate: asking path by path cost sixteen round trips to the
  // catalogue worker for four textures, where `paths` answers them all at once. The order of
  // preference is kept here rather than by the query, which answers in its own.
  const wanted = [resourcePathOf(resource), ...(resource.formerPaths ?? [])]
  const rows = await catalog().search({ paths: wanted, hidden: true })
  const held = wanted.flatMap(path => rows.filter(row => row.path === path))[0]
  // The row alone is not enough: a file deleted in the Finder leaves it behind, and everything
  // that points at it would resolve to nothing.
  const file = held ? ownFileOf(projectPath(), held) : null
  if (held && file !== null && exists(file)) return held

  const bytes = await readFile(join(folder, resource.file))

  // The SAME asset when the row is still there: its id is what the scenes of this project already
  // point at, and a fresh one would leave every one of them resolving to nothing.
  //
  // Falling back to a fresh import rather than letting it throw: `replaceBytes` writes to the path
  // the row carries and makes no folder, so a folder sent to the trash whole would fail here.
  if (held) {
    const rewritten = await orElse(
      assets.replaceBytes(held.id, bytes, extensionOf(resource.file)),
      null,
    )
    if (rewritten) return withoutSourcePath(rewritten)
  }

  return withoutSourcePath(
    await assets.importFromBytes(
      {
        id: newAssetId(),
        name: resource.name,
        type: resource.type,
        extension: extensionOf(resource.file),
        folderRole: resource.role,
        ...(resource.map ? { map: resource.map } : {}),
        resource: true,
      },
      bytes,
    ),
  )
}
