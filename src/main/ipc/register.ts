import { randomUUID } from 'node:crypto'
import { mcpStateOf } from '@main/mcp/endpoint'
import { join } from 'node:path'
import { app } from 'electron'
import { registerAssetHandlers } from '@main/assets/handlers'
import { registerBundledTextureHandlers } from '@main/assets/bundledTextures'
import { registerBundledCharacterHandlers } from '@main/assets/bundledCharacters'
import { bundledCharacters, bundledTextures, resourcesRoot } from '@main/resources'
import { registerDiagnosticsHandlers } from '@main/diagnostics/handlers'
import { createInstalledFonts } from '@main/fonts/disk'
import { registerAnimationHandlers } from '@main/animations'
import { registerFontHandlers } from '@main/fonts/handlers'
import { registerFavoriteHandlers } from '@main/favorites/handlers'
import { registerStyleHandlers } from '@main/styles/handlers'
import { readFavoriteThumbnail } from '@main/favorites/thumbnail'
import { registerAssistantHandlers } from '@main/assistant/handlers'
import { registerMemoryHandlers } from '@main/memory/handlers'
import { registerAiHandlers } from '@main/ai/handlers'
import { registerAutoRigHandlers } from '@main/ai/autoRigHandlers'
import { registerSmartSelectionHandlers } from '@main/ai/smartSelectionHandlers'
import { registerDictationHandlers } from '@main/dictation/handlers'
import { registerMediaHandlers } from '@main/media/handlers'
import { registerMenuHandlers } from '@main/menu'
import { createCredentialVault } from '@main/git/credentials'
import { registerGitHandlers } from '@main/git/handlers'
import { createElectronAdapter } from '@main/settings/adapter'
import { registerProjectHandlers } from '@main/project/handlers'
import { registerAnimationGraphHandlers } from '@main/project/animationGraphHandlers'
import { registerInputMapHandlers } from '@main/project/inputMapHandlers'
import { registerProviderHandlers } from '@main/provider/handlers'
import { TRANSLATIONS } from '@shared/i18n'
import { CURRENT } from '@main/logFile'
import { runSettingAction } from '@main/settings/actions'
import { registerSettingsHandlers } from '@main/settings/handlers'
import { registerWindowControls } from '@main/window/controls'
import { registerContextMenu } from '@main/window/contextMenu'
import { registerDialogHandlers } from '@main/window/dialogs'
import { registerSceneHandlers } from '@main/scene/export'
import { registerPostPresetHandlers } from '@main/scene/postPreset'
import { registerExportHandlers } from '@main/export/folder'
import { registerGameExportHandler } from '@main/export/game'
import { bundledAnimationFile } from '@main/animations'
import { bundledAnimations } from '@main/resources'
import { registerMontageHandlers } from '@main/export/montage'
import { createRunningTasks, registerTaskCancelHandler } from '@main/task/runningTasks'
import { registerMontageImportHandlers } from '@main/import/montageImport'
import { registerRenderHandlers } from '@main/render/handlers'
import { registerNewsHandlers } from '@main/news/handlers'
import { registerUpdateHandlers } from '@main/update/handlers'
import { registerFileInfoWindow } from '@main/window/fileInfo'
import { registerHelpWindows } from '@main/window/help'
import { registerGameWindow } from '@main/window/gameWindow'
import { registerPlayerModuleWindow } from '@main/window/playerModuleWindow'
import { registerMirrorWindow } from '@main/window/mirror'
import { registerNewDocumentWindow } from '@main/window/newDocument'
import { registerExternalFileHandlers } from '@main/externalFiles'
import { registerMissionHandlers } from '@main/mission/handlers'
import { markSettingsPending, openSettingsWindow } from '@main/window/windows'
import type { Services } from '@main/services'

function registerWindowIpc(): void {
  registerExternalFileHandlers()
  registerWindowControls()
  registerMirrorWindow()
  registerGameWindow()
  registerPlayerModuleWindow()
  registerHelpWindows()
  registerFileInfoWindow()
  registerNewDocumentWindow()
  registerContextMenu()
  registerMenuHandlers()
}

function registerSettingsIpc(services: Services): void {
  registerSettingsHandlers({
    ...services,
    openSettings: openSettingsWindow,
    setPending: markSettingsPending,
    mcpState: () => mcpStateOf(services.mcp.endpoint()),
    runAction: runSettingAction({
      settings: services.settings,
      settingsPath: services.settings.path,
      logFile: () => join(app.getPath('logs'), CURRENT),
      mcpLaunch: services.mcpLaunch,
      onResolveMissing: () => {
        const t = TRANSLATIONS[services.language()].settings.installResolveBridge
        void services.askUser({
          message: t.missing,
          detail: t.missingDetail,
          buttons: [t.missingOk],
          defaultId: 0,
          cancelId: 0,
        })
      },
    }),
  })
}

