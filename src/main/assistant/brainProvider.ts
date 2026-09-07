import type { AssistantModel } from '@shared/domain/assistant'
import type { Job } from '@shared/domain/job'
import { log } from '@main/log'
import type { AssistantThought } from '@shared/domain/assistant'
import type { AssistantBrain, NotReady, TurnWatch } from './brainPort'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import { answeredTurn, notesFor, turnsWith, TurnStopped, type BrainAttempt } from './brainTurn'
import { briefingFor, instructionFor, PREAMBLE_COST, type Briefing } from './instruction'
import { INSTRUCTION_FALLBACK, type ProviderLimits } from './providerLimits'

/**
 * The assistant's thinking, run on Scenario's own catalogue model.
 *
 * Why this and not a second provider: `model_scenario-llm` is an ordinary model of the
 * catalogue, so it goes through the client, the rate limiter, the retries and the cost meter the
 * studio already has — and it needs no second account, no second key, and nothing new in the
 * settings the user has to fill in before the assistant works at all.
 *
 * What it does not have, and what this file therefore carries: no tool use, so the catalogue of
 * actions is described in the instruction and the answer is parsed back out of text; no
 * conversation, so history goes in `textInputs`, ten blocks at most; and no streaming, so the
 * answer arrives whole, after a job.
 */

/**
 * What the sentence is guaranteed, whatever the catalogue grows to. The briefing gets the rest,
 * and at eight thousand characters it holds every action's NAME and the manuals a chain opens.
 *
 * `[M]` At 2 000 the EXPANSION was left 595, and « switch to main » found `git.checkout` without
 * room to be shown it.
 */
export const UTTERANCE_ROOM = 1_500

/**
 * 🛑 What the briefing may cost, taken from the bound the SCHEMA answers — the reason it is no
 * longer a budget: the catalogue is 4 225 characters of names, and the briefing grows only by the
 * manuals a chain opens. Held to 8 500, three of them fitted and the rest were cut in silence.
 */
const briefingRoom = (bounds: ProviderLimits): number =>
  bounds.instructionMax - UTTERANCE_ROOM - PREAMBLE_COST

/** The same against the fallback, for a door that has not read its schema yet. */
export const BRIEFING_ROOM = INSTRUCTION_FALLBACK - UTTERANCE_ROOM - PREAMBLE_COST

export type BrainDeps = {
  /**
   * Runs the model without any of what surrounds a generation — see `JobManager.run`. Which
   * model and under what label is settled where this is wired, not here: this file knows how to
   * ask a question, not which catalogue entry answers it.
   */
  run: (body: Record<string, unknown>, signal?: AbortSignal) => Promise<Job>
  /** The text an output asset holds. */
  readText: (assetId: string) => Promise<string>
  /** Which language model answers. Read on each turn: it is a setting, and settings change. */
  model: () => AssistantModel
  /** What the model itself says it accepts — read once and held, see `providerLimits`. */
  limits: () => Promise<ProviderLimits>
  notReady?: NotReady
}

function bodyFor(
  request: AssistantThought,
  model: string,
  briefing: string,
  instructionMax: number,
  complaint?: string,
): {
  instruction: string
  model: string
  numOutputs: number
  textInputs?: string[]
} {
  // The complaint rides with the history rather than in the instruction: the instruction already
  // states the format, and saying it a second time there displaced the sentence being answered.
  const inputs = turnsWith(request.history, complaint)

  return {
    instruction: instructionFor(briefing, request.utterance, instructionMax),
    model,
    numOutputs: 1,
    ...(inputs.length > 0 ? { textInputs: inputs } : {}),
  }
}

/**
 * The model actually asked for: a choice the schema does not list is a 400 waiting to happen, and
 * three of the four this studio declares had already left the list.
 *
 * `said` is what keeps the journal readable — the substitution holds for the whole session, so
 * warning per turn would repeat one line for as long as the studio is open.
 */
function askedModel(chosen: AssistantModel, limits: ProviderLimits, said: Set<string>): string {
  if (limits.models.length === 0 || limits.models.includes(chosen)) return chosen
  if (limits.defaultModel === null) return chosen

  if (!said.has(chosen)) {
    said.add(chosen)
    log.warn(
      'assistant',
      `${chosen} is no longer offered by the model: asking ${limits.defaultModel}`,
    )
  }

  return limits.defaultModel
}

async function answerFrom(
  job: Job,
  readText: (assetId: string) => Promise<string>,
): Promise<string> {
  const assetId = job.assetIds[0]
  return assetId === undefined ? '' : await readText(assetId)
}

export function createProviderBrain({
  run,
  readText,
  model,
  limits,
  notReady,
}: BrainDeps): AssistantBrain {
  const substituted = new Set<string>()

  /** One round trip: run the model, read the asset it wrote, hand back text and what it cost. */
  const ask = async (
    request: AssistantThought,
    chosen: string,
    bounds: ProviderLimits,
    briefing: Briefing,
    watch: TurnWatch,
    complaint?: string,
  ): Promise<BrainAttempt> => {
    const body = bodyFor(request, chosen, briefing.text, bounds.instructionMax, complaint)
    // What this door is bounded by is a LENGTH, so what it reports is one: a token count here
    // would be an estimate shown beside a measured ceiling.
    watch.onProgress?.({ delta: '', promptChars: body.instruction.length })

    const job = await run(body, watch.signal)
    const cost = job.cost ?? 0

    // 🛑 Raised and never answered empty: read as an unreadable answer, a stopped turn asked the
    // door a SECOND time — a second billed job — and the window then called it lost, not stopped.
    if (job.status === 'cancelled') throw new TurnStopped()

    if (job.status !== 'succeeded') {
      log.warn('assistant', `thinking failed: ${job.error ?? job.status}`)
      return { answer: '', cost }
    }

    return { answer: await answerFrom(job, readText), cost }
  }

  return {
    capabilities: async () => ({
      streaming: false,
      structuredJson: true,
      multimodalImages: false,
      maxOutputTokens: 1,
    }),
    // In CHARACTERS, because that is the unit the model's own `instruction` field is bounded in.
    window: async () => {
      const bounds = await limits()
      return { size: bounds.instructionMax, unit: 'characters', assumed: bounds.assumed }
    },
    // 🛑 No words at the wheel: this door answers through a JOB, so the text exists only once the
    // asset is written. What a stop reaches is the job, which is billed and outlives the ask.
    think: async (request, watch = {}) => {
      // Read once, outside the retry: a setting changed between two attempts would have the model
      // complained to be a different one from the model that answered.
      const bounds = await limits()
      const chosen = askedModel(model(), bounds, substituted)
      const briefing = await briefingFor(request, briefingRoom(bounds), notReady)

      return await answeredTurn(
        briefing,
        (shown, complaint) => ask(request, chosen, bounds, shown, watch, complaint),
        undefined,
        notesFor(SCENARIO_CLOUD, chosen, watch),
        watch.discover,
      )
    },
  }
}
