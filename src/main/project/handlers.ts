import { localizedError } from '@shared/localizedError'
import { readFile } from 'node:fs/promises'
import { saveAnimationThumbnail } from './animationThumbnail'
import { bundledCharacters, resourcesRoot } from '@main/resources'
import { bundledCharacterFile } from '@shared/domain/bundledCharacter'
import { join } from 'node:path'
import { PLAYER_MODULE_FORMAT, PLAYER_MODULE_SEGMENT } from '@shared/domain/playerModuleFile'
import { projectName, withRecentDocument } from '@shared/domain/project'
import { CHANNELS, EVENTS } from '@shared/ipc'
import { glbChunksOf } from '@shared/domain/glbContainer'
import {
  PICTURES,
  withoutSourcePath,
  type Asset,
  type AssetType,
  type MediaProbe,
} from '@shared/domain/asset'
import type { FileOutcome } from '@shared/domain/fileOp'
import { assetFilePath, ownFileOf } from '@main/assets/protocol'
import { saveConverted } from '@main/assets/convertedMesh'
import { parseAssetId, parseAssetIds } from '@main/assets/validation'
import { broadcast } from '@main/ipc/broadcast'
import { handle } from '@main/ipc/handle'
import { peaksFromBytes } from '@main/media/peaks'
import { isPngBytes, probePng } from '@main/media/png'
import { packOpenRaster, unpackOpenRaster } from '@main/assets/openRasterFile'
import { oraEnvelopeFor } from '@main/assets/oraEnvelope'
import { oraThumbnailOf } from '@main/media/oraThumbnail'
import { ORA_MERGED_PATH } from '@shared/domain/openRaster'
import { ORA_EXTENSION, PNG_EXTENSION, WAV_EXTENSION } from '@shared/domain/writtenFormat'
import { probeWav } from '@main/media/wav'
import { fileFactsOf } from './fileFacts'
import { projectFileDependents } from './fileDependents'
import { registerCopiesHandlers } from './copiesHandlers'
import { registerGatherHandlers } from './gatherHandlers'
import { registerFileUseHandlers } from './fileUseHandlers'
import { registerRecoveryHandlers } from './recoveryHandlers'
import { registerResourceHandlers } from './resourceHandlers'
import { registerAskHandlers } from './askHandlers'
import { askLeaveWithJobs, askUseOccupiedFolder } from './projectDialogs'
import { holdsAProject, openFailureKey, orWhenGone } from './store'
import type { ProjectHandlerDeps } from './handlerTypes'
export type { ProjectHandlerDeps }
import {
  parseAssetQuery,
  parseContextCards,
  parseDocumentDraft,
  parseDocumentId,
  parseDocumentKind,
  parseDocumentTitle,
  parseFolderPath,
  parseFolderRole,
  parseFolderPaths,
  parseForceWrite,
  parseHiddenShown,
  parseDocumentPlace,
  parseProjectName,
  parseProjectPath,
  parseProjectTitle,
  parseSaveAudio,
  parseSaveAnimation,
  parseSaveConverted,
  parseSaveLayered,
  parseSaveMesh,
  parseSavePicture,
  parseSavePlayerModule,
  parseGame,
  parseSearchTerm,
} from './validation'
export function registerProjectHandlers({
  project,
  settings,
  record,
  assets,
  extractTextures,
  newAssetId,
  documents,
  reveal,
  exists,
  folder,
  files,
  reconciler,
  context,
  game,
  scripts,
  openInSystem,
  askUser,
  trashFolder,
  runningJobCount,
  media,
}: ProjectHandlerDeps): void {
  handle(CHANNELS.projectCreate, async (_event, path) => {
    const root = parseProjectPath(path)
    try {
      const named = parseProjectTitle(projectName(root))
      const verdict = await project.inspect(root)
      // Said rather than left to be guessed: a folder that IS a project is opened, and a window
      // reading the project alone cannot tell that from a project it has just made.
      if (verdict === 'project') return { project: await project.open(root), made: false }
      if (verdict === 'occupied' && !(await askUseOccupiedFolder(askUser, named))) return null
      return { project: await project.create(root), made: true }
    } catch (error) {
      record({
        level: 'error',
        topic: 'project',
        messageKey: openFailureKey(error) ?? 'activity.projectNotCreated',
      })
      throw error
    }
  })
  handle(CHANNELS.projectOpen, async (_event, path) => {
    try {
      return await project.open(parseProjectPath(path))
    } catch (error) {
      const messageKey = openFailureKey(error)
      if (messageKey) record({ level: 'error', topic: 'project', messageKey })
      throw error
    }
  })
  handle(CHANNELS.projectCurrent, () => project.current())
  handle(CHANNELS.projectClose, () => project.close())
  handle(CHANNELS.projectAskLeave, async () => {
    const running = runningJobCount()
    return running === 0 || (await askLeaveWithJobs(askUser, running))
  })
  handle(CHANNELS.projectRevealFile, async (_event, relative) => {
    reveal(join(project.path(), parseFolderPath(relative)))
  })
  handle(CHANNELS.projectFileFacts, async (_event, relative) =>
    fileFactsOf(join(project.path(), parseFolderPath(relative))),
  )
  handle(CHANNELS.projectReadContext, async () => context.read())
  handle(CHANNELS.projectWriteContext, async (_event, cards) => {
    const state = await context.write(parseContextCards(cards))
    broadcast(EVENTS.projectContext, state)
    return state
  })
  handle(CHANNELS.projectRevealFolder, async (_event, path) => {
    const folderPath = parseProjectPath(path)
    if (!exists(folderPath)) {
      record({ level: 'error', topic: 'project', messageKey: 'activity.projectNotRevealed' })
      return false
    }
    reveal(folderPath)
    return true
  })
  handle(CHANNELS.projectRename, async (_event, path, name) => {
    const folderPath = parseProjectPath(path)
    const title = parseProjectTitle(name)
    try {
      const renamed = await project.rename(folderPath, title)
      if (project.current()?.path === folderPath) broadcast(EVENTS.projectChanged, renamed)
      return renamed
    } catch (error) {
      record({ level: 'error', topic: 'project', messageKey: 'activity.projectNotRenamed' })
      throw error
    }
  })
  handle(CHANNELS.projectTrash, async (_event, path) => {
    const folderPath = parseProjectPath(path)
    if (!exists(folderPath)) return 'missing'
    if (!(await holdsAProject(project, folderPath))) {
      record({ level: 'error', topic: 'project', messageKey: 'activity.projectNotTrashed' })
      return 'not-a-project'
    }
    if (project.current()?.path === folderPath) await project.close()
    try {
      await trashFolder(folderPath)
    } catch (error) {
      record({ level: 'error', topic: 'project', messageKey: 'activity.projectNotTrashed' })
      throw error
    }
    record({ level: 'info', topic: 'project', messageKey: 'activity.projectTrashed' })
    return 'trashed'
  })
  const settled = (outcome: FileOutcome): FileOutcome => {
    if (outcome.done.length > 0) broadcast(EVENTS.filesChanged, outcome)
    if (outcome.refused.length > 0) {
      record({
        level: 'error',
        topic: 'project',
        messageKey: 'activity.filesRefused',
        params: { count: outcome.refused.length },
      })
    }
    return outcome
  }
  handle(CHANNELS.projectRenameFile, async (_event, relative, name) =>
    settled(await files.rename(parseFolderPath(relative), parseProjectName(name))),
  )
  handle(CHANNELS.projectMoveFiles, async (_event, paths, folderPath) =>
    settled(await files.move(parseFolderPaths(paths), parseFolderPath(folderPath))),
  )
  registerFileUseHandlers({
    dependents: projectFileDependents({
      documents,
      assetsUnder: folders => project.catalog().assetsUnder(folders),
    }),
    trash: paths => files.trash(paths),
    settled,
    ask: askUser,
  })
  handle(CHANNELS.projectNewFolder, async (_event, folderPath, name) =>
    settled(await files.createFolder(parseFolderPath(folderPath), parseProjectName(name))),
  )
  handle(CHANNELS.projectDuplicateFiles, async (_event, paths) =>
    settled(await files.duplicate(parseFolderPaths(paths))),
  )
  handle(CHANNELS.projectPasteFiles, async (_event, paths, folderPath, cut) => {
    const wanted = parseFolderPaths(paths)
    const into = parseFolderPath(folderPath)
    return settled(
      cut === true ? await files.move(wanted, into) : await files.duplicate(wanted, into),
    )
  })
  handle(CHANNELS.projectUndoFile, async () => settled(await files.undo()))
  handle(CHANNELS.projectRedoFile, async () => settled(await files.redo()))
  handle(CHANNELS.projectFileHistory, async () => files.can())
  handle(CHANNELS.projectRescanState, async () => reconciler.state())
  handle(CHANNELS.projectFolderRoles, async () => project.roles())
  handle(CHANNELS.projectFolderFor, async (_event, role) =>
    project.folderFor(parseFolderRole(role)),
  )
  handle(CHANNELS.projectStopRescan, async () => reconciler.stop())
  handle(CHANNELS.projectListFolder, async (_event, relative, hidden) =>
    folder.list(parseFolderPath(relative), parseHiddenShown(hidden)),
  )
  handle(CHANNELS.projectSearchFolder, async (_event, term, hidden) =>
    folder.search(parseSearchTerm(term), parseHiddenShown(hidden)),
  )
  handle(CHANNELS.projectWalkFolder, async (_event, hidden) =>
    folder.walk(parseHiddenShown(hidden)),
  )
  handle(CHANNELS.projectOpenFile, async (_event, relative) => {
    const failure = await openInSystem(join(project.path(), parseFolderPath(relative)))
    if (failure) record({ level: 'error', topic: 'project', messageKey: 'activity.fileNotOpened' })
    return failure === ''
  })
  handle(CHANNELS.assetsSearch, (_event, query) =>
    orWhenGone(async () => {
      const found = await project.catalog().search(parseAssetQuery(query))
      return found.map(withoutSourcePath)
    }, []),
  )
  handle(CHANNELS.assetsCounts, () => project.catalog().countByType())
  handle(CHANNELS.assetsReveal, async (_event, assetId) => {
    const asset = await project.catalog().find(parseAssetId(assetId))
    const file = asset ? ownFileOf(project.path(), asset) : null
    if (!file) return false
    reveal(file)
    return true
  })
  handle(CHANNELS.assetsAbsent, async (_event, assetIds) => {
    const ids = parseAssetIds(assetIds)
    const catalogue = project.catalog()
    const found = await Promise.all(ids.map(assetId => catalogue.find(assetId)))
    const root = project.path()
    return found
      .filter(asset => asset !== null)
      .filter(asset => {
        const file = ownFileOf(root, asset)
        return file !== null && !exists(file)
      })
      .map(asset => asset.id)
  })
  handle(CHANNELS.assetsPeaks, async (_event, assetId) => {
    const asset = await project.catalog().find(parseAssetId(assetId))
    if (!asset?.peaksPath) return null
    const file = assetFilePath(project.path(), asset.peaksPath)
    if (!file) return null
    try {
      return peaksFromBytes(await readFile(file))
    } catch {
      return null // Like an asset carrying no peaks: the two guards above answer this same null.
    }
  })
  handle(CHANNELS.assetsSaveAudio, async (_event, value) => {
    const request = parseSaveAudio(value)
    const probe = probeWav(request.wav) ?? undefined
    if (request.replaces) {
      return withoutSourcePath(
        await assets.replaceBytes(request.replaces, request.wav, WAV_EXTENSION, { probe }),
      )
    }
    return withoutSourcePath(
      await assets.importFromBytes(
        {
          id: newAssetId(),
          name: request.name,
          type: 'audio',
          extension: WAV_EXTENSION,
          ...(probe ? { probe } : {}),
          ...(request.derivedFrom ? { derivedFrom: request.derivedFrom } : {}),
        },
        request.wav,
      ),
    )
  })
  const landPicture = async (
    request: {
      name: string
      replaces?: string
      derivedFrom?: string
      folder?: string
    },
    bytes: Uint8Array,
    extension: string,
    probe: MediaProbe | undefined,
  ): Promise<Asset> => {
    if (request.replaces) {
      const replaced = await project.catalog().find(request.replaces)
      if (!replaced || !PICTURES.includes(replaced.type))
        throw localizedError('assetNotWritableImage', { name: request.replaces })
      return withoutSourcePath(
        await assets.replaceBytes(request.replaces, bytes, extension, { probe }),
      )
    }
    const source = request.derivedFrom ? await project.catalog().find(request.derivedFrom) : null
    return withoutSourcePath(
      await assets.importFromBytes(
        {
          id: newAssetId(),
          name: request.name,
          type: source?.type ?? 'image',
          extension,
          ...(probe ? { probe } : {}),
          ...(source?.map ? { map: source.map } : {}),
          ...(request.derivedFrom ? { derivedFrom: request.derivedFrom } : {}),
          folder: request.folder,
        },
        bytes,
      ),
    )
  }
  handle(CHANNELS.assetsSavePicture, async (_event, value) => {
    const request = parseSavePicture(value)
    const png = Buffer.from(request.png, 'base64')
    if (!isPngBytes(png)) throw localizedError('pngPayloadInvalid')
    const probe = probePng(png) ?? undefined
    return landPicture(request, png, PNG_EXTENSION, probe)
  })
  handle(CHANNELS.assetsSavePlayerModule, async (_event, value) => {
    const request = parseSavePlayerModule(value)
    return withoutSourcePath(
      await assets.importFromBytes(
        {
          id: newAssetId(),
          name: `${request.name}${PLAYER_MODULE_SEGMENT}`,
          type: 'mesh',
          extension: PLAYER_MODULE_FORMAT,
        },
        Buffer.from(request.gltf, 'utf8'),
      ),
    )
  })
  handle(CHANNELS.assetsSaveLayered, async (_event, value) => {
    const request = parseSaveLayered(value)
    const merged = request.document.surfaces.find(one => one.path === ORA_MERGED_PATH)?.png
    if (!merged || !isPngBytes(merged)) throw localizedError('pngPayloadInvalid')
    const bytes = packOpenRaster(
      request.document,
      oraEnvelopeFor(request, () => new Date().toISOString()),
      oraThumbnailOf(merged),
    )
    const probe = probePng(merged) ?? undefined
    return landPicture(request, bytes, ORA_EXTENSION, probe)
  })
  const replaceGlb = async (assetId: string, glb: Uint8Array, type: AssetType): Promise<Asset> => {
    const replaced = await project.catalog().find(assetId)
    if (replaced?.type !== type)
      throw localizedError('assetOverwriteTypeMismatch', { name: assetId, type })
    return withoutSourcePath(await assets.replaceBytes(assetId, glb, '.glb'))
  }
  handle(CHANNELS.assetsSaveMesh, async (_event, value) => {
    const request = parseSaveMesh(value)
    if (!glbChunksOf(request.glb)) throw localizedError('gltfPayloadInvalid')
    return replaceGlb(request.replaces, request.glb, 'mesh')
  })
  handle(CHANNELS.assetsSaveConverted, async (_event, value) =>
    saveConverted(parseSaveConverted(value), project, record),
  )
  handle(CHANNELS.animationThumbnailModel, async () => {
    return new Uint8Array(
      await readFile(join(bundledCharacters(resourcesRoot()), bundledCharacterFile('medium'))),
    )
  })
  handle(CHANNELS.animationThumbnailSave, async (_event, request) => {
    const root = project.path()
    const catalog = project.catalog()
    await saveAnimationThumbnail(
      request,
      root,
      id => catalog.find(id),
      write => catalog.setAnimationPoster(write),
    )
  })
  handle(CHANNELS.assetsSaveAnimation, async (_event, value) => {
    const request = parseSaveAnimation(value)
    if (!glbChunksOf(request.glb)) throw localizedError('gltfPayloadInvalid')
    if (request.replaces) return replaceGlb(request.replaces, request.glb, 'animation')
    return withoutSourcePath(
      await assets.importFromBytes(
        {
          id: newAssetId(),
          name: request.name,
          type: 'animation',
          extension: '.glb',
          ...(request.derivedFrom ? { derivedFrom: request.derivedFrom } : {}),
        },
        request.glb,
      ),
    )
  })
  handle(CHANNELS.assetsReadLayered, async (_event, value) => {
    const asset = await project.catalog().find(parseAssetId(value))
    const file = asset ? ownFileOf(project.path(), asset) : null
    if (!file?.toLowerCase().endsWith(ORA_EXTENSION)) return null
    try {
      return unpackOpenRaster(await readFile(file))
    } catch {
      return null // Like a file that is not layered: the guard above answers this same null.
    }
  })
  registerResourceHandlers({ assets, project, newAssetId })
  handle(CHANNELS.assetsExtractTextures, async (_event, value) => {
    const assetId = parseAssetId(value)
    const source = await project.catalog().find(assetId)
    if (source?.type !== 'mesh') throw localizedError('assetNotMesh', { name: assetId })
    return (await extractTextures(source)).map(withoutSourcePath)
  })
  handle(CHANNELS.gameRead, () => game.read())
  handle(CHANNELS.gameWrite, (_event, manifest) => game.write(parseGame(manifest)))
  handle(CHANNELS.gameScripts, () => scripts.list())
  handle(CHANNELS.gameWriteScript, (_event, path, source) =>
    scripts.write(parseFolderPath(path), String(source)),
  )
  handle(CHANNELS.documentList, () => orWhenGone(() => documents.list(), []))
  handle(CHANNELS.documentOpened, (_event, path, kind) => {
    const open = project.current()
    if (!open) return Promise.resolve()
    const inside = parseFolderPath(path)
    const stored = settings.read().storage
    const [first] = stored.recentDocuments
    if (first?.project === open.path && first.path === inside) return Promise.resolve()
    settings.write({
      storage: {
        recentDocuments: withRecentDocument(stored.recentDocuments, {
          project: open.path,
          path: inside,
          kind: parseDocumentKind(kind),
          openedAt: new Date().toISOString(),
        }),
      },
    })
    return Promise.resolve()
  })
  handle(CHANNELS.documentRead, (_event, id, kind, path) =>
    documents.read(
      parseDocumentId(id),
      parseDocumentKind(kind),
      parseDocumentPlace(path === undefined ? undefined : { path })?.path,
    ),
  )
  handle(CHANNELS.documentWrite, async (_event, id, kind, draft, force, place) => {
    const written = await documents.write(
      parseDocumentId(id),
      parseDocumentKind(kind),
      parseDocumentDraft(draft),
      parseForceWrite(force),
      parseDocumentPlace(place),
    )
    if (written === 'written') project.touch()
    return written
  })
  handle(CHANNELS.documentRename, async (_event, id, kind, title) => {
    const renamed = await documents.rename(
      parseDocumentId(id),
      parseDocumentKind(kind),
      parseDocumentTitle(title),
    )
    project.touch()
    return renamed
  })
  handle(CHANNELS.documentRemove, (_event, id, kind) =>
    documents.remove(parseDocumentId(id), parseDocumentKind(kind)),
  )
  registerCopiesHandlers({ project, media })
  registerGatherHandlers({ project, documents, exists })
  registerRecoveryHandlers(() => project.path())
  // The four routes that only raise a question live apart — see `askHandlers.ts`.
  registerAskHandlers(askUser)
}
