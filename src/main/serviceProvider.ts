import type { FromManager } from './serviceLocalAi'
import type { LocalModel } from '@shared/domain/localModel'
import type { ModelDescriptor } from '@shared/domain/model'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import { TRIPO_CATALOGUE, TRIPO_CLOUD, tripoDescriptorOf } from '@shared/domain/tripo'
import { textAt, TRANSLATIONS, type Language } from '@shared/i18n'
import { app } from 'electron'
import { join } from 'node:path'
import { catalogueWith } from './ai/catalogue'
import { ensureFolder } from './ai/modelStore'
import { windowLanguage } from './window/language'
import { noteFailure } from './provider/client'
import { createCredentialsWatch } from './provider/credentialsWatch'
import { catalogOf } from './provider/modelCatalog'
import { createModelRegistry } from './provider/modelRegistry'
import { createPlanReader, teamsOf } from './provider/plan'
import { createCreditsReader } from './provider/credits'
import { createAssistQueue } from './provider/assistQueue'
import { createUsageReader } from './provider/usage'
import { clientFor, createClientProvider } from './provider/client'
import { createRateLimiters, limitedTransport } from './provider/rateLimiter'
import type { SettingsStore } from './settings/store'

// Keys queried at once when reading usage: low, so a screen nobody waits on does not spend a
// window of requests and hold the limiter. Concurrency only: the rate is `rateLimiter.ts`'s.
const USAGE_CONCURRENCY = 4
const NOTHING_DISCOVERED: readonly LocalModel[] = []

export class ProviderServices {
  readonly language = (): Language => windowLanguage()
  readonly credentials = createCredentialsWatch()
  readonly limiters = createRateLimiters({
    now: () => performance.now(),
    delay: (ms, signal) => this.schedule(ms, signal),
    onSaturated: () => this.logRateLimit(),
  })
  readonly transport = limitedTransport(this.limiters, (input, init) => fetch(input, init))
  readonly client = createClientProvider({
    resolve: () => this.settings.readCredentials(),
    watch: this.credentials.watch,
    transport: this.transport,
  })
  readonly fromManager: FromManager = {
    installedIds: () => new Set<string>(),
    discovered: () => NOTHING_DISCOVERED,
    engineFailure: () => null,
  }
  readonly holdsTripo = (): boolean => this.settings.readCredentialsFor(TRIPO_CLOUD) !== null
  readonly generationFolder = async (): Promise<string> => {
    const folder = join(app.getPath('temp'), 'ai-desktop-studio-generations')
    this.generationFolderMade ??= ensureFolder(folder).then(() => folder)
    return await this.generationFolderMade
  }
  readonly describedTripo = (): readonly ModelDescriptor[] => {
    const spoken = this.language()
    if (this.tripoCatalogue?.language === spoken) return this.tripoCatalogue.models
    const said = (key: string): string => textAt(TRANSLATIONS[spoken], key)
    const models = TRIPO_CATALOGUE.map(entry => tripoDescriptorOf(entry, said))
    this.tripoCatalogue = { language: spoken, models }
    return models
  }
  readonly models = createModelRegistry({
    catalog: () => catalogOf(this.client.require()),
    watch: this.credentials.watch,
    publishedModels: () => (this.holdsTripo() ? this.describedTripo() : []),
    publishedModelOf: modelId => this.describedTripo().find(model => model.id === modelId) ?? null,
    localModels: () => this.mergedCatalogue(),
    isInstalled: modelId => this.fromManager.installedIds().has(modelId),
    engineFailure: () => this.fromManager.engineFailure(),
    translate: key => textAt(TRANSLATIONS[this.language()], key),
    note: failure => noteFailure('provider:search-models', failure),
  })
  readonly plan = createPlanReader({
    catalog: () => teamsOf(this.client.require()),
    watch: this.credentials.watch,
  })
  readonly credits = createCreditsReader({ accounts: () => this.settings.keyedAccounts() })
  readonly assistQueue = createAssistQueue({
    concurrency: () => this.settings.read().generation.concurrentJobs,
    maxRetries: () => this.settings.read().generation.maxRetries,
    sleep: ms => this.schedule(ms),
  })
  readonly usage = createUsageReader({
    accounts: () =>
      this.settings
        .keyedAccounts()
        .filter(one => (one.providerId ?? SCENARIO_CLOUD) === SCENARIO_CLOUD),
    clientFor: credentials => clientFor(credentials, this.transport),
    queue: createAssistQueue({
      concurrency: () => USAGE_CONCURRENCY,
      maxRetries: () => this.settings.read().generation.maxRetries,
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    }),
    now: () => new Date(),
  })

  private merged: { of: string; all: readonly LocalModel[] } | null = null
  private generationFolderMade: Promise<string> | null = null
  private tripoCatalogue: { language: Language; models: ModelDescriptor[] } | null = null

  constructor(
    private readonly settings: SettingsStore,
    private readonly schedule: (ms: number, signal?: AbortSignal) => Promise<void>,
    private readonly logRateLimit: () => void,
  ) {}

  private mergedCatalogue(): readonly LocalModel[] {
    const own = this.settings.read().ai.ownModels
    const found = this.fromManager.discovered()
    const key = [...own, ...found].map(one => one.id).join('\u0000')
    if (this.merged?.of !== key) this.merged = { of: key, all: catalogueWith(own, found) }
    return this.merged.all
  }
}
