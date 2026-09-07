import { orElse } from '@shared/promises'
import { parentOf } from '@shared/domain/folder'
import { nameOf } from '@shared/domain/folder'
import { stemOf } from '@shared/domain/fileName'
import { SOURCES_FOLDER } from '@shared/domain/meshImport'
import { isOwnAnimationFolder } from '@shared/domain/animationLibrary'
import { CLOUD_PROVIDERS } from '@shared/domain/aiCloud'
import type { Asset } from '@shared/domain/asset'
import { roleForAsset } from '@shared/domain/asset'
import type { RoleFolders } from '@shared/domain/folderRole'
import type { JobProgress } from '@shared/domain/job'
import { outputExtensionOf } from '@shared/domain/localFields'
import type { LocalModel } from '@shared/domain/localModel'
import { projectName } from '@shared/domain/project'
import { TRIPO_CLOUD, isTripoModelId } from '@shared/domain/tripo'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type Scenario from '@scenario-labs/sdk'
import { createAssetCollector } from './assets/collector'
import { createCloudBackend } from './assets/cloudBackend'
import type { LocalBackend } from './assets/localBackend'
import { assetFilePath, ownFileOf } from './assets/protocol'
import { createCodeJobRunner, isRetryableCloudChat } from './ai/codeJobRunner'
import { createLocalAssetInputResolver } from './ai/localAssetInputs'
import { createLocalCollector } from './assets/localCollector'
import { createLocalJobRunner } from './ai/localJobRunner'
import type { LocalRuntimes } from './ai/localRuntimes'
import { createRoutedCollector } from './ai/routedCollector'
import { createRoutedJobRunner } from './ai/routedJobRunner'
import { EVENTS } from '@shared/ipc'
import { broadcast } from './ipc/broadcast'
import { exists } from './persistence'
import { createPromptContext } from './provider/promptContext'
import { createAssetInputResolver } from './provider/assetInputs'
import { assetBackendOf, assetCatalogOf, type RemoteAssetCatalog } from './provider/assetCatalog'
import { generationOfMetadata } from './provider/assetNormalizer'
import { clientFor, type ClientProvider, type Transport } from './provider/client'
import { costEstimatorOf } from './provider/cost'
import { createJobManager, type AssetCollector, type JobAccount } from './provider/jobManager'
import { createJobStore } from './provider/jobStore'
import { createOwnerScope } from './provider/ownerScope'
import { createPromptAssist } from './provider/promptAssist'
import { promptAssistApiOf } from './provider/promptAssistApi'
import { createRetry, isRetryable } from './provider/retry'
import { runnerOf } from './provider/runner'
import { createTripoApi, isRetryableTripo, tripoRetryAfterMs } from './provider/tripoApi'
import { createTripoRunner, tripoLaneOf } from './provider/tripoRunner'
import { createAssetUploader, MAX_UPLOAD_BYTES } from './provider/uploader'
import { accountFingerprint } from './settings/accounts'
import type { SettingsStore } from './settings/store'
import type { ProjectContextStore } from './project/context'
import type { ProjectStore } from './project/store'
import type { ModelRegistry } from './provider/modelRegistry'
import type { ActivityLog } from './project/activityLog'
import { isRecord } from '@shared/guards'
import { log } from './log'

const LOCAL_ACCOUNT_ID = 'local'

type JobDeps = {
  settings: SettingsStore
  credentialsWatch: Parameters<typeof createOwnerScope>[0]
  client: ClientProvider
  transport: Transport
  models: ModelRegistry
  context: ProjectContextStore
  project: ProjectStore
  journal: ActivityLog
  assets: LocalBackend
  runtimes: LocalRuntimes
  ai: { hold: (id: string) => () => void; ensureLoaded: (id: string) => Promise<void> }
  modelOf: (id: string) => LocalModel | null
  isLocalTarget: (id: string) => boolean
  holdsTripo: () => boolean
  generationFolder: () => Promise<string>
  download: (url: string) => Promise<Uint8Array>
  newAssetId: () => string
  delay: (ms: number, signal?: AbortSignal) => Promise<void>
  now: () => string
  onProgress?: (progress: JobProgress) => void
}

