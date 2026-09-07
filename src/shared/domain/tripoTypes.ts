/** The cloud id. Written once, read by the runner, the registry and the picker alike. */
export const TRIPO_CLOUD = 'tripo'

/** `https://openapi.tripo3d.ai/v3` — measured 2026-08-31: a bare GET answers 401 code 2. */
export const TRIPO_BASE_URL = 'https://openapi.tripo3d.ai/v3'

/**
 * The buckets Tripo counts concurrent tasks in. Not a studio invention: exceeding one answers
 * HTTP 429 code 2000, so the studio holds its own counters rather than discovering a refusal.
 */
export type TripoLane = 'model-h' | 'model-p' | 'image' | 'animation' | 'post-process' | 'mesh'

/** Their published ceilings. `image` at ONE is what makes a lane per category necessary at all. */
export const TRIPO_LANE_LIMITS: Record<TripoLane, number> = {
  'model-h': 10,
  'model-p': 5,
  image: 1,
  animation: 10,
  'post-process': 5,
  mesh: 10,
}

/**
 * One runnable thing: an endpoint, and the model it is asked for when it takes one.
 *
 * 🛑 Every endpoint, every `model` value and every REQUIRED input below was measured against the
 * live service on 2026-08-31, by posting an incomplete body — refused, so no task was created and
 * nothing was billed. Their reference contradicted itself on all of it: the model page spells
 * `tripo-v3.1`, which the service refuses outright.
 */
export type TripoEntry = {
  /** Path under `TRIPO_BASE_URL`, with no leading slash. */
  readonly endpoint: string
  /** The `model` parameter, for the endpoints that take one. */
  readonly model?: string
  readonly name: string
  readonly family: ModelFamily
  /** A capability of `CAPABILITIES_BY_FAMILY` — what employment the picker offers it under. */
  readonly capability: string
  readonly lane: TripoLane
  /**
   * What the run costs with its knobs at their defaults; what a knob adds is on the knob.
   *
   * MEASURED on `text-to-model` alone: 10 credits with `texture:false` and `pbr:false`, which is
   * the documented 20 less the 10 that dropping the texture saves. Every other figure here is
   * still their documentation's.
   */
  readonly credits: number
  /** Answers facts instead of a file — nothing is brought down, and the row reads the answer. */
  readonly answersFacts?: true
  readonly fields: readonly LocalFieldTemplate[]
}

/** `tripo:<endpoint>:<model>` — what a job target carries, and what routes its poll. */
const TRIPO_PREFIX = 'tripo:'

export function tripoModelId(entry: TripoEntry): string {
  return `${TRIPO_PREFIX}${entry.endpoint}${entry.model ? `:${entry.model}` : ''}`
}

export function isTripoModelId(modelId: string): boolean {
  return modelId.startsWith(TRIPO_PREFIX)
}
import type { ModelFamily } from './model'
import type { LocalFieldTemplate } from './localFields'
