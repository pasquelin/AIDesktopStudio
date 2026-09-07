import type { WorkspaceId } from '@shared/domain/workspace'
import type {
  AssistantAnswer,
  AssistantProgress,
  AssistantThought,
  AssistantWindow,
} from '@shared/domain/assistant'
import type { AssistantNote } from '@shared/domain/assistantNote'
import type { ActionName } from '@shared/domain/assistant'

/**
 * What the assistant asks of whatever is doing its thinking.
 *
 * A port, because the studio ships one implementation and will not always: Scenario's own
 * catalogue model needs no second account and is therefore the right default, but nothing here
 * is specific to it. An implementation that spoke to Anthropic, to an OpenAI-compatible endpoint
 * or to a model on the machine would answer the same shape.
 *
 * The shapes themselves are the shared ones, because they cross the IPC boundary unchanged: what
 * the brain answers is what the window is handed. A second pair of types here would be two to
 * keep in step, and the drift would be silent.
 */
export type AssistantBrain = {
  think: (request: AssistantThought, watch?: TurnWatch) => Promise<AssistantAnswer>
  capabilities: () => Promise<AssistantProviderCapabilities>
  /**
   * What this door reads in one go, asked BEFORE a turn — `null` from a door that names none.
   * Required rather than optional, so a door added later cannot stay silent by omission.
   */
  window: () => Promise<AssistantWindow | null>
}

type AssistantProviderCapabilities = {
  streaming: boolean
  structuredJson: boolean
  multimodalImages: boolean
  contextTokens?: number
  maxOutputTokens?: number
}

/** What follows a turn while it runs: what ends it, and what it is writing. */
export type TurnWatch = {
  /**
   * Stops a turn nobody waits for any more — a window closed mid-answer, or a stop pressed. A
   * local model would otherwise run to its ceiling, and a cloud job is billed until cancelled.
   */
  signal?: AbortSignal
  /** The words as they are written. A door that answers whole never calls it. */
  onProgress?: (progress: AssistantProgress) => void
  /** What went out and what came back, kept rather than shown — see `AssistantNote`. */
  onNote?: (note: AssistantNote) => void
  /** Resolves a bounded action discovery query through the caller's current search context. */
  discover?: (query: string) => Promise<readonly ActionName[]>
}

/**
 * The spaces nothing can generate in, so the model says so before promising a picture. Resolved
 * once per turn, outside any retry: a complaint quotes an answer, and a second reading could ship
 * a different briefing than the one complained about.
 */
export type NotReady = () => Promise<readonly WorkspaceId[]>
