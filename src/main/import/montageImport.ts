import { mkdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { z } from 'zod'
import type { Asset } from '@shared/domain/asset'
import { taskRatio } from '@shared/domain/taskProgress'
import { safeFileName, stemOf } from '@shared/domain/fileName'
import { importSourceOf } from '@shared/domain/importRegistry'
import { CHANNELS, EVENTS, type MontageImportResult } from '@shared/ipc'
import type { BundleClient } from '@main/bundle/bundleClient'
import { sendToSender } from '@main/ipc/broadcast'
import { handle } from '@main/ipc/handle'
import type { RunningTasks } from '@main/task/runningTasks'
import { folderInsideProject } from '@main/project/folderInsideProject'
import { pathIn } from '@shared/domain/folder'

export type MontageImportDeps = {
  /** Injected, like every dialog: `dialog` needs a live app, which no test has. */
  pickImportPath: (extension: string) => Promise<string | null>
  /** Where the open project sits, or nothing when none is. */
  projectPath: () => string | null
  bundles: () => BundleClient
  running: RunningTasks
  /** Gives a landed file its catalogue row — the same door a double-click in the explorer uses. */
  adopt: (relative: string) => Promise<Asset | null>
}

/** The same id the window minted for the row, and the name the stop button answers to. */
const montageImport = z.object({ id: z.string().min(1).max(64) })

/** How many names are tried before giving up — a person with 64 copies has another problem. */
const MAX_TRIES = 64

/**
 * A folder inside the project this side just MADE. `mkdir` without `recursive` refuses a name
 * somebody holds — the only answer a case-insensitive volume and a race cannot both slip through,
 * and what lets a stopped import remove the folder whole to undo.
 */
async function madeFolder(root: string, wanted: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    const name = attempt === 1 ? wanted : `${wanted} ${attempt}`
    const absolute = await folderInsideProject(root, name)
    if (!absolute) return null

    try {
      await mkdir(absolute)
      return name
    } catch (error) {
      // Taken already is the ordinary case here — the loop tries the next name. Anything else
      // belongs to the caller.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  return null
}

type MontageArchiveDeps = Pick<MontageImportDeps, 'bundles' | 'adopt'> & {
  onProgress?: (done: number, total: number) => void
}

export async function importMontageArchive(
  archive: string,
  root: string,
  parent: string,
  signal: AbortSignal,
  { bundles, adopt, onProgress }: MontageArchiveDeps,
): Promise<MontageImportResult | null> {
  if (signal.aborted) return null
  const parentAbsolute = join(root, parent)
  const name = await madeFolder(parentAbsolute, safeFileName(stemOf(basename(archive)), 'montage'))
  if (!name) return null
  const folder = pathIn(parent, name)

  const into = join(root, folder)
  try {
    const contents = await bundles().read({
      path: archive,
      into,
      onStep: (done, total) => onProgress?.(done, total),
      signal,
    })
    if (!contents) {
      await rm(into, { recursive: true, force: true })
      return null
    }

    const media: { entry: string; assetId: string }[] = []
    for (const one of contents.media) {
      const asset = await adopt(`${folder}/${one.file}`)
      if (asset) media.push({ entry: one.entry, assetId: asset.id })
    }
    return { content: contents.content, media, folder }
  } catch (error) {
    await rm(into, { recursive: true, force: true })
    throw error
  }
}

/**
 * Reading a montage bundle back into the project. What it reads WINS: the cut comes from the
 * file, and the media are copied in and catalogued rather than pointed at where they lie.
 */
export function registerMontageImportHandlers({
  pickImportPath,
  projectPath,
  bundles,
  running,
  adopt,
}: MontageImportDeps): void {
  handle(CHANNELS.montageImport, async (event, request) => {
    const { id } = montageImport.parse(request)

    const root = projectPath()
    // The media are copied INTO the project, so without one there is nowhere for them to land.
    if (!root) return null

    // Named to the table BEFORE anything this run waits on, the dialog included, as the export
    // is: `cancel` answers `false` for an id it has not seen, so a stop reaching the handler
    // during the picker would be refused rather than obeyed.
    return running.run(id, async signal => {
      const archive = await pickImportPath(importSourceOf('montage.otioz').extension)
      if (!archive) return null
      return await importMontageArchive(archive, root, '', signal, {
        bundles,
        adopt,
        onProgress: (done, total) =>
          sendToSender(event.sender, EVENTS.taskProgress, {
            id,
            ratio: taskRatio(done, total),
          }),
      })
    })
  })
}