export function createJobServices(deps: JobDeps) {
  const collectorOf = (scenario: Scenario): AssetCollector => createCollector(deps, scenario)
  const uploads = createAssetUploader(() => deps.client.require().assets)
  const estimateCost = costEstimatorOf(
    (target, body) =>
      deps.client.require().generate.runModel(target.id, { body, dryRun: true }, { maxRetries: 0 }),
    targetId => deps.isLocalTarget(targetId) || isTripoModelId(targetId),
  )
  const promptContext = createPromptContext({
    cards: async () => (await deps.context.read()).cards,
    fieldsOf: async id => (await deps.models.describe(id)).fields,
    log: message => log.warn('provider', message),
  })
  const ownerScope = createOwnerScope(deps.credentialsWatch)
  const remoteAssets = (): RemoteAssetCatalog => observedCatalog(deps, ownerScope)
  const cloudAssets = createCloudAssets(deps, uploads, remoteAssets)
  const assetInputs = createAssetInputResolver({
    find: id => deps.project.catalog().find(id),
    push: id => cloudAssets.push(id),
    activeOwnerId: ownerScope.current,
  })
  const localAssetInputs = createLocalAssetInputResolver({
    find: id => deps.project.catalog().find(id),
    projectPath: () => deps.project.path(),
  })
  const prompts = createPromptAssist({
    api: () => promptAssistApiOf(deps.client.require()),
    fields: async id => (await deps.models.describe(id)).fields,
    resolvePictureIds: assetInputs.resolvePictureIds,
  })
  const removeAssetFile = async (asset: Asset, expectedProjectPath?: string): Promise<void> =>
    await removeFiles(deps, asset, expectedProjectPath)
  const localJobs = createLocalJobs(deps)
  const codeJobs = createCodeJobs(deps)
  const tripoApi = createTripoApi({
    key: () => deps.settings.readCredentialsFor(TRIPO_CLOUD)?.key ?? null,
  })
  const tripoJobs = createTripoRunner({
    api: () => (deps.holdsTripo() ? tripoApi : null),
    download: deps.download,
    readFile: path => readFile(path),
    writeFile: (path, bytes) => writeFile(path, bytes),
    destinationFor: async (id, extension) =>
      join(await deps.generationFolder(), `${id}${extension}`),
    gather: ms => deps.delay(ms),
    log: (level, message) => log[level]('provider', message),
  })
  const collectLocal = createLocalCollector({
    producedBy: id => localJobs.producedBy(id) ?? tripoJobs.producedBy(id),
    discard: path => rm(path, { force: true }),
    backend: deps.assets,
    newId: deps.newAssetId,
    log: (level, message) => log[level]('ai', message),
  })
  const accountOn = (scenario: Scenario | null): JobAccount =>
    createAccount(deps, scenario, localJobs, codeJobs, tripoJobs, collectLocal, collectorOf)
  const jobStore = createJobStore(() => app.getPath('userData'))
  let bound: { scenario: Scenario | null; id: string; account: JobAccount } | null = null
  const jobs = createJobManager({
    accounts: {
      active: () => {
        const scenario = deps.client.get() ?? null
        const held = deps.settings.readCredentials()
        if (bound?.scenario !== scenario)
          bound = {
            scenario,
            id: held ? accountFingerprint(held) : LOCAL_ACCOUNT_ID,
            account: accountOn(scenario),
          }
        return { id: bound.id, account: bound.account }
      },
      of: id => {
        const credentials = deps.settings.credentialsOf(id)
        if (credentials) return accountOn(clientFor(credentials, deps.transport))
        return id === LOCAL_ACCOUNT_ID ? accountOn(null) : null
      },
    },
    projectPath: () => deps.project.current()?.path ?? null,
    projectNameOf: projectName,
    resolveAssetInputs: (body, target) =>
      deps.isLocalTarget(target.id) || isTripoModelId(target.id)
        ? localAssetInputs.resolveBody(body)
        : assetInputs.resolveBody(body),
    persist: (unfinished, handled) =>
      void persistJobs(
        jobStore,
        unfinished.filter(job => !job.remoteId.startsWith('local_')),
        handled,
      ),
    concurrency: () => deps.settings.read().generation.concurrentJobs,
    localConcurrency: () => 1,
    isLocalTarget: deps.isLocalTarget,
    cancellableTarget: id => !isTripoModelId(id),
    lane: tripoLaneOf,
    maxRetries: () => deps.settings.read().generation.maxRetries,
    retryable: error => isRetryable(error) || isRetryableTripo(error),
    retryDelayFor: tripoRetryAfterMs,
    onProgress: progress => {
      broadcast(EVENTS.jobProgress, progress)
      deps.onProgress?.(progress)
    },
    onListChanged: list => broadcast(EVENTS.jobsChanged, list),
    record: report => deps.journal.record(report),
    now: deps.now,
    newId: () => `job_${randomUUID()}`,
    sleep: deps.delay,
  })
  function result() {
    return {
      uploads,
      estimateCost,
      promptContext,
      ownerScope,
      remoteAssets,
      cloudAssets,
      prompts,
      removeAssetFile,
      jobStore,
      jobs,
    }
  }
  return result()
}

