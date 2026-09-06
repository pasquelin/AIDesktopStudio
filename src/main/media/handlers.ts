import { withoutSourcePath, type Asset } from '@shared/domain/asset'
import type { ExternalFileImport } from '@shared/domain/externalFile'
import type { FolderRole } from '@shared/domain/folderRole'
import type { MediaCapabilities } from '@shared/domain/media'
import { isConvertibleType } from '@shared/domain/meshImport'
import { taskRatio, type TaskWatch } from '@shared/domain/taskProgress'
import { CHANNELS, EVENTS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { sendToSender } from '@main/ipc/broadcast'
import { parseAssetId } from '@main/assets/validation'
import { parseFolderPath, parseFolderRole } from '@main/project/validation'
import type { RunningTasks } from '@main/task/runningTasks'
import { assetTypeOf } from './link'
import type { MediaService } from './service'

const EMPTY_IMPORT: ExternalFileImport = {
  assets: [],
  documents: [],
  montages: [],
  refused: [],
  failed: [],
}

export type MediaHandlerDeps = {
  media: MediaService
  /** Writes a catalogue row for a file left where it lies, and hands it back. */
  link: (source: string, type: Asset['type']) => Promise<Asset>
  /** The same, for a file the project already holds — see `adoptFile`. */
  adopt: (relative: string) => Promise<Asset | null>
  /** Injected rather than imported: `dialog` needs a live app, which no test has. */
  pickMedia: () => Promise<string[]>
  capabilities: () => Promise<MediaCapabilities>
  importPaths: (
    paths: readonly string[],
    folder: string,
    watch: TaskWatch,
  ) => Promise<ExternalFileImport>
  claimExternalFiles: (id: string) => readonly string[]
  running: RunningTasks
  pickAnimation: () => Promise<string[]>
  folderFor: (role: FolderRole) => Promise<string>
}

export function registerMediaHandlers({
  media,
  link,
  adopt,
  pickMedia,
  capabilities,
  importPaths,
  claimExternalFiles,
  running,
  pickAnimation,
  folderFor,
}: MediaHandlerDeps): void {
  handle(CHANNELS.mediaAdopt, async (_event, relative) => {
    // A row the window never needs the absolute path of, exactly as the ingest answers.
    const asset = await adopt(parseFolderPath(relative))
    return asset && withoutSourcePath(asset)
  })

  handle(CHANNELS.mediaIngest, async () => {
    const assets: Asset[] = []
    const models: string[] = []
    let copied = EMPTY_IMPORT

    for (const source of await pickMedia()) {
      const type = assetTypeOf(source)
      if (!type) continue
      // A rush stays where it lies; a 3D file is copied so the conversion can write a `.glb`.
      if (isConvertibleType(type)) {
        models.push(source)
        continue
      }

      const asset = await link(source, type)
      assets.push(withoutSourcePath(asset))
      // Not awaited: the row exists, so the browser shows the file at once, while probing a
      // twenty-minute rush goes on reporting through `evt:media-progress`.
      void media.ingest(asset.id, source, type)
    }
    if (models.length > 0) {
      copied = await importPaths(models, '', {})
      assets.push(...copied.assets.map(withoutSourcePath))
    }

    return { ...copied, assets }
  })

  handle(CHANNELS.mediaIngestPaths, async (event, requestId, folder, taskId) => {
    const paths = claimExternalFiles(requestId)
    return await running.run(taskId, async signal => {
      const imported = await importPaths(paths, parseFolderPath(folder), {
        signal,
        onStep: (done, total) =>
          sendToSender(event.sender, EVENTS.taskProgress, {
            id: taskId,
            ratio: taskRatio(done, total),
          }),
      })
      return { ...imported, assets: imported.assets.map(withoutSourcePath) }
    })
  })

  handle(CHANNELS.mediaImportPicked, async (event, role, taskId) => {
    const paths = await pickAnimation()
    if (paths.length === 0) return EMPTY_IMPORT
    const folder = await folderFor(parseFolderRole(role))
    return await running.run(taskId, async signal => {
      const imported = await importPaths(paths, folder, {
        signal,
        onStep: (done, total) =>
          sendToSender(event.sender, EVENTS.taskProgress, {
            id: taskId,
            ratio: taskRatio(done, total),
          }),
      })
      return { ...imported, assets: imported.assets.map(withoutSourcePath) }
    })
  })

  handle(CHANNELS.mediaCancel, (_event, assetId) => media.cancel(parseAssetId(assetId)))

  handle(CHANNELS.mediaAvailable, () => capabilities())
}
