import { LEGACY_ASSETS_FOLDER, landedInDefaultFolder } from '@shared/domain/project'
import { folderForRole } from '@shared/domain/folderRole'
import { roleForAsset, type Asset, type MediaProbe } from '@shared/domain/asset'
import type { Language } from '@shared/i18n'
import { EVENTS } from '@shared/ipc'
import { shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { createLocalBackend } from './assets/localBackend'
import { createTextureExtraction } from './assets/textureExtraction'
import { ownFileOf } from './assets/protocol'
import { openBundleProcess } from './bundle/bundleProcess'
import type { BundleClient } from './bundle/bundleClient'
import { broadcast } from './ipc/broadcast'
import { createMediaService } from './media/service'
import { catchUpMedia } from './media/catchUp'
import { createFfmpegResolver } from './media/ffmpeg'
import { openPeaksProcess } from './media/peaksProcess'
import type { PeaksClient } from './media/peaksClient'
import {
  companionPath,
  findOnPath,
  hashOrNull,
  hashSource,
  probeSource,
  runProcess,
} from './media/runner'
import { createDocumentFiles } from './project/documents'
import { createFileOps } from './project/fileOps'
import { createFolderReader, createFolderWriter } from './project/folder'
import { createProjectGame } from './project/game'
import { createGameScripts } from './project/gameScripts'
import { createAnimationGraphs } from './project/animationGraphs'
import { createInputMaps } from './project/inputMaps'
import { keepScriptPaths } from './project/scriptPaths'
import type { ActivityLog } from './project/activityLog'
import type { ProjectStore } from './project/store'
import { bundledFfmpeg, resourcesRoot } from './resources'
import type { SettingsStore } from './settings/store'
import { log } from './log'

const ANNOUNCE_MS = 50

type MediaDeps = {
  settings: SettingsStore
  project: ProjectStore
  journal: ActivityLog
  language: () => Language
  download: (url: string) => Promise<Uint8Array>
  newAssetId: () => string
  now: () => string
  concurrency: () => number
}

export function createMediaServices(deps: MediaDeps) {
  const probeLocalFile = async (path: string): Promise<MediaProbe | null> => {
    const outcome = await probeSource(companionPath(ffmpeg.path()), path)
    return outcome.kind === 'probed' ? outcome.probe : null
  }
  const saveAssetFields = async (assetId: string, fields: Partial<Asset>): Promise<void> =>
    await saveFields(deps, assetId, fields)
  const legacyLayoutSettled = new Set<string>()
  const noteLegacyLayout = (asset: Asset): void => noteLegacy(deps, legacyLayoutSettled, asset)
  const announceAsset = createAnnouncer()
  const deriveLandedFiles = async (
    asset: Asset,
    kind: 'video' | 'audio',
    path: string,
    probe: MediaProbe,
  ) => {
    try {
      await media.derive({
        assetId: asset.id,
        path: join(deps.project.path() ?? '', path),
        kind,
        probe,
        poster: !asset.posterPath,
        announce: true,
      })
      broadcast(EVENTS.assetsChanged, [])
    } catch (error) {
      log.warn('media', `could not derive the files of ${asset.name}: ${String(error)}`)
    }
  }
  const onAssetLanded = (asset: Asset): void => {
    noteLegacyLayout(asset)
    announceAsset(asset)
    if ((asset.type === 'video' || asset.type === 'audio') && asset.probe && asset.path) {
      void deriveLandedFiles(asset, asset.type, asset.path, asset.probe)
      return
    }
  }
  const assets = createLocalBackend({
    download: deps.download,
    projectPath: () => deps.project.path(),
    folderFor: role => deps.project.folderFor(role),
    catalog: () => deps.project.catalog(),
    now: deps.now,
    hash: hashOrNull,
    probeFile: probeLocalFile,
    onImported: onAssetLanded,
  })
  const extractTextures = createTextureExtraction({
    fileOf: asset => ownFileOf(deps.project.path(), asset),
    search: query => deps.project.catalog().search(query),
    write: (request, bytes) => assets.importFromBytes(request, bytes),
    replaceModel: async (source, bytes) => {
      // The conversion IS the errand: a glTF whose pictures were pulled out comes back binary,
      // and the row has to follow the file it now names.
      await assets.replaceBytes(source.id, bytes, '.glb', { converts: true })
    },
    newAssetId: deps.newAssetId,
    record: report => deps.journal.record(report),
  })
  const folder = {
    ...createFolderReader(() => deps.project.path(), deps.language),
    ...createFolderWriter(
      () => deps.project.path(),
      file => shell.trashItem(file),
    ),
  }
  const documents = createDocumentFiles({
    projectPath: () => deps.project.path(),
    now: deps.now,
    walkFiles: () => folder.walk(),
    folderNames: relative => folder.names(relative),
    folderFor: role => deps.project.folderFor(role),
  })
  const projectRoot = (): string | null => deps.project.current()?.path ?? null
  const game = createProjectGame({ rootOf: projectRoot })
  const scripts = createGameScripts({ rootOf: projectRoot, walk: () => folder.walk() })
  // 🛑 Every window, not the one that wrote: a control map is resolved once and held, so a rebind
  // saved anywhere left the others reading the version from before it, until the project reopened.
  const announce = (path: string): void => broadcast(EVENTS.projectJsonWritten, path)
  const inputMaps = createInputMaps({ rootOf: projectRoot, walk: () => folder.walk(), announce })
  const animationGraphs = createAnimationGraphs({
    rootOf: projectRoot,
    walk: () => folder.walk(),
    announce,
  })
  const files = createFileOps({
    rootOf: projectRoot,
    folder,
    catalog: () => deps.project.catalog(),
    newBatchId: () => randomUUID(),
    assetsChanged: () => broadcast(EVENTS.assetsChanged, []),
    pathsChanged: changes => void keepScriptPaths(game, changes),
    roles: () => deps.project.roles(),
  })
  const ffmpeg = createFfmpegResolver(() => ({
    bundled: bundledFfmpeg(resourcesRoot(), process.platform),
    configured: deps.settings.read().media.ffmpegPath,
    onPath: findOnPath('ffmpeg', process.env.PATH, delimiter, existsSync),
    exists: existsSync,
  }))
  let peaks: PeaksClient | null = null
  const media = createMediaService({
    ffmpeg: ffmpeg.path,
    run: (binary, args, signal) => runProcess(binary, args, { signal }),
    probe: (source, signal) => probeSource(companionPath(ffmpeg.path()), source, { signal }),
    hash: hashSource,
    computePeaks: run =>
      (peaks ??= openPeaksProcess(() => {
        peaks = null
      })).compute(run),
    duplicateExists: async (assetId, hash) => {
      const existing = await deps.project.catalog().findByHash(hash)
      return existing !== null && existing.id !== assetId
    },
    discard: async assetId => {
      await deps.project.catalog().remove(assetId)
    },
    save: saveAssetFields,
    writeFile: async (path, data) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, data)
    },
    onProgress: progress => broadcast(EVENTS.mediaProgress, progress),
    record: report => deps.journal.record(report),
    projectPath: projectRoot,
    concurrency: deps.concurrency,
  })
  const catchUpProject = createCatchUp(deps, probeLocalFile, saveAssetFields, media)
  let bundleClient: BundleClient | null = null
  const bundles = (): BundleClient =>
    (bundleClient ??= openBundleProcess(() => {
      bundleClient = null
    }))
  function result() {
    return {
      assets,
      extractTextures,
      folder,
      documents,
      game,
      scripts,
      inputMaps,
      animationGraphs,
      files,
      ffmpeg,
      media,
      catchUpProject,
      probeLocalFile,
      onAssetLanded,
      bundles,
    }
  }
  return result()
}

