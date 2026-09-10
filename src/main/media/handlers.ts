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
    /**
     * Files the arrivals as DURABLE INTERNAL resources rather than in the project's own tree —
     * what a drop INTO a document asks for (§7). A flag, never a folder: a path reaching this
     * from a window would write wherever its first `../` pointed.
     */
    internal?: true,
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

  /**
   * The picker, COPYING into the folder that was asked for — the same act as dropping those files
   * on that folder. It used to link instead, so the same rush imported through the menu and
   * dropped in the explorer left the project in two different states, and nothing on screen said
   * which door had done which. Linking is `mediaLink`, and it is a command with a name.
   */
  handle(CHANNELS.mediaIngest, async (_event, folder) => {
    const paths = await pickMedia()
    if (paths.length === 0) return EMPTY_IMPORT
    const imported = await importPaths(paths, parseFolderPath(folder), {})
    return { ...imported, assets: imported.assets.map(withoutSourcePath) }
  })

  /** The same picker, leaving every file where it lies — see `StudioBridge.media.link`. */
  handle(CHANNELS.mediaLink, async () => {
    const assets: Asset[] = []
    const models: string[] = []
    let copied = EMPTY_IMPORT

    for (const source of await pickMedia()) {
      const type = assetTypeOf(source)
      if (!type) continue
      // A 3D file cannot be left where it lies: the conversion has a `.glb` to write beside it.
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

  handle(CHANNELS.mediaIngestPaths, async (event, requestId, folder, taskId, internal) => {
    const paths = claimExternalFiles(requestId)
    return await running.run(taskId, async signal => {
      const imported = await importPaths(
        paths,
        parseFolderPath(folder),
        {
          signal,
          onStep: (done, total) =>
            sendToSender(event.sender, EVENTS.taskProgress, {
              id: taskId,
              ratio: taskRatio(done, total),
            }),
        },
        // Parsed, not trusted: what crosses this boundary is `unknown` whatever the bridge type
        // says, and this one chooses a folder to write into.
        internal === true ? true : undefined,
      )
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
