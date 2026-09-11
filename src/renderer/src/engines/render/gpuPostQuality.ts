/**
 * What the Advanced engine's chain is allowed to spend, by the quality the viewport is set to.
 *
 * 🛑 DERIVED from `postQuality`, never a second table. The setting has to buy the same thing on
 * both engines: a level that halves the pixels an occlusion is worked out at, and takes 40 % of
 * the samples it asks for, must do so whichever chain is running — otherwise « Performance »
 * means two different pictures and neither can be compared with the other.
 *
 * The shapes differ because the chains do. A GLSL chain is built at a SIZE, so the GL budget
 * says by how much to divide it; a `RenderPipeline` node carries its own `resolutionScale`, a
 * share of the frame. The two are the same number, read the other way up.
 */
import type { PostCost } from '@shared/domain/postProcessing'
import type { ViewportQuality } from '@shared/domain/scene'
import { budgetFor, samplesOf } from '../postfx/postQuality'

export type GpuBudget = {
  /** What share of the frame an occlusion is worked out at — `GTAONode.resolutionScale`. */
  resolutionScale: number
  /**
   * What share of the samples a sampling effect asks for it actually takes.
   *
   * Also what the temporal anti-aliaser reads, there being nothing else to read: three 0.185
   * exposes no sample COUNT on a `TRAANode` — its samples are frames of a fixed jitter sequence
   * — so its one lever, the sub-pixel correction, is kept exactly where nothing is being cut.
   */
  samples: number
}

/** The same reading as the GL chain's, in the units a node chain takes. */
export function gpuBudgetFor(heaviest: PostCost | null, quality: ViewportQuality): GpuBudget {
  const budget = budgetFor(heaviest, quality)
  return { resolutionScale: 1 / budget.divisor, samples: budget.samples }
}

/** A count asked for by a parameter, brought down to what the budget allows. Never below one. */
export function gpuSamplesOf(asked: number, budget: GpuBudget): number {
  return samplesOf(asked, { divisor: 1 / budget.resolutionScale, samples: budget.samples })
}