function createCollector(deps: JobDeps, scenario: Scenario): AssetCollector {
  return createAssetCollector({
    retrieve: async id => {
      const { asset } = await scenario.assets.retrieve(id)
      const generation = generationOfMetadata(asset.metadata)
      return {
        ...asset,
        metadataType: asset.metadata.type,
        parentId: asset.metadata.parentId,
        ownerId: asset.ownerId,
        updatedAt: asset.updatedAt,
        ...(asset.thumbnail?.url ? { thumbnailUrl: asset.thumbnail.url } : {}),
        ...(asset.metadata.outputIndex === undefined
          ? {}
          : { outputIndex: asset.metadata.outputIndex }),
        ...(generation ? { generation } : {}),
      }
    },
    backend: deps.assets,
    newId: deps.newAssetId,
    heldFor: async id => {
      const held = await deps.project.catalog().findByRemoteId(id)
      if (!held) return null
      const file = ownFileOf(deps.project.path(), held)
      return { ...held, onDisk: file !== null && (await exists(file)) }
    },
  })
}

function observedCatalog(
  deps: JobDeps,
  owner: ReturnType<typeof createOwnerScope>,
): RemoteAssetCatalog {
  const catalog = assetCatalogOf(assetBackendOf(deps.client.require()))
  return {
    ...catalog,
    list: async request => {
      const page = await catalog.list(request)
      owner.observe(page.assets)
      return page
    },
  }
}

function createCloudAssets(
  deps: JobDeps,
  uploads: ReturnType<typeof createAssetUploader>,
  remote: () => RemoteAssetCatalog,
) {
  return createCloudBackend({
    remote,
    multipart: async params => {
      const result: unknown = await deps.client.require().uploads.uploadFile(params)
      const asset = isRecord(result) && isRecord(result.asset) ? result.asset : null
      if (!asset || typeof asset.id !== 'string') throw new Error('upload-incomplete')
      return {
        assetId: asset.id,
        ...(typeof asset.ownerId === 'string' ? { ownerId: asset.ownerId } : {}),
        ...(typeof asset.updatedAt === 'string' ? { updatedAt: asset.updatedAt } : {}),
      }
    },
    small: (name, image) => uploads.upload(name, image),
    local: deps.assets,
    catalog: () => deps.project.catalog(),
    fileOf: asset => ownFileOf(deps.project.path(), asset),
    readFile: path => readFile(path),
    sizeOf: async path => (await stat(path)).size,
    newId: deps.newAssetId,
    now: deps.now,
    smallUploadLimit: MAX_UPLOAD_BYTES,
  })
}

type RemovalProject = { current: () => { path: string } | null; roles: () => RoleFolders }

function ownsAssetFolder(project: RemovalProject, asset: Asset, folder: string | null): boolean {
  const roleFolder = project.roles()[roleForAsset(asset)]
  return (
    asset.path !== undefined &&
    roleFolder !== undefined &&
    folder !== roleFolder &&
    (isOwnAnimationFolder(asset.path) ||
      (asset.type === 'mesh' && nameOf(folder ?? '') === stemOf(nameOf(asset.path))))
  )
}

async function removeConvertedSources(
  root: string,
  asset: Asset,
  assetFolder: string | null,
  ownsFolder: boolean,
): Promise<void> {
  const converted = asset.convertedFrom ? assetFilePath(root, asset.convertedFrom) : null
  if (converted) await rm(converted, { force: true })
  const sourceFolder = asset.convertedFrom ? parentOf(asset.convertedFrom) : null
  if (!sourceFolder) return
  const absolute = assetFilePath(root, sourceFolder)
  if (!absolute) return
  const packageParent = parentOf(sourceFolder)
  const ownsNested = ownsFolder && sourceFolder === `${assetFolder}/${SOURCES_FOLDER}`
  const ownsRefiled = nameOf(packageParent ?? '') === SOURCES_FOLDER
  // Said the right way round: this is the condition that decides a RECURSIVE delete. Anything the
  // asset does not own is emptied at most, by an `rmdir` that fails on a folder holding anything.
  const ownsPackage = ownsRefiled || (ownsNested && nameOf(sourceFolder) === SOURCES_FOLDER)
  if (!ownsPackage) return await orElse(rmdir(absolute), undefined)

  await rm(absolute, { recursive: true })
  if (ownsRefiled && packageParent) {
    const parent = assetFilePath(root, packageParent)
    if (parent) await orElse(rmdir(parent), undefined)
  }
}

