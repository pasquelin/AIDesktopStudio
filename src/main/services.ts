import { landingFolderFor } from '@main/media/landingFolder'
import { orElse } from '@shared/promises'
import { APP_NAME } from '@shared/constants'
import { app, net, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleepFor } from 'node:timers/promises'
import { ASSET_ID_PREFIX, type Asset } from '@shared/domain/asset'
import { log } from './log'
import { EVENTS } from '@shared/ipc'
import { isDevelopment } from '@main/environment'
import { createNewsService } from '@main/news/newsStore'
import { createMissionRuntime } from '@main/mission/runtime'
import { createMissionRevisionReader } from '@main/mission/resourceState'
import { createMissionServices } from '@main/mission/services'
import { createActionSearchService } from '@main/actionIndex/actionSearchService'
import { createAssistantContextBuilder } from '@main/mission/contextBuilder'
import { createUpdates } from '@main/updater'
import { bundledGameRuntime, resourcesRoot } from './resources'
import { createMcpControl } from './mcp/control'
import {
  checkoutOf,
  clientName,
  mcpConfigWith,
  mcpEndpointPath,
  mcpLaunch,
  mcpStateOf,
  type McpLaunch,
} from './mcp/endpoint'
const MCP_CLIENT = clientName(APP_NAME)
import { openMicrophoneSettings } from './dictation/permissions'
import { claimExternalFiles } from './externalFiles'
import { adoptFile } from './media/adoptFile'
import { importFiles } from './media/importFiles'
import { importMontageArchive } from './import/montageImport'
import { linkedAsset } from './media/link'
import { QUIT_CLOSE_GRACE_MS } from './memory/embedClient'
import { binaryRuns, forgetBinaries, hashOrNull, runProcess } from './media/runner'
import { broadcast } from './ipc/broadcast'
import { writeAtomic } from './persistence'
import { openFailureKey } from './project/store'
import type { SettingsStore } from './settings/store'
import { ProviderServices } from './serviceProvider'
import { createLocalAiServices } from './serviceLocalAi'
import { createProjectServices } from './serviceProject'
import { createMediaServices } from './serviceMedia'
import { createJobServices } from './serviceJobs'
import { createAssistantBrains, createAssistantPresentation } from './serviceAssistant'
import {
  askUser,
  pickAnimation,
  pickImportPath,
  pickMedia,
  pickPath,
  pickSavePath,
  pickWeights,
  savePicture,
} from './serviceDialogs'

export type { Services } from './serviceTypes'
import type { Services } from './serviceTypes'
/** Two cores left to the interface and to whatever else the machine is doing — CLAUDE.md § 6. */
const spareCores = (): number => Math.max(1, availableParallelism() - 2)
const timestamp = (): string => new Date().toISOString()
const newAssetId = (): string => `${ASSET_ID_PREFIX}${randomUUID()}`
/**
 * Our entry added to the checkout's client configuration, which is the PROJECT's file and not
 * ours. A malformed one is left exactly as it is: the throw lands here rather than overwriting it.
 */
