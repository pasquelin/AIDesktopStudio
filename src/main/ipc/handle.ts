import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { CHANNELS, StudioBridge } from '@shared/ipc'

/**
 * Pairs each channel with the bridge method it must implement. This table is what makes the
 * boundary typed on BOTH sides: without it, `CHANNELS` is a bag of strings and
 * `StudioBridge` a bag of functions, and a handler could answer `settings:read` with a
 * window state — failing only at runtime, inside a component.
 */
type ChannelMethod = {
  [CHANNELS.animationThumbnailModel]: StudioBridge['assets']['animationThumbnailModel']
  [CHANNELS.animationThumbnailSave]: StudioBridge['assets']['saveAnimationThumbnail']
  [CHANNELS.missionsWatch]: StudioBridge['missions']['watch']
  [CHANNELS.missionsCreate]: StudioBridge['missions']['create']
  [CHANNELS.missionsResume]: StudioBridge['missions']['resume']
  [CHANNELS.settingsRead]: StudioBridge['settings']['read']
  [CHANNELS.settingsWrite]: StudioBridge['settings']['write']
  [CHANNELS.settingsForgetProject]: StudioBridge['settings']['forgetProject']
  [CHANNELS.settingsMoveProject]: StudioBridge['settings']['moveProject']
  [CHANNELS.settingsAuthState]: StudioBridge['settings']['authState']
  [CHANNELS.mcpState]: StudioBridge['mcp']['state']
  [CHANNELS.settingsOpen]: StudioBridge['settings']['open']
  [CHANNELS.settingsRunAction]: StudioBridge['settings']['runAction']
  [CHANNELS.settingsPending]: StudioBridge['settings']['setPending']

  [CHANNELS.accountsList]: StudioBridge['accounts']['list']
  [CHANNELS.accountsAdd]: StudioBridge['accounts']['add']
  [CHANNELS.accountsRename]: StudioBridge['accounts']['rename']
  [CHANNELS.accountsRemove]: StudioBridge['accounts']['remove']
  [CHANNELS.accountsActivate]: StudioBridge['accounts']['activate']
  [CHANNELS.accountsCredits]: StudioBridge['accounts']['credits']

  [CHANNELS.providerSearchModels]: StudioBridge['provider']['searchModels']
  [CHANNELS.providerModelPreviews]: StudioBridge['provider']['modelPreviews']
  [CHANNELS.providerDescribeModel]: StudioBridge['provider']['describeModel']
  [CHANNELS.providerPlan]: StudioBridge['provider']['plan']
  [CHANNELS.providerSuggestPrompts]: StudioBridge['provider']['suggestPrompts']
  [CHANNELS.providerTranslatePrompt]: StudioBridge['provider']['translatePrompt']
  [CHANNELS.providerDescribeStyle]: StudioBridge['provider']['describeStyle']
  [CHANNELS.providerGenerate]: StudioBridge['provider']['generate']
  [CHANNELS.providerEstimateCost]: StudioBridge['provider']['estimateCost']
  [CHANNELS.providerUploadAsset]: StudioBridge['provider']['uploadAsset']
  [CHANNELS.providerCancelJob]: StudioBridge['provider']['cancelJob']
  [CHANNELS.providerListJobs]: StudioBridge['provider']['listJobs']
  [CHANNELS.providerUsageReport]: StudioBridge['provider']['usageReport']
  [CHANNELS.providerUsageEvents]: StudioBridge['provider']['usageEvents']

  [CHANNELS.projectCreate]: StudioBridge['project']['create']
  [CHANNELS.projectOpen]: StudioBridge['project']['open']
  [CHANNELS.projectCurrent]: StudioBridge['project']['current']
  [CHANNELS.projectClose]: StudioBridge['project']['close']
  [CHANNELS.projectAskLeave]: StudioBridge['project']['askLeave']
  [CHANNELS.projectListFolder]: StudioBridge['project']['listFolder']
  [CHANNELS.projectSearchFolder]: StudioBridge['project']['searchFolder']
  [CHANNELS.projectWalkFolder]: StudioBridge['project']['walkFolder']
  [CHANNELS.projectOpenFile]: StudioBridge['project']['openFile']
  [CHANNELS.projectFileFacts]: StudioBridge['project']['fileFacts']
  [CHANNELS.projectFolderRoles]: StudioBridge['project']['folderRoles']
  [CHANNELS.projectFolderFor]: StudioBridge['project']['folderFor']
  [CHANNELS.memoryList]: StudioBridge['memory']['list']
  [CHANNELS.memoryRecall]: StudioBridge['memory']['recall']
  [CHANNELS.memoryRead]: StudioBridge['memory']['read']
  [CHANNELS.memoryRemember]: StudioBridge['memory']['remember']
  [CHANNELS.memoryAmend]: StudioBridge['memory']['amend']
  [CHANNELS.memoryForget]: StudioBridge['memory']['forget']
  [CHANNELS.memoryRebuild]: StudioBridge['memory']['rebuild']
  [CHANNELS.memoryReset]: StudioBridge['memory']['reset']
  [CHANNELS.memoryPending]: StudioBridge['memory']['pending']
  [CHANNELS.memoryIndex]: StudioBridge['memory']['index']
  [CHANNELS.memoryStopIndex]: StudioBridge['memory']['stopIndex']
  [CHANNELS.memoryCompact]: StudioBridge['memory']['compact']
  [CHANNELS.projectReadContext]: StudioBridge['project']['readContext']
  [CHANNELS.projectWriteContext]: StudioBridge['project']['writeContext']
  [CHANNELS.projectExport]: StudioBridge['project']['exportInto']
  [CHANNELS.gameExport]: StudioBridge['game']['export']
  [CHANNELS.projectRevealFile]: StudioBridge['project']['revealFile']
  [CHANNELS.projectRevealFolder]: StudioBridge['project']['revealFolder']
  [CHANNELS.projectRename]: StudioBridge['project']['rename']
  [CHANNELS.projectTrash]: StudioBridge['project']['trash']
  [CHANNELS.projectConfirmTrash]: StudioBridge['project']['confirmTrash']
  [CHANNELS.projectRenameFile]: StudioBridge['project']['renameFile']
  [CHANNELS.projectMoveFiles]: StudioBridge['project']['moveFiles']
  [CHANNELS.projectTrashFiles]: StudioBridge['project']['trashFiles']
  [CHANNELS.projectNewFolder]: StudioBridge['project']['newFolder']
  [CHANNELS.projectDuplicateFiles]: StudioBridge['project']['duplicateFiles']
  [CHANNELS.projectPasteFiles]: StudioBridge['project']['pasteFiles']
  [CHANNELS.projectUndoFile]: StudioBridge['project']['undoFile']
  [CHANNELS.projectRedoFile]: StudioBridge['project']['redoFile']
  [CHANNELS.projectFileHistory]: StudioBridge['project']['fileHistory']
  [CHANNELS.projectRescanState]: StudioBridge['project']['rescanState']
  [CHANNELS.projectStopRescan]: StudioBridge['project']['stopRescan']

  [CHANNELS.gitRead]: StudioBridge['git']['read']
  [CHANNELS.gitInit]: StudioBridge['git']['init']
  [CHANNELS.gitStage]: StudioBridge['git']['stage']
  [CHANNELS.gitUnstage]: StudioBridge['git']['unstage']
  [CHANNELS.gitRestore]: StudioBridge['git']['restore']
  [CHANNELS.gitCommit]: StudioBridge['git']['commit']
  [CHANNELS.gitBranches]: StudioBridge['git']['branches']
  [CHANNELS.gitCreateBranch]: StudioBridge['git']['createBranch']
  [CHANNELS.gitCheckout]: StudioBridge['git']['checkout']
  [CHANNELS.gitLog]: StudioBridge['git']['log']
  [CHANNELS.gitCommitFiles]: StudioBridge['git']['commitFiles']
  [CHANNELS.gitDiff]: StudioBridge['git']['diff']
  [CHANNELS.gitBytes]: StudioBridge['git']['bytes']
  [CHANNELS.gitRemotes]: StudioBridge['git']['remotes']
  [CHANNELS.gitAddRemote]: StudioBridge['git']['addRemote']
  [CHANNELS.gitFetch]: StudioBridge['git']['fetch']
  [CHANNELS.gitPull]: StudioBridge['git']['pull']
  [CHANNELS.gitPush]: StudioBridge['git']['push']
  [CHANNELS.gitResolve]: StudioBridge['git']['resolve']
  [CHANNELS.gitAbortMerge]: StudioBridge['git']['abortMerge']
  [CHANNELS.gitStash]: StudioBridge['git']['stash']
  [CHANNELS.gitStashes]: StudioBridge['git']['stashes']
  [CHANNELS.gitStashPop]: StudioBridge['git']['stashPop']
  [CHANNELS.gitStashDrop]: StudioBridge['git']['stashDrop']
  [CHANNELS.gitTag]: StudioBridge['git']['tag']
  [CHANNELS.gitHasCredentials]: StudioBridge['git']['hasCredentials']
  [CHANNELS.gitSetCredentials]: StudioBridge['git']['setCredentials']
  [CHANNELS.gitClearCredentials]: StudioBridge['git']['clearCredentials']

  [CHANNELS.dialogPickPath]: StudioBridge['dialog']['pickPath']
  [CHANNELS.dialogExportPicture]: StudioBridge['dialog']['exportPicture']

  [CHANNELS.gameRead]: StudioBridge['game']['read']
  [CHANNELS.gameWrite]: StudioBridge['game']['write']
  [CHANNELS.gameScripts]: StudioBridge['game']['scripts']
  [CHANNELS.gameWriteScript]: StudioBridge['game']['writeScript']

  [CHANNELS.inputMapList]: StudioBridge['inputMaps']['list']
  [CHANNELS.inputMapRead]: StudioBridge['inputMaps']['read']
  [CHANNELS.inputMapWrite]: StudioBridge['inputMaps']['write']
  [CHANNELS.animationGraphList]: StudioBridge['animationGraphs']['list']
  [CHANNELS.animationGraphRead]: StudioBridge['animationGraphs']['read']
  [CHANNELS.animationGraphWrite]: StudioBridge['animationGraphs']['write']

  [CHANNELS.documentList]: StudioBridge['documents']['list']
  [CHANNELS.documentRead]: StudioBridge['documents']['read']
  [CHANNELS.documentWrite]: StudioBridge['documents']['write']
  [CHANNELS.documentRename]: StudioBridge['documents']['rename']
  [CHANNELS.documentRemove]: StudioBridge['documents']['remove']
  [CHANNELS.documentOpened]: StudioBridge['documents']['opened']
  [CHANNELS.documentConfirmClose]: StudioBridge['documents']['confirmClose']
  [CHANNELS.documentConfirmDelete]: StudioBridge['documents']['confirmDelete']
  [CHANNELS.documentConfirmOverwrite]: StudioBridge['documents']['confirmOverwrite']
  [CHANNELS.documentConfirmFlatten]: StudioBridge['documents']['confirmFlatten']
  [CHANNELS.documentConfirmSaveElsewhere]: StudioBridge['documents']['confirmSaveElsewhere']

  [CHANNELS.recoveryWrite]: StudioBridge['recovery']['write']
  [CHANNELS.recoveryList]: StudioBridge['recovery']['list']
  [CHANNELS.recoveryRead]: StudioBridge['recovery']['read']
  [CHANNELS.recoveryClear]: StudioBridge['recovery']['clear']
  [CHANNELS.recoveryConfirmRestore]: StudioBridge['recovery']['confirmRestore']

  [CHANNELS.assetsSearch]: StudioBridge['assets']['search']
  [CHANNELS.assetsCounts]: StudioBridge['assets']['counts']
  [CHANNELS.assetsPeaks]: StudioBridge['assets']['peaks']
  [CHANNELS.assetsReveal]: StudioBridge['assets']['reveal']
  [CHANNELS.assetsAbsent]: StudioBridge['assets']['absent']
  [CHANNELS.assetsSaveAudio]: StudioBridge['assets']['saveAudio']
  [CHANNELS.assetsSavePicture]: StudioBridge['assets']['savePicture']
  [CHANNELS.assetsSavePlayerModule]: StudioBridge['assets']['savePlayerModule']
  [CHANNELS.assetsSaveLayered]: StudioBridge['assets']['saveLayered']
  [CHANNELS.assetsSaveMesh]: StudioBridge['assets']['saveMesh']
  [CHANNELS.assetsSaveConverted]: StudioBridge['assets']['saveConverted']
  [CHANNELS.assetsSaveAnimation]: StudioBridge['assets']['saveAnimation']
  [CHANNELS.assetsReadLayered]: StudioBridge['assets']['readLayered']
  [CHANNELS.assetsSaveTexture]: StudioBridge['assets']['saveTexture']
  [CHANNELS.assetsShowResource]: StudioBridge['assets']['showResource']
  [CHANNELS.texturesInstallBundled]: StudioBridge['assets']['installBundledTextures']
  [CHANNELS.charactersInstallBundled]: StudioBridge['assets']['installBundledCharacter']
  [CHANNELS.assetsExtractTextures]: StudioBridge['assets']['extractTextures']
  [CHANNELS.assetsUpdate]: StudioBridge['assets']['update']
  [CHANNELS.assetsRemove]: StudioBridge['assets']['remove']
  [CHANNELS.assetsDescribe]: StudioBridge['assets']['describe']
  [CHANNELS.smartSelectionRun]: StudioBridge['smartSelection']['run']
  [CHANNELS.cloudBrowse]: StudioBridge['cloud']['browse']
  [CHANNELS.cloudExplore]: StudioBridge['cloud']['explore']
  [CHANNELS.cloudSimilar]: StudioBridge['cloud']['similar']
  [CHANNELS.cloudPull]: StudioBridge['cloud']['pull']
  [CHANNELS.cloudPush]: StudioBridge['cloud']['push']
  [CHANNELS.cloudPlan]: StudioBridge['cloud']['plan']

  [CHANNELS.favoritesList]: StudioBridge['favorites']['list']
  [CHANNELS.favoritesPin]: StudioBridge['favorites']['pin']
  [CHANNELS.favoritesUnpin]: StudioBridge['favorites']['unpin']

  [CHANNELS.stylesList]: StudioBridge['styles']['list']
  [CHANNELS.stylesSave]: StudioBridge['styles']['save']
  [CHANNELS.stylesRename]: StudioBridge['styles']['rename']
  [CHANNELS.stylesRemove]: StudioBridge['styles']['remove']

  [CHANNELS.activityRead]: StudioBridge['activity']['read']

  [CHANNELS.sceneExport]: StudioBridge['scene']['export']
  [CHANNELS.postExport]: StudioBridge['post']['export']
  [CHANNELS.postImport]: StudioBridge['post']['import']
  [CHANNELS.montageExport]: StudioBridge['montage']['export']
  [CHANNELS.montageImport]: StudioBridge['montage']['import']
  [CHANNELS.montageStems]: StudioBridge['montage']['stems']

  [CHANNELS.renderStart]: StudioBridge['render']['start']
  [CHANNELS.renderFrame]: StudioBridge['render']['frame']
  [CHANNELS.renderFinish]: StudioBridge['render']['finish']
  [CHANNELS.renderCancel]: StudioBridge['render']['cancel']

  [CHANNELS.materialExport]: StudioBridge['material']['export']
  [CHANNELS.skyboxExport]: StudioBridge['skybox']['export']
  [CHANNELS.taskCancel]: StudioBridge['tasks']['cancel']

  [CHANNELS.fontsList]: StudioBridge['fonts']['list']
  [CHANNELS.fontsRead]: StudioBridge['fonts']['read']

  [CHANNELS.animationsList]: StudioBridge['animations']['list']

  [CHANNELS.diagnosticsReport]: StudioBridge['diagnostics']['report']
  [CHANNELS.diagnosticsTrace]: StudioBridge['diagnostics']['trace']

  [CHANNELS.mediaAdopt]: StudioBridge['media']['adopt']
  [CHANNELS.mediaIngest]: StudioBridge['media']['ingest']
  [CHANNELS.mediaLink]: StudioBridge['media']['link']
  [CHANNELS.mediaIngestPaths]: StudioBridge['media']['ingestPaths']
  [CHANNELS.mediaImportPicked]: StudioBridge['media']['importPicked']
  [CHANNELS.mediaCancel]: StudioBridge['media']['cancel']
  [CHANNELS.mediaAvailable]: StudioBridge['media']['capabilities']

  [CHANNELS.assistantThink]: StudioBridge['assistant']['think']
  [CHANNELS.assistantStop]: StudioBridge['assistant']['stop']
  [CHANNELS.assistantActionResult]: StudioBridge['assistant']['actionResult']
  [CHANNELS.assistantVisualCaptureResult]: StudioBridge['assistant']['visualCaptureResult']
  [CHANNELS.assistantNote]: StudioBridge['assistant']['note']
  [CHANNELS.assistantSaid]: StudioBridge['assistant']['said']
  [CHANNELS.assistantWindow]: StudioBridge['assistant']['window']
  [CHANNELS.assistantFindActions]: StudioBridge['assistant']['findActions']

  [CHANNELS.aiOverview]: StudioBridge['ai']['overview']
  [CHANNELS.aiChoose]: StudioBridge['ai']['choose']
  [CHANNELS.aiChooseMany]: StudioBridge['ai']['chooseMany']
  [CHANNELS.aiInstall]: StudioBridge['ai']['install']
  [CHANNELS.aiCancelInstall]: StudioBridge['ai']['cancelInstall']
  [CHANNELS.aiInstallOllama]: StudioBridge['ai']['installOllama']
  [CHANNELS.aiCancelInstallOllama]: StudioBridge['ai']['cancelInstallOllama']
  [CHANNELS.aiReadEngine]: StudioBridge['ai']['readEngine']
  [CHANNELS.aiInstallEngine]: StudioBridge['ai']['installEngine']
  [CHANNELS.aiCancelInstallEngine]: StudioBridge['ai']['cancelInstallEngine']
  [CHANNELS.aiRemove]: StudioBridge['ai']['remove']
  [CHANNELS.aiLoad]: StudioBridge['ai']['load']
  [CHANNELS.aiCancelLoad]: StudioBridge['ai']['cancelLoad']
  [CHANNELS.aiUnload]: StudioBridge['ai']['unload']
  [CHANNELS.aiAddOwnModel]: StudioBridge['ai']['addOwnModel']
  [CHANNELS.autoRigRun]: StudioBridge['autoRig']['run']

  [CHANNELS.dictationState]: StudioBridge['dictation']['state']
  [CHANNELS.dictationStart]: StudioBridge['dictation']['start']
  [CHANNELS.dictationStop]: StudioBridge['dictation']['stop']
  [CHANNELS.dictationCancel]: StudioBridge['dictation']['cancel']
  [CHANNELS.dictationPush]: StudioBridge['dictation']['push']
  [CHANNELS.dictationDownloadModel]: StudioBridge['dictation']['downloadModel']
  [CHANNELS.dictationCancelDownload]: StudioBridge['dictation']['cancelDownload']
  [CHANNELS.dictationOpenPrivacy]: StudioBridge['dictation']['openPrivacySettings']

  [CHANNELS.windowToggleFullScreen]: StudioBridge['window']['toggleFullScreen']
  [CHANNELS.windowState]: StudioBridge['window']['state']
  [CHANNELS.windowLanguage]: StudioBridge['window']['language']
  [CHANNELS.windowWorkspace]: StudioBridge['window']['setWorkspace']
  [CHANNELS.windowResumeLeave]: StudioBridge['window']['resumeLeave']

  [CHANNELS.mirrorOpen]: StudioBridge['mirror']['open']
  [CHANNELS.gameWindowOpen]: StudioBridge['gameWindow']['open']
  [CHANNELS.retargetWindowFocusOrigin]: StudioBridge['retargetWindow']['focusOrigin']
  [CHANNELS.retargetWindowOpen]: StudioBridge['retargetWindow']['open']
  [CHANNELS.playerModuleWindowOpen]: StudioBridge['playerModuleWindow']['open']
  [CHANNELS.gameWindowClose]: StudioBridge['gameWindow']['close']

  [CHANNELS.helpOpen]: StudioBridge['help']['open']

  [CHANNELS.fileInfoOpen]: StudioBridge['fileInfo']['open']

  [CHANNELS.newDocumentAsk]: StudioBridge['newDocument']['ask']
  [CHANNELS.newDocumentRequest]: StudioBridge['newDocument']['request']
  [CHANNELS.newDocumentAnswer]: StudioBridge['newDocument']['answer']

  [CHANNELS.externalFilesTake]: StudioBridge['externalFiles']['take']
  [CHANNELS.externalFilesOffer]: (
    paths: readonly string[],
  ) => ReturnType<StudioBridge['externalFiles']['offer']>
  [CHANNELS.externalFilesDiscard]: StudioBridge['externalFiles']['discard']

  [CHANNELS.menuPopup]: StudioBridge['menu']['popup']

  [CHANNELS.newsRead]: StudioBridge['news']['read']

  [CHANNELS.updateState]: StudioBridge['updates']['state']
  [CHANNELS.updateInstall]: StudioBridge['updates']['install']
}

type Resolved<T> = T extends Promise<infer U> ? U : T

/**
 * Registers a handler whose arguments and return type are derived from the channel itself.
 * Answering with the wrong shape, or forgetting an argument, is a compile error.
 *
 * The handler may be synchronous or asynchronous: most channels reach the network or the
 * disk, and forcing a synchronous return would make the helper unusable for them.
 */
export function handle<C extends keyof ChannelMethod>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: Parameters<ChannelMethod[C]>
  ) => Resolved<ReturnType<ChannelMethod[C]>> | Promise<Resolved<ReturnType<ChannelMethod[C]>>>,
): void {
  // `ipcMain.handle` types what crosses as `any[]`, and the channel is what says the real shape.
  // The assertion is the boundary itself: what arrives is whatever the other side sent, and the
  // handler validates it — this only stops the compiler asking twice.
  ipcMain.handle(channel, (event, ...args) =>
    handler(event, ...(args as Parameters<ChannelMethod[C]>)),
  )
}