export async function removeFiles(
  deps: { project: RemovalProject },
  asset: Asset,
  expectedProjectPath?: string,
): Promise<void> {
  const current = deps.project.current()
  if (expectedProjectPath !== undefined && current?.path !== expectedProjectPath)
    throw new Error('asset rollback belongs to another project')
  if (!current) return
  for (const stored of [asset.path, asset.posterPath]) {
    const file = stored ? assetFilePath(current.path, stored) : null
    if (file) await rm(file, { force: true })
  }
  const assetFolder = asset.path ? parentOf(asset.path) : null
  const ownsFolder = ownsAssetFolder(deps.project, asset, assetFolder)
  await removeConvertedSources(current.path, asset, assetFolder, ownsFolder)
  // A packaged conversion owns its folder, so what is left of it goes too. `rmdir` and not
  // `rm -r`: it refuses a folder holding anything else, the guard against taking a user's own.
  const folder = ownsFolder && assetFolder ? assetFilePath(current.path, assetFolder) : null
  if (folder) await orElse(rmdir(folder), undefined)
}

function createLocalJobs(deps: JobDeps) {
  return createLocalJobRunner({
    generate: async request => {
      const model = deps.modelOf(request.model)
      const generate = model ? deps.runtimes[model.loader]?.generate : undefined
      if (!model || !generate) throw new Error(`nothing here generates with ${request.model}`)
      const release = deps.ai.hold(request.model)
      try {
        await deps.ai.ensureLoaded(request.model)
        return await generate({
          model: model.id,
          modality: request.modality,
          prompt: request.prompt,
          fields: request.fields,
          destination: join(
            await deps.generationFolder(),
            `${request.jobId}.${outputExtensionOf(request.modality)}`,
          ),
          onProgress: request.onProgress,
          signal: request.signal,
        })
      } finally {
        release()
      }
    },
    chat: async request => {
      const model = deps.modelOf(request.model)
      const chat = model ? deps.runtimes[model.loader]?.chat : undefined
      if (!chat) throw new Error(`nothing here converses with ${request.model}`)
      return await chat(request)
    },
    modelOf: deps.modelOf,
    newId: () => randomUUID(),
    log: (level, message) => log[level]('ai', message),
  })
}

function createCodeJobs(deps: JobDeps) {
  return createCodeJobRunner({
    chatOf: cloud => {
      const chat = CLOUD_PROVIDERS.find(one => one.id === cloud)?.chat
      return !chat || chat.kind === 'scenario' ? null : chat
    },
    keyOf: cloud => deps.settings.readCredentialsFor(cloud)?.key ?? null,
    modelOf: cloud => deps.settings.read().assistant.cloudModels[cloud],
    post: (input, init) => fetch(input, init),
    retry: createRetry({
      maxRetries: () => deps.settings.read().generation.maxRetries,
      sleep: deps.delay,
      retryable: isRetryableCloudChat,
    }),
    newId: () => randomUUID(),
    log: (level, message) => log[level]('ai', message),
  })
}

function createAccount(
  deps: JobDeps,
  scenario: Scenario | null,
  local: ReturnType<typeof createLocalJobs>,
  code: ReturnType<typeof createCodeJobs>,
  tripo: ReturnType<typeof createTripoRunner>,
  collectLocal: ReturnType<typeof createLocalCollector>,
  collector: (scenario: Scenario) => AssetCollector,
): JobAccount {
  return {
    runner: createRoutedJobRunner({
      local,
      code,
      tripo: () => (deps.holdsTripo() ? tripo : null),
      cloud: () => (scenario ? runnerOf(scenario) : null),
      isLocalTarget: deps.isLocalTarget,
    }),
    collect: createRoutedCollector({
      local: collectLocal,
      cloud: () => (scenario ? collector(scenario) : null),
      owns: id => local.owns(id) || tripo.owns(id),
      wroteText: id => code.owns(id),
    }),
  }
}

async function persistJobs(
  store: ReturnType<typeof createJobStore>,
  unfinished: Parameters<ReturnType<typeof createJobStore>['write']>[0],
  handled: Parameters<ReturnType<typeof createJobStore>['write']>[1],
): Promise<void> {
  try {
    await store.write(unfinished, handled)
  } catch (error) {
    log.warn('jobs', `keeping notes of running jobs failed: ${String(error)}`)
  }
}
