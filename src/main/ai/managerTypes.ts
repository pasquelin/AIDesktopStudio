import type { AiOverview, ChoiceScope, OwnModelProfile } from '@shared/domain/aiOverview'
import type { AiRoleId, RoleProvider } from '@shared/domain/aiRole'
import type { MemorySnapshot, RuntimeOccupancy } from '@shared/domain/aiMemory'
import type { RuntimeEndpointId } from '@shared/domain/aiRuntime'
import type { DownloadProgress, LocalModel } from '@shared/domain/localModel'
import type { PartialSettings, Settings } from '@shared/domain/settings'
import type { HardwareFacts } from './hardwareProbe'
import type { LocalRuntimes } from './localRuntimes'

export type HeldRuntime = RuntimeOccupancy & { modelId: string }
export type LoadingModel = { modelId: string; ratio: number; abort: AbortController }

/**
 * What the manager needs from the rest of the studio, injected — so the whole of it is testable
 * without a disk, a network or an account.
 */
export type ManagerDeps = {
  facts: () => Promise<HardwareFacts>
  /** From the facts already read: probing twice costs two `getGPUInfo` per compose, for one answer. */
  snapshotOf: (
    facts: HardwareFacts,
    runtimeBytes: Readonly<Record<RuntimeEndpointId, RuntimeOccupancy>>,
  ) => MemorySnapshot
  settings: () => Settings
  writeSettings: (partial: PartialSettings) => unknown
  currentProjectPath: () => string | null
  /** The clouds an account is held for. What each SERVES is declared in `aiCloud.ts`, not here. */
  readyClouds: () => readonly string[]
  /** What can install and what can converse, by LOADER — never a branch on a model's id. */
  runtimes: LocalRuntimes
  /** Pushed on every change, so a window that did not ask still follows an install. */
  emit: (overview: AiOverview) => void
  log: (level: 'info' | 'warn' | 'error', message: string) => void
  now: () => number
  /**
   * How long a machine reading stays fresh. `[M]` A compose costs `getGPUInfo` + `statfs` + two
   * memory readings on every assistant turn. A load always reads afresh, whatever this says (R2).
   */
  factsTtlMs?: number
  /** `0` keeps them. Dictation already had this; llama and diffusion sat in VRAM all session. */
  idleUnloadMinutes?: () => number
  /** Tests inject a clock. Production uses `setTimeout`. */
  schedule?: (run: () => void, ms: number) => () => void
  /** Whether an Ollama binary is on this computer — usual locations or a studio copy. */
  ollamaInstalled: () => boolean
  /** Fetches the official archive into the studio folder when none is on this computer. */
  installOllama: (onProgress: (ratio: number) => void, signal: AbortSignal) => Promise<void>
  /**
   * What the ENGINE says of the door's environment, and `null` while nothing has answered.
   *
   * Asked of the engine and never computed here: the declaration lives in `pyproject.toml`, and a
   * second reading of it in TypeScript would drift from the one `uv` resolves.
   */
  engineMissing: (profile?: OwnModelProfile) => Promise<EngineEnvironment | null>
  /**
   * Installs exactly what the engine named, with the interpreter the app ships.
   *
   * Answers whether it asked an index for the CUDA wheels, which is never what it GOT: the
   * installer reads that back off `engineMissing` and says when the two disagree.
   */
  installEngine: (
    onProgress: (ratio: number) => void,
    signal: AbortSignal,
    profile?: OwnModelProfile,
  ) => Promise<{ readonly cuda: boolean }>
}

/** What one `engine.requirements` answered, kept as the screen needs to read it. */
export type EngineEnvironment = {
  /** Absent or older than declared, by name. Empty is a complete environment. */
  readonly missing: readonly string[]
  /** Whether the installed torch was built with CUDA. `null` is UNKNOWN, never "no CUDA". */
  readonly torchCuda: boolean | null
}

