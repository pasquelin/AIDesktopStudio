import type { EngineFailure } from './failure'
import type { AiRoleId, RoleProvider } from './aiRole'
import type { Compatibility } from './aiMemory'
import type { DownloadProgress, LocalModel } from './localModel'
import { fitAllowsUse, type FitObstacle } from './modelFit'

/**
 * What the manager screen reads — one row per ROLE, never one per model.
 *
 * The verdict travels with each candidate rather than being recomputed in the window: the main
 * process is the one holding the memory reading, and two sides deciding on their own would
 * disagree the moment a job starts.
 */

/** Where a choice came from, which is what tells "inherited" from "set here". */
export type ChoiceScope = 'app' | 'project'

export type OwnModelProfile = 'motion'

/** The values beside the type: the scope selector composes a key per member, and a guard reads it. */
export const CHOICE_SCOPES: readonly ChoiceScope[] = ['app', 'project']

export type ModelCandidate = {
  readonly model: LocalModel
  readonly installed: boolean
  /** Whether the weights are resident in memory right now — what "activate" means, ADR-21 § D. */
  readonly loaded: boolean
  /** Rank 3: the person's own file, so nothing vouches for its licence. A mark, never a lock. */
  readonly unverified: boolean
  /** Whether removing it drops the ENTRY rather than the weights — see `isSuppliedModel`. */
  readonly supplied: boolean
  /**
   * Whether its runtime can hold it in memory at all. `false` for one that opens its weights per
   * call — offering "Load" there produced a memory sentence about a gesture that does not exist.
   */
  readonly holdable: boolean
  /**
   * How many employments this ONE download answers for.
   *
   * Shown because the catalogue holds twenty-five models for nineteen employments, and the
   * difference between them is not the quality: SSD-1B serves six for 4.47 GB where Mochi serves
   * one for 133. Nothing here ranks them — the figure is said, and the choice stays the person's.
   */
  readonly serves: number
  /** `insufficient-memory` and `incompatible` are shown, greyed, WITH their reason — never hidden. */
  readonly fit: Compatibility
  /** What the reason NAMES. Carried rather than recomputed: the machine decides, the window says. */
  readonly obstacle: FitObstacle | null
}

export type RoleRow = {
  readonly role: AiRoleId
  /** What serves it right now, choice or default. `null` when nothing can. */
  readonly provider: RoleProvider | null
  /**
   * What EACH scope holds, `null` where nothing was chosen — never what serves.
   *
   * Both, because a screen edits one scope while the summary shows the effect of both: reading
   * the effect back into the controls left a click writing a scope that already agreed, doing
   * nothing and saying nothing.
   */
  readonly chosen: Readonly<Record<ChoiceScope, RoleProvider | null>>
  readonly candidates: readonly ModelCandidate[]
  /**
   * The clouds offered for this role — those that serve it AND have an account behind them.
   * Empty is an ordinary answer: dictation is served on this machine or not at all.
   */
  readonly clouds: readonly string[]
}

/**
 * Whether an install already holds the disk. One at a time, wherever it was begun — three screens
 * derived it side by side, and the day a fourth source of downloads lands they would disagree.
 */
export function aiDiskBusy(overview: Pick<AiOverview, 'installing' | 'ollama'> | null): boolean {
  return overview !== null && (overview.installing !== null || overview.ollama.progress !== null)
}

/**
 * Whether an employment has something answering for it today — a choice, never a fill-in.
 *
 * Beside the type rather than in either reader: the home counts it and the empty centre asks it,
 * and the day `provider` gains a third reading one of them would ship the old answer.
 */
export function servedBy(row: RoleRow): boolean {
  return row.provider !== null
}

/**
 * Where a choice has to be written to take effect: the project's, once that project overrides the
 * role. Writing the application's there would agree with itself and change nothing on screen.
 */
export function writeScopeFor(
  row: Pick<RoleRow, 'chosen'>,
  projectPath: string | null,
): ChoiceScope {
  return projectPath !== null && row.chosen.project !== null ? 'project' : 'app'
}

