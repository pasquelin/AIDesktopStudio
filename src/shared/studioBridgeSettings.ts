import type { AccountSummary, AccountsResult } from './domain/account'
import type { CreditBalances } from './domain/credits'
import type {
  Memory,
  MemoryDraft,
  MemoryIndexing,
  MemoryPatch,
  MemoryQuery,
  MemoryRecallAsk,
  MemoryScope,
} from './domain/assistantMemory'
import type { CostEstimate, Job, JobProgress, JobTarget } from './domain/job'
import type { ModelDescriptor, ModelPage, ModelQuery } from './domain/model'
import type { PlanAccess } from './domain/plan'
import type { ContextUse } from './domain/projectContext'
import type {
  PromptStyle,
  PromptSuggestion,
  PromptTranslation,
  SuggestPromptsRequest,
} from './domain/promptAssist'
import type { AuthState, PartialSettings, Settings, SettingsSectionId } from './domain/settings'
import type { SettingActionId } from './domain/settingsRegistry'
import type { UsageCursors, UsageEventPage, UsagePeriod, UsageReport } from './domain/usage'
import type { McpState, Unsubscribe } from './ipcEvents'

export type StudioBridgeSettings = {
  settings: {
    read: () => Promise<Settings>
    write: (partial: PartialSettings) => Promise<Settings>
    authState: () => Promise<AuthState>

    /** Opens the settings window on a section, or focuses it there if it is already up. */
    open: (section: SettingsSectionId) => Promise<void>
    /**
     * Runs one of the buttons of the settings window. A single channel rather than one per
     * action: they differ only by which id is named, and the main process is what decides
     * whether a given one is allowed to do anything.
     */
    runAction: (id: SettingActionId) => Promise<void>
    /**
     * Whether the settings window holds changes nobody has applied. Told to the main process
     * because closing a window is its decision, and it has no other way to know.
     */
    setPending: (pending: boolean) => Promise<void>
    /**
     * Settings are owned by the main process and replicated by every window. Without this, a
     * theme changed in the settings window would only reach the studio on the next launch.
     */
    onChange: (callback: (settings: Settings) => void) => Unsubscribe
    /** Section the settings window is asked to show while it is already open. */
    onSection: (callback: (section: SettingsSectionId) => void) => Unsubscribe
  }

  /**
   * What the assistant has learned — the project's, and the machine's own.
   *
   * `scope` is on every call rather than implied by a second namespace: the two behave alike in
   * every respect but which file they land in, and a window that filters a list by one of them
   * would be a window that could get it wrong.
   *
   * A project scope answers nothing at all when no project is open. That is not a failure and
   * is not reported as one — it is a studio on its home screen.
   */
  memory: {
    list: (scope: MemoryScope, query: MemoryQuery) => Promise<readonly Memory[]>
    /**
     * What ANSWERS a question, best first — never the same call as `list`, which filters.
     *
     * 🛑 The one door the question is embedded behind: the model lives in the main process and a
     * window that scored its own would be a window holding ten thousand vectors. Empty for a
     * studio with no project open, and never a refusal.
     */
    recall: (scope: MemoryScope, ask: MemoryRecallAsk) => Promise<readonly Memory[]>
    read: (scope: MemoryScope, id: string) => Promise<Memory | null>
    remember: (scope: MemoryScope, draft: MemoryDraft) => Promise<Memory | null>
    /** Nothing when no such memory is held, which a window tells from a refusal by asking again. */
    amend: (scope: MemoryScope, id: string, patch: MemoryPatch) => Promise<Memory | null>
    forget: (scope: MemoryScope, id: string) => Promise<boolean>
    /** Reads the file back into the index. Answers how many memories stand once it has. */
    rebuild: (scope: MemoryScope) => Promise<number>
    /** Everything forgotten, the file included. What « reset this project's memory » runs. */
    reset: (scope: MemoryScope) => Promise<void>
    /**
     * How many memories have no embedding yet for the model that is chosen. `0` where none is —
     * a studio with no embedding model has nothing pending, it has nothing to compute.
     */
    pending: (scope: MemoryScope) => Promise<number>
    /**
     * Rewrites the file with one line per standing memory, dropping what was forgotten.
     * Answers how many lines it saved. `0` where there was nothing to save.
     */
    compact: (scope: MemoryScope) => Promise<number>
    /** Starts computing what is missing, in the background. Answers as soon as it has started. */
    index: (scope: MemoryScope) => Promise<void>
    /** Stops the run in flight. What it already wrote is kept — see `MemoryVectors`. */
    stopIndex: (scope: MemoryScope) => Promise<void>
    /** Fires for every window when any of them writes: two replicas of one file is one too many. */
    onChanged: (callback: (scope: MemoryScope) => void) => Unsubscribe
    /** How far the embedding of a scope has got. Silent while nothing is being computed. */
    onIndexed: (callback: (progress: MemoryIndexing) => void) => Unsubscribe
  }

  /**
   * The door onto this machine — its own pair, like `window` and `updates`, because the SETTING
   * is precisely not the answer: a server that failed to bind is stopped and `mcp.enabled` still
   * reads true.
   *
   * 🛑 The port and never the token. The token is the whole of what stands between a local
   * process and `tools/call`; it goes to the clipboard from the main process, and no window
   * holds it.
   */
  mcp: {
    state: () => Promise<McpState>
    /**
     * The door settling, open or shut. Pushed rather than polled: the port is bound after the
     * setting that asked for it has already been broadcast, so a window reading on that change
     * reads the instant BEFORE it started listening.
     */
    onState: (callback: (state: McpState) => void) => Unsubscribe
  }

  /**
   * The stored API keys. An API key carries its own project and team — the API lists neither —
   * so switching accounts is the only way to change which library the studio reads. The local
   * project is untouched by any of it: it is the user's disk.
   */
  accounts: {
    list: () => Promise<AccountSummary[]>
    /** Stores a key under a name. The name is required and must not already be taken. */
    add: (name: string, key: string, secret: string, providerId?: string) => Promise<AccountsResult>
    rename: (id: string, name: string) => Promise<AccountsResult>
    remove: (id: string) => Promise<AccountsResult>
    activate: (id: string) => Promise<AccountsResult>
    /** Every window follows the switch: the account is owned by the main process. */
    onChange: (callback: (accounts: AccountSummary[]) => void) => Unsubscribe
    /** What each key has LEFT to spend. A key whose cloud publishes none is ABSENT, never zero. */
    credits: () => Promise<CreditBalances>
  }

  provider: {
    searchModels: (query?: ModelQuery) => Promise<ModelPage>
    /** Signed picture URL per asset id, absent for the ones the API has nothing for. */
    modelPreviews: (assetIds: readonly string[]) => Promise<Record<string, string>>
    describeModel: (modelId: string) => Promise<ModelDescriptor>
    /**
     * The account's plan, against which a model's `requiredPlanLevel` is read. `null` when it
     * cannot be read — the picker then offers everything, as it did before it asked.
     */
    plan: () => Promise<PlanAccess | null>
    /**
     * Rewrites a draft into on-model prompts, each with the settings the API proposes for it.
     * Free — measured at 0 creative units — and answered in one round trip: the endpoint hands
     * back a job, but its result is in the response, so nothing here is polled.
     */
    suggestPrompts: (request: SuggestPromptsRequest) => Promise<PromptSuggestion[]>
    /**
     * Carries a draft into the language the models are trained in, and says what it recognized
     * it as. Replaces the text rather than proposing beside it — nothing is invented here.
     */
    translatePrompt: (draft: string) => Promise<PromptTranslation>
    /** Reads the style of the reference pictures, so a prompt can be written from it. */
    describeStyle: (images: readonly string[]) => Promise<PromptStyle>
    /**
     * Queues a generation. `use` says whether the open project's context joins this one shot;
     * ABSENT MEANS APPLY — the context is what the project already says, and a caller that lost
     * the field must not silently drop it.
     */
    generate: (modelId: string, body: Record<string, unknown>, use?: ContextUse) => Promise<Job>
    /**
     * What running that exact form would cost, without running it. `null` when the API declines
     * to price it; a rejection when the call itself failed, which a caller may treat as no
     * figure.
     */
    estimateCost: (
      target: JobTarget,
      body: Record<string, unknown>,
      use?: ContextUse,
    ) => Promise<CostEstimate>
    /** A picture, base64, up to 6 MB. Returns the id of the asset the API kept. */
    uploadAsset: (name: string, image: string) => Promise<string>
    cancelJob: (jobId: string) => Promise<void>
    listJobs: () => Promise<Job[]>
    onProgress: (callback: (progress: JobProgress) => void) => Unsubscribe
    /**
     * The whole list, sent when it gains or loses an entry rather than when one of them moves.
     *
     * A progress event names a job by id, so a replica can only merge it into one it already
     * holds: a job picked up from a previous session, and one that left the session because its
     * project is no longer open, are both invisible to `onProgress` by construction.
     */
    onJobsChanged: (callback: (jobs: Job[]) => void) => Unsubscribe
    /**
     * What every stored account spent over the period — consumption only, never a balance: the
     * API exposes no such thing. Accounts are queried together and a refused key is reported in
     * `silent` rather than failing the call, since a revoked key is the ordinary case.
     */
    usageReport: (period: UsagePeriod) => Promise<UsageReport>
    /**
     * The raw billable events, paged: the one section large enough to slow the window down.
     *
     * Cursors are opaque — hand back the ones the previous page returned, `{}` for the first.
     */
    usageEvents: (period: UsagePeriod, cursors: UsageCursors) => Promise<UsageEventPage>
  }
}