async function saveFields(deps: MediaDeps, assetId: string, fields: Partial<Asset>): Promise<void> {
  try {
    const catalog = deps.project.catalog()
    const current = await catalog.find(assetId)
    if (current) await catalog.add({ ...current, ...fields })
  } catch (error) {
    log.warn('media', `could not record what was derived for ${assetId}: ${String(error)}`)
  }
}

function noteLegacy(deps: MediaDeps, settled: Set<string>, asset: Asset): void {
  const root = deps.project.current()?.path
  const folder = folderForRole(roleForAsset(asset), deps.project.roles())
  if (!root || settled.has(root) || !landedInDefaultFolder(asset.path, folder)) return
  settled.add(root)
  if (!holdsLegacyFolder(root)) return
  deps.journal.record({
    level: 'info',
    topic: 'project',
    messageKey: 'activity.projectLegacyAssetsFolder',
    params: { legacy: LEGACY_ASSETS_FOLDER, folder },
  })
}

function holdsLegacyFolder(root: string): boolean {
  try {
    return readdirSync(root, { withFileTypes: true }).some(
      entry => entry.name === LEGACY_ASSETS_FOLDER && entry.isDirectory(),
    )
  } catch {
    return false
  }
}

function createAnnouncer(): (asset: Asset) => void {
  let landed: Asset[] = []
  let announcing: ReturnType<typeof setTimeout> | null = null
  return asset => {
    landed.push(asset)
    if (announcing) return
    announcing = setTimeout(() => {
      announcing = null
      const rows = landed
      landed = []
      broadcast(EVENTS.assetsChanged, rows)
    }, ANNOUNCE_MS)
  }
}

function createCatchUp(
  deps: MediaDeps,
  probeFile: (path: string) => Promise<MediaProbe | null>,
  save: (id: string, fields: Partial<Asset>) => Promise<void>,
  media: ReturnType<typeof createMediaService>,
) {
  let catchingUp = false
  return async (): Promise<void> => {
    if (catchingUp) return
    catchingUp = true
    try {
      const projectPath = deps.project.path()
      const done = await catchUpMedia({
        list: (offset, limit) =>
          deps.project
            .catalog()
            .search({ types: ['video', 'audio'], location: 'local', offset, limit }),
        fileOf: asset => ownFileOf(projectPath, asset),
        probeFile,
        save,
        derive: request => media.derive(request),
        stillOpen: () => deps.project.current()?.path === projectPath,
      })
      if (done > 0) broadcast(EVENTS.assetsChanged, [])
    } catch (error) {
      log.warn('media', `could not catch up the project's takes: ${String(error)}`)
    } finally {
      catchingUp = false
    }
  }
}