/**
 * Whether a candidate may be OFFERED for its role: on the disk, and not refused by the machine.
 * Installed first rather than best-fitting — a model nobody downloaded answers nothing.
 */
export function canServe(candidate: ModelCandidate): boolean {
  return candidate.installed && fitAllowsUse(candidate.fit)
}

/** What the machine offers, as the screen states it above the rows. */
export type MachineSummary = {
  readonly physicalBytes: number
  readonly availableBytes: number
  readonly diskFreeBytes: number | null
  /** `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, …)`, or nothing on a machine that hid it. */
  readonly gpu: string | null
  /**
   * What the GPU holds, ANSWERED by a runtime rather than deduced — `null` where none did.
   *
   * On a `unified` machine it is the same pot as the system memory; on a `split` one it is the
   * only figure that decides whether weights fit, and the reason a RAM-only reading was wrong in
   * both directions.
   */
  readonly vram: { readonly totalBytes: number; readonly freeBytes: number } | null
}

/**
 * Why a load did not happen, kept until the next gesture so the screen can say it.
 *
 * 🛑 Discriminated, and that is what stops a figure from being invented: only the admission
 * weighed bytes, so only its branch carries them. A runtime that refused for its own reasons
 * used to borrow the last published reading and say "8 GB asked for" about a broken addon.
 */
export type LoadRefusal =
  | {
      readonly reason: 'beyond-machine'
      readonly modelId: string
      readonly neededBytes: number
      readonly availableBytes: number
    }
  | { readonly reason: 'incomplete'; readonly modelId: string }
  | { readonly reason: 'network'; readonly modelId: string }
  | { readonly reason: EngineFailure; readonly modelId: string }
  | { readonly reason: 'failed'; readonly modelId: string }

/** Why an install did not land, kept until the next try so the screen can say it. */
export type InstallRefusal =
  | { readonly reason: 'network'; readonly modelId: string }
  | { readonly reason: 'checksum'; readonly modelId: string }
  | { readonly reason: 'failed'; readonly modelId: string }

export type AiOverview = {
  readonly roles: readonly RoleRow[]
  readonly machine: MachineSummary
  /** Which project the project-scoped column applies to. `null` when none is open. */
  readonly projectPath: string | null
  /** At most one install runs at a time: a second would compete for the same disk and bar. */
  readonly installing: { readonly modelId: string; readonly progress: DownloadProgress } | null
  /** The load in flight and how far it is, from 0 to 1. One at a time, like the install. */
  readonly loading: { readonly modelId: string; readonly ratio: number } | null
  /** What the last load refused, or nothing. Cleared by the next load, never by a compose. */
  readonly loadFailure: LoadRefusal | null
  /** What the last install refused, or nothing. Cleared by the next install, never by a compose. */
  readonly installFailure: InstallRefusal | null
  /**
   * Whether Ollama is on this computer, whether it is answering, and the models it listed.
   * The settings screen always names the three sources so a person can pick among them.
   */
  readonly ollama: OllamaOffer
  /** What the local engine's environment is missing, and whether a repair is running. */
  readonly engine: EngineOffer
}

/**
 * The tensor libraries the door needs, as the engine itself reads them off its own `.dist-info`.
 *
 * `missing` empty AND `known` true is the only reading that means ready: an engine that has not
 * answered yet knows nothing, and a nothing must never be shown as a clean bill of health.
 */
export type EngineOffer = {
  readonly profile?: OwnModelProfile
  readonly known: boolean
  /** Absent or older than declared, by name. What the button installs, and what it says. */
  readonly missing: readonly string[]
  /** 0 to 1 while pip runs. `null` when nothing is in flight. */
  readonly progress: number | null
  /** The last repair did not land. Cleared by the next try. */
  readonly failed: boolean
}

export type OllamaOffer = {
  readonly ready: boolean
  /** A binary was found on this computer — usual locations or a studio copy. */
  readonly installed: boolean
  readonly names: readonly string[]
  /** 0 to 1 while the official archive is being fetched. `null` when nothing is in flight. */
  readonly progress: number | null
  /** The last official-archive install did not land. Cleared by the next try. */
  readonly failed: boolean
}
