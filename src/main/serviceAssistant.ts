import { ASSISTANT_MODEL_ID } from '@shared/domain/assistant'
import { ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { projectPickerFolder } from '@shared/domain/project'
import { composedContext } from '@shared/domain/projectContext'
import { THUMBNAIL_SIZE } from '@shared/domain/project'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import { EVENTS } from '@shared/ipc'
import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bundledAnimationFile } from './animations'
import { createAssetResolvers } from './assets/assetResolvers'
import { createCaptioner } from './assets/autoCaption'
import { posterFileOf, serveAssets } from './assets/protocol'
import { createAssetText } from './assistant/assetText'
import { createLocalBrain } from './assistant/brainLocal'
import { createProviderBrain } from './assistant/brainProvider'
import { machineFolders } from './assistant/machineFolders'
import { providerLimits } from './assistant/providerLimits'
import { createRoutedBrain } from './assistant/brainRouted'
import { describeStudio } from './assistant/studioState'
import { parseSnapshot } from './assistant/validation'
import { bundledFile } from './bundledFile'
import { createFavorites } from './favorites/store'
import { sendTo } from './ipc/broadcast'
import { createRemoteActions } from './mcp/asking'
import { createVisualCapturePort } from './mission/visualCapture'
import { renderThumbnail } from './media/renderThumbnail'
import { createThumbnailCache } from './project/thumbnailCache'
import { orWhenGone, type ProjectStore } from './project/store'
import {
  bundledAnimations,
  bundledCharacters,
  bundledModels,
  bundledTemplates,
  bundledTextures,
  resourcesRoot,
} from './resources'
import { createStyles } from './styles/store'
import { studioWindow } from './window/windows'
import type { SettingsStore } from './settings/store'
import type { ClientProvider } from './provider/client'
import type { JobManager } from './provider/jobManager'
import type { PromptAssist } from './provider/promptAssist'
import type { FileOps } from './project/fileOps'
import type { ActivityLog } from './project/activityLog'
import type { ProjectContextStore } from './project/context'
import type { MemoryVectors } from './memory/memoryVectors'
import type { LocalRuntimes } from './ai/localRuntimes'
import type { AiManager } from './ai/manager'
import type { LocalModel } from '@shared/domain/localModel'
import type { AssistantBrain } from './assistant/brainPort'
import { createActionFinder, type ActionSearchService } from './actionIndex/actionSearchService'
import type { WorkspaceId } from '@shared/domain/workspace'
import { orElse } from '@shared/promises'
import { catalogOf } from './provider/modelCatalog'

type AssistantDeps = {
  settings: SettingsStore
  client: ClientProvider
  jobs: JobManager
  prompts: PromptAssist
  files: FileOps
  journal: ActivityLog
  project: ProjectStore
  context: ProjectContextStore
  memoryVectors: MemoryVectors
  actionIndex: ActionSearchService
  runtimes: LocalRuntimes
  ai: AiManager
  modelOf: (id: string) => LocalModel | null
  notReady: () => Promise<readonly WorkspaceId[]>
  clouds: Record<string, { brain: () => AssistantBrain }>
  assistQueue: { run: Parameters<typeof createCaptioner>[0]['queue'] }
  concurrency: () => number
}

export function createAssistantBrains(deps: AssistantDeps) {
  const providerBrain = createProviderBrain({
    run: (body, signal) =>
      deps.jobs.run({ id: ASSISTANT_MODEL_ID }, ASSISTANT_MODEL_ID, body, signal),
    limits: providerLimits(
      async () =>
        (await catalogOf(deps.client.require()).retrieve(ASSISTANT_MODEL_ID)).model.inputs,
    ),
    readText: createAssetText({
      retrieve: async id => (await deps.client.require().assets.retrieve(id)).asset,
      download: async url => await (await fetch(url)).text(),
    }),
    model: () => deps.settings.read().assistant.model,
    notReady: deps.notReady,
  })
  let snapshot = async (): Promise<StudioSnapshot | null> => null
  const remoteActions = createRemoteActions({
    send: request => sendTo(studioWindow(), EVENTS.assistantAction, request),
    findActions: createActionFinder({
      search: (...search) => deps.actionIndex.search(...search),
      snapshot: () => snapshot(),
    }),
  })
  const visualCapture = createVisualCapturePort({
    send: request => sendTo(studioWindow(), EVENTS.assistantVisualCapture, request),
    now: () => new Date().toISOString(),
  })
  snapshot = async () => {
    const outcome = await remoteActions.run({ action: 'studio.state', input: {} })
    return outcome.ok ? parseSnapshot(outcome.data) : null
  }
  const brain = createRoutedBrain({
    providerOf: () => deps.ai.providerOf(ASSISTANT_ROLE),
    modelOf: deps.modelOf,
    localBrain: model => {
      const chat = deps.runtimes[model.loader]?.chat
      return !chat || model.contextTokens === undefined
        ? null
        : createLocalBrain({
            chat,
            modelId: model.id,
            contextTokens: model.contextTokens,
            notReady: deps.notReady,
          })
    },
    cloudBrain: id => deps.clouds[id]?.brain() ?? null,
    contextOf: async () => composedContext((await deps.context.read()).cards),
    stateOf: async () => {
      const current = await snapshot()
      return current ? describeStudio(current) : ''
    },
    memoriesOf: () => deps.memoryVectors.held('project'),
    foldersOf: () => {
      const { projectsFolder, recentProjects } = deps.settings.read().storage
      return machineFolders(
        name => app.getPath(name),
        projectPickerFolder(projectsFolder, recentProjects),
      )
    },
  })
  return { providerBrain, remoteActions, visualCapture, brain, snapshot }
}

export function createAssistantPresentation(deps: AssistantDeps) {
  const captioner = createCaptioner({
    queue: deps.assistQueue.run,
    caption: images => deps.prompts.caption(images),
    rename: deps.files.renameAssetToCaption,
    record: report => deps.journal.record(report),
    enabled: () => deps.settings.read().generation.captionArrivals,
  })
  const thumbnails = createThumbnailCache({
    projectPath: () => deps.project.current()?.path ?? null,
    render: async (file, relative) => {
      const drawn = await renderThumbnail(file, THUMBNAIL_SIZE)
      if (drawn) return drawn
      const current = deps.project.current()
      if (!current) return null
      const [asset] = await orWhenGone(
        () => deps.project.catalog().search({ path: relative, limit: 1 }),
        [],
      )
      const poster = asset ? posterFileOf(current.path, asset) : null
      return poster ? await orElse(readFile(poster), null) : null
    },
    concurrency: deps.concurrency,
  })
  const favorites = createFavorites(join(app.getPath('userData'), 'favorites'))
  const styles = createStyles(() => app.getPath('userData'))
  serveAssets(
    createAssetResolvers({
      projectPath: () => deps.project.current()?.path ?? null,
      findAsset: id => deps.project.catalog().find(id),
      favouriteThumbnail: id => favorites.thumbnailPath(id),
      thumbnailOf: relative => thumbnails.of(relative),
      bundledAnimation: id => bundledAnimationFile(bundledAnimations(resourcesRoot()), id),
      bundledTemplate: file => bundledFile(bundledTemplates(resourcesRoot()), file),
      bundledModel: file => bundledFile(bundledModels(resourcesRoot()), file),
      bundledTexture: file => bundledFile(bundledTextures(resourcesRoot()), file),
      bundledCharacter: file => bundledFile(bundledCharacters(resourcesRoot()), file),
    }),
  )
  return { captioner, favorites, styles }
}