async function leaveClientConfig(path: string, launch: McpLaunch): Promise<void> {
  try {
    const merged = mcpConfigWith(await orElse(readFile(path, 'utf8'), ''), launch, MCP_CLIENT)
    if (merged !== null) await writeAtomic(path, merged)
  } catch (error) {
    // An unwritable or unreadable checkout costs a convenience, never a launch.
    log.warn('mcp', `could not leave a client configuration at ${path}: ${String(error)}`)
  }
}
/** The one wait of the main process. Cancellable, which `setTimeout` in a promise is not. */
const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  sleepFor(ms, undefined, { signal })
/** `net.fetch` rather than the global one: it goes through Electron's own network stack. */
async function download(url: string): Promise<Uint8Array> {
  const response = await net.fetch(url)
  if (!response.ok) throw new Error(`asset download failed with status ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

export { createSettings } from './serviceSettings'
/** The clock these two ports are injected with — written twice in this file, forty lines apart. */
const afterDelay = (run: () => void, delayMs: number): (() => void) => {
  const timer = setTimeout(run, delayMs)
  return () => clearTimeout(timer)
}

type ProjectServices = ReturnType<typeof createProjectServices>
type MediaServices = ReturnType<typeof createMediaServices>
type LocalAiServices = ReturnType<typeof createLocalAiServices>
type JobServices = ReturnType<typeof createJobServices>

const serviceSlice = <T extends Partial<Services>>(services: T): T => services

/**
 * Composition root of the main process. Everything stateful is built here, once, so no module
 * reaches for a singleton and every collaborator stays injectable in tests.
 *
 * Called after `app.whenReady()`: it registers the asset protocol handler, which Electron
 * refuses before then. The settings are built before it and handed in — see `createSettings`.
 */
export function createServices(settings: SettingsStore): Services {
  const { missions, studioEvents, missionClock, connectMissionRuntime, onJobProgress } =
    createMissionServices(timestamp)
  const provider = new ProviderServices(settings, delay, () =>
    log.info('provider', 'rate limit reached, requests are queueing'),
  )
  // prettier-ignore
  const { language, credentials, transport, client, fromManager, holdsTripo, generationFolder, models, plan, credits, assistQueue, usage } = provider
  function buildProjectServices(): ProjectServices {
    return createProjectServices({
      settings,
      credentialsChanged: credentials.changed,
      now: timestamp,
      refreshAi: () => ai.refresh(),
      resumeJobs: async projectPath => {
        const remembered = await jobStore.read(projectPath)
        if (remembered.length > 0) jobs.resume(remembered)
      },
      catchUpMedia: () => catchUpProject(),
      releaseMemoryVectors: () => memoryVectors.release(),
      flushJobs: () => jobStore.flush(),
    })
  }
  // prettier-ignore
  const { memory, project, context, reconciler, journal, transcribe, said, republishAi, linkOpenProject } = buildProjectServices()
  function buildMediaServices(): MediaServices {
    return createMediaServices({
      settings,
      project,
      journal,
      language,
      download,
      newAssetId,
      now: timestamp,
      concurrency: spareCores,
    })
  }
  // prettier-ignore
  const { assets, extractTextures, folder, documents, game, scripts, inputMaps, animationGraphs, files, ffmpeg, media, catchUpProject, probeLocalFile, onAssetLanded, bundles } = buildMediaServices()
  function buildLocalAi(): LocalAiServices {
    return createLocalAiServices({
      settings,
      project,
      memory,
      fromManager,
      language,
      pickWeights,
      providerBrain: () => providerBrain,
      schedule: afterDelay,
    })
  }
  // prettier-ignore
  const { clouds, runtimes, ai, engine: localEngine, llama, modelOf, isLocalTarget, notReady, memoryVectors, embedder, addOwnAiModel, dictation, autoRig, smartSelection } = buildLocalAi()
  const actionIndex = createActionSearchService({
    userData: app.getPath('userData'),
    embedder,
    onTrouble: why => log.warn('assistant', `action index: ${why}`),
  })
  const closeRetrieval = async (): Promise<void> => {
    // The worker FIRST: the index close awaits an indexing that runs through it, so a wedged
    // worker held the quit for ever with the grace still to come. Gone, that wait settles.
    await embedder.close(QUIT_CLOSE_GRACE_MS)
    await actionIndex.close()
    await memoryVectors.close()
  }
  function buildJobServices(): JobServices {
    return createJobServices({
      settings,
      credentialsWatch: credentials.watch,
      client,
      transport,
      models,
      context,
      project,
      journal,
      assets,
      runtimes,
      ai,
      modelOf,
      isLocalTarget,
      holdsTripo,
      generationFolder,
      download,
      newAssetId,
      delay,
      now: timestamp,
      onProgress: onJobProgress,
    })
  }
  // prettier-ignore
  const { uploads, estimateCost, promptContext, ownerScope, remoteAssets, cloudAssets, prompts, removeAssetFile, jobStore, jobs } = buildJobServices()
  function assistantDependencies() {
    return {
      settings,
      client,
      jobs,
      prompts,
      files,
      journal,
      project,
      context,
      memoryVectors,
      actionIndex,
      runtimes,
      ai,
      modelOf,
      notReady,
      clouds,
      assistQueue,
      concurrency: spareCores,
    }
  }
  const assistantDeps = assistantDependencies()
  const { providerBrain, remoteActions, visualCapture, brain, snapshot } =
    createAssistantBrains(assistantDeps)
  const assistantContext = createAssistantContextBuilder({
    snapshot,
    actions: actionIndex,
    memories: memoryVectors,
    jobs,
    projectContext: context,
    visual: async document => {
      const before = await snapshot()
      const revision = before?.documentRevisions?.find(one => one.documentId === document.id)
      const captured = await visualCapture.capture(document.id, revision?.revision)
      const after = await snapshot()
      const current = after?.documentRevisions?.find(one => one.documentId === document.id)
      const active = after?.documents.find(one => one.active)
      return revision &&
        current &&
        revision.revision === current.revision &&
        active?.id === document.id
        ? captured
        : null
    },
  })
  const missionRuntime = createMissionRuntime({
    manager: missions,
    context: assistantContext,
    brain,
    actions: remoteActions,
    jobs,
    revisions: createMissionRevisionReader(snapshot),
    clock: missionClock,
  })
  connectMissionRuntime(missionRuntime)

  function buildMcp() {
    const checkout = checkoutOf(app.getAppPath())
    const endpointPath = mcpEndpointPath(app.getPath('userData'), checkout)
    const launch = mcpLaunch(process.execPath, checkout, endpointPath)
    if (checkout !== null) void leaveClientConfig(join(checkout, '.mcp.json'), launch)
    const mcp = createMcpControl({
      run: remoteActions.run,
      version: app.getVersion(),
      configPath: endpointPath,
      onSettled: endpoint => broadcast(EVENTS.mcpState, mcpStateOf(endpoint)),
    })
    return { launch, mcp }
  }
  const { launch, mcp } = buildMcp()

  const { captioner, favorites, styles } = createAssistantPresentation(assistantDeps)
  async function reopenLastProject(): Promise<void> {
    const stored = settings.read()
    const lastProject = stored.general.startup === 'lastProject' ? stored.storage.lastProject : null
    if (!lastProject) return
    try {
      await project.open(lastProject)
    } catch (error) {
      log.warn('project', `reopening ${lastProject} failed: ${String(error)}`)
      const messageKey = openFailureKey(error)
      if (messageKey) journal.record({ level: 'error', topic: 'project', messageKey })
    }
  }
  void reopenLastProject()

  function coreServices() {
    return {
      missions,
      studioEvents,
      settings,
      favorites,
      styles,
      disposeAiEngine: async () => {
        ai.dispose()
        localEngine.supervisor.dispose()
        await llama.unload()
      },
      client,
      models,
      jobs,
      prompts,
      usage,
      plan,
      credits,
      estimateCost,
      captionArrivals: captioner.onArrival,
      describeAssets: captioner.describe,
      uploads,
      remote: remoteAssets,
      cloud: () => cloudAssets,
      ownerScope,
      removeAssetFile,
      project,
      memory,
      memoryVectors,
      actionIndex,
      closeRetrieval,
      assistantContext,
      missionRuntime,
      visualCapture,
      projectPath: () => project.current()?.path ?? null,
      journal,
      transcribe,
      said,
      flushJobs: () => jobStore.flush(),
      flushMissions: () => missions.flush(),
      documents,
      assets,
      extractTextures,
      newAssetId,
      media,
      assistant: brain,
      remoteActions,
      mcp,
      mcpLaunch: launch,
      ai,
      addOwnAiModel,
      dictation,
      autoRig,
      smartSelection,
    }
  }
  function systemServices() {
    const adoptInto = (
      root: string,
      catalog: ReturnType<typeof project.catalog>,
      relative: string,
    ): Promise<Asset | null> =>
      adoptFile(relative, {
        projectPath: () => root,
        catalog: () => catalog,
        newAssetId,
        now: timestamp,
        hash: hashOrNull,
        probeFile: probeLocalFile,
        roles: project.roles,
        onAdopted: onAssetLanded,
        record: report => journal.record(report),
      })
    const adopt = (relative: string): Promise<Asset | null> =>
      adoptInto(project.path(), project.catalog(), relative)
    return serviceSlice({
      openMicrophoneSettings: () => openMicrophoneSettings(url => void shell.openExternal(url)),
      link: async (source, type) =>
        await project
          .catalog()
          .add(linkedAsset(source, { id: newAssetId(), type, now: timestamp() })),
      adopt,
      importPaths: (paths, target, watch, internal) =>
        project.duringWrite(async (root, catalog) => {
          const heldAdopt = (relative: string): Promise<Asset | null> =>
            adoptInto(root, catalog, relative)
          return await importFiles(
            paths,
            target,
            {
              projectPath: () => root,
              names: folder.names,
              adopt: heldAdopt,
              documents: documents.list,
              importBundle: (source, projectRoot, folderTarget, bundleWatch) =>
                importMontageArchive(
                  source,
                  projectRoot,
                  folderTarget,
                  bundleWatch.signal ?? new AbortController().signal,
                  { bundles, adopt: heldAdopt, onProgress: bundleWatch.onStep },
                ),
              roles: () => project.roles(),
              folderFor: role => landingFolderFor(project, role, internal),
            },
            watch,
          )
        }),
      claimExternalFiles,
      capabilities: async () => {
        ffmpeg.invalidate()
        forgetBinaries()
        return { ffmpeg: await binaryRuns(ffmpeg.path()) }
      },
      language,
      pickPath,
      savePicture,
      pickSavePath,
      encodeVideo: async (args, signal) => {
        const binary = ffmpeg.path()
        if (!binary) throw new Error('ffmpeg was not found')
        await runProcess(binary, args, { signal })
      },
      // The same picker the settings use for a folder: a second dialog with slightly different
      // options is how two flows start behaving differently.
      pickFolder: () => pickPath('folder'),
      assetsById: ids => project.catalog().search({ ids, limit: ids.length }),
      runtimeFolder: () => bundledGameRuntime(resourcesRoot()),
      // Forked on the first bundle asked for, then kept — most sessions export none. Forgotten
      // when it exits, so a crash costs the export it was writing and not the session.
      bundles,
      pickImportPath: extension => pickImportPath(extension, language()),
      reveal: file => shell.showItemInFolder(file),
      exists: existsSync,
      folder,
      files,
      game,
      scripts,
      inputMaps,
      animationGraphs,
      reconciler,
      context,
      promptContext,
      openInSystem: file => shell.openPath(file),
      askUser,
      trashFolder: path => shell.trashItem(path),
      // Nothing to leave means nothing to ask about: `pickedProject` reaches the question on a
      // studio that has never opened a project, where a job of a project closed earlier would
      // otherwise be counted.
      runningJobCount: () => {
        const current = project.current()
        return current ? jobs.runningIn(current.path) : 0
      },
      pickMedia: () => pickMedia(language()),
      pickAnimation: () => pickAnimation(language()),
      folderFor: role => project.folderFor(role),
      // Another key means another catalogue: keeping a cache would show the previous account's
      // contents under the new one. And the open project remembers the switch, so reopening it
      // tomorrow lands on the key it was actually worked under.
      onCredentialsChanged: () => {
        credentials.changed()
        // Only a project that HAD a key is warned. Adopting one for the first time changes nothing
        // about what the library holds, and a sentence there would fire on every project ever made.
        const relink = linkOpenProject()
        if (relink.kind === 'moved' && relink.active) {
          journal.record({
            level: 'warn',
            topic: 'project',
            messageKey: 'activity.projectAccountSwitched',
            params: { name: relink.active.name },
          })
        }
      },
      authState: async () => {
        const state = await client.authState()
        const owner = ownerScope.current()
        // Attached here rather than probed for: the scope fills in as the library answers, and
        // asking the API again would cost a call to learn something it already told us.
        return state.authenticated && owner !== null ? { ...state, ownerId: owner } : state
      },
      // Every window carries the switch, not just the one that made it — and so does the AI
      // manager, for which clouds are ready is one of the inputs its overview is pulled from.
      broadcastAccounts: accounts => {
        broadcast(EVENTS.accountsChanged, accounts)
        republishAi('an account change')
      },
      // The one outward read this studio makes for something other than a model or a job. Bound
      // to `net.fetch` so it follows the session's proxy, as every other outward call does.
      news: createNewsService({
        read: async (url, signal) => {
          const response = await net.fetch(url, { signal })
          if (!response.ok) throw new Error(`${url} answered ${response.status}`)

          return response.text()
        },
        now: () => Date.now(),
      }),
      updates: createUpdates({
        // Through `default`: `autoUpdater` is a defineProperty getter, which the ESM loader cannot
        // see as a named export. Measured under Electron 43 — the named read answers `undefined`.
        loadUpdater: async () => (await import('electron-updater')).default.autoUpdater,
        isPackaged: !isDevelopment,
        onChange: state => broadcast(EVENTS.updateState, state),
      }),
    })
  }

  return { ...coreServices(), ...systemServices() }
}