function registerProjectIpc(services: Services): void {
  registerProjectHandlers({ ...services, record: entry => services.journal.record(entry) })
  registerInputMapHandlers(services.inputMaps)
  registerAnimationGraphHandlers(services.animationGraphs)
}

function registerGitIpc(services: Services): void {
  const git = registerGitHandlers({
    // The same file and the same keychain the API key already uses. A second store would be a
    // second place a secret can be left behind on a machine somebody stops trusting.
    vault: createCredentialVault(createElectronAdapter()),
    project: services.project,
    binaryPath: () => services.settings.read().git.binary || undefined,
    // Both halves or neither: git wants a name AND an address, and handing it one would make
    // every commit fail on the other. Left out, git reads the machine's own configuration.
    identity: () => {
      const { userName, userEmail } = services.settings.read().git
      return userName && userEmail ? { name: userName, email: userEmail } : undefined
    },
  })
  services.settings.subscribe(() => git.forget())
}

function registerCreativeIpc(
  services: Services,
  running: ReturnType<typeof createRunningTasks>,
): void {
  registerMissionHandlers(services.missions, services.missionRuntime, services.studioEvents)
  registerStyleHandlers(services.styles)
  registerMediaHandlers({ ...services, running })
  registerAssistantHandlers({
    brain: services.assistant,
    settleAction: services.remoteActions.settle,
    settleVisualCapture: services.visualCapture.settle,
    running,
    journal: () => services.journal,
    transcribe: services.transcribe,
    said: services.said,
    // The same interception an MCP client's call goes through — `createRemoteActions`.
    findActions: query => services.remoteActions.run({ action: 'actions.find', input: { query } }),
  })
  registerMemoryHandlers({ host: services.memory, vectors: services.memoryVectors })
  registerAiHandlers({ manager: services.ai, addOwnModel: services.addOwnAiModel, running })
  registerAutoRigHandlers(services.autoRig, running)
  registerSmartSelectionHandlers(services.smartSelection, running)
  registerDictationHandlers({
    session: services.dictation,
    openPrivacySettings: services.openMicrophoneSettings,
  })
  registerDialogHandlers(services)
  registerSceneHandlers(services)
  registerPostPresetHandlers(services)
  registerExportHandlers(services)
  registerGameExportHandler({
    ...services,
    // The same folder the asset scheme serves `animation://` from — see `serviceAssistant`.
    bundledAnimation: name => bundledAnimationFile(bundledAnimations(resourcesRoot()), name),
  })
  registerMontageHandlers({ ...services, running })
  registerMontageImportHandlers({ ...services, running })
  registerTaskCancelHandler(running)
  registerRenderHandlers({
    ...services,
    newId: () => `render_${randomUUID()}`,
    encode: services.encodeVideo,
  })
}

/** Single place where the IPC surface is wired. Registered once, before any window loads. */
export function registerIpc(services: Services): void {
  registerWindowIpc()
  registerDiagnosticsHandlers(() => services.journal)
  registerSettingsIpc(services)
  registerProviderHandlers(services)
  registerProjectIpc(services)
  registerBundledTextureHandlers({
    catalog: () => services.project.catalog(),
    assets: services.assets,
    newAssetId: services.newAssetId,
    folder: () => bundledTextures(resourcesRoot()),
    projectPath: () => services.project.path(),
    roles: () => services.project.roles(),
    exists: services.exists,
  })
  registerBundledCharacterHandlers({
    catalog: () => services.project.catalog(),
    assets: services.assets,
    newAssetId: services.newAssetId,
    folder: () => bundledCharacters(resourcesRoot()),
    projectPath: () => services.project.path(),
    exists: services.exists,
  })
  registerGitIpc(services)
  registerAssetHandlers({
    projectPath: () => services.project.path(),
    catalog: () => services.project.catalog(),
    remote: services.remote,
    cloud: services.cloud,
    removeFile: services.removeAssetFile,
    renameFile: services.files.renameAsset,
    activeOwnerId: services.ownerScope.current,
    journal: () => services.journal,
    captionArrivals: services.captionArrivals,
    describeAssets: services.describeAssets,
  })
  registerFavoriteHandlers({
    favorites: services.favorites,
    project: services.project,
    readThumbnail: readFavoriteThumbnail,
    newFavoriteId: () => `favorite_${randomUUID()}`,
    now: () => new Date().toISOString(),
  })
  // One table for every long task of this process: the caller names it, this side runs it under
  // that name, and the stop reaches it by the same name. Built here so no handler owns the door.
  const running = createRunningTasks()
  registerCreativeIpc(services, running)
  registerNewsHandlers(services.news)
  registerUpdateHandlers(services)
  // Built here rather than held by `Services`: the index reads nothing until a picker asks, so
  // it costs a closure at startup and a folder walk the first time someone opens the list.
  registerFontHandlers(createInstalledFonts())
  registerAnimationHandlers()
}