export type AiManager = {
  overview: () => Promise<AiOverview>
  /**
   * Re-publishes for a change the manager cannot see — an open project, an account. Without it a
   * settings window left open keeps a stale path and a scope selector writing where nobody looks.
   */
  refresh: () => Promise<void>
  /**
   * What serves one role right now, re-composed rather than remembered: a model uninstalled
   * outside the studio would leave a turn reaching nothing.
   */
  providerOf: (role: AiRoleId) => Promise<RoleProvider | null>
  /**
   * 🛑 The same narrowing as `providerOf`, for SEVERAL roles at once. `overview()` composes
   * twenty-one rows with their candidates and verdicts — `[M]` in `overview.ts` names that as the
   * cost the assistant's turn was freed of, and asking it here would pay it back.
   */
  unservedRoles: (roles: readonly AiRoleId[]) => Promise<readonly AiRoleId[]>
  choose: (role: AiRoleId, provider: RoleProvider | null, scope: ChoiceScope) => Promise<AiOverview>
  /** One settings write for every employment a pick serves. Sequential `choose` dropped all but the last. */
  chooseMany: (
    writes: readonly { role: AiRoleId; provider: RoleProvider | null }[],
    scope: ChoiceScope,
  ) => Promise<AiOverview>
  /**
   * The ids whose weights are on this disk, read off the last runtime reading.
   *
   * Synchronous and never a probe: the model panel asks it once per summary, on every keystroke
   * of its search field. Empty until a reading has landed, which reads as "not here yet" — the
   * honest answer while nothing has said otherwise.
   */
  installedIds: () => ReadonlySet<string>
  install: (modelId: string) => Promise<AiOverview>
  cancelInstall: () => Promise<AiOverview>
  /** Puts Ollama on this computer when it is missing. One at a time, like a model install. */
  installOllama: () => Promise<AiOverview>
  cancelInstallOllama: () => Promise<AiOverview>
  /** Asks the engine what its environment lacks. Answered by the core, so it wakes no door. */
  readEngine: (profile?: OwnModelProfile) => Promise<AiOverview>
  /** Installs what it named. Long: 682 MB on macOS, 4.7 GB on Linux, and cancellable. */
  installEngine: (profile?: OwnModelProfile) => Promise<AiOverview>
  cancelInstallEngine: () => Promise<AiOverview>
  remove: (modelId: string) => Promise<AiOverview>
  /**
   * Holds the weights in memory, or says why it could not — never a freeze. Cancellable, and it
   * reports: the load of a fourteen-billion-parameter model is tens of seconds of disk.
   */
  load: (modelId: string) => Promise<AiOverview>
  /**
   * A generation that skipped this drew with whatever was already resident — another model's
   * weights, or nothing.
   */
  ensureLoaded: (modelId: string) => Promise<void>
  /** Changes only after this model's weights have entered a runtime anew. */
  loadedEpoch?: (modelId: string) => number | null
  cancelLoad: () => Promise<AiOverview>
  unload: (modelId: string) => Promise<AiOverview>
  /** Rearms idle unload and the admission LRU. */
  noteUse: (modelId: string) => void
  /** Marks the model busy until the returned function runs. */
  hold: (modelId: string) => () => void
  /** Drops the idle timer. Called when the application is going away. */
  dispose: () => void
  /** A catalogue id, including one Ollama just listed. Unknown is expected. */
  lookup: (modelId: string) => LocalModel | null
  /**
   * What a runtime listed, as of the last compose — Ollama's tags, and nothing else today.
   *
   * Synchronous and possibly empty: the registry asks it per summary, and « not listed yet » is
   * the honest answer before the first compose rather than a round trip inside a getter.
   */
  discovered: () => readonly LocalModel[]
  /**
   * Drops the discovered listing so the next compose re-asks. A tag deleted outside must not
   * keep being served from cache; the stored choice is left alone.
   */
  forgetDiscovered: () => void
  /** Records a model the person supplied — rank 3 of ADR-20, and the gesture is theirs. */
  addOwnModel: (model: LocalModel) => Promise<AiOverview>
  /**
   * The install lock itself, and it RETHROWS where `install` logs: the dictation session tells a
   * broken digest from a network that gave up. Asking for a model in flight joins it.
   */
  installModel: (
    model: LocalModel,
    onProgress: (progress: DownloadProgress) => void,
    signal?: AbortSignal,
  ) => Promise<void>
}
