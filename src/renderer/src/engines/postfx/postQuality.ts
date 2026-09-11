/**
 * What a composition is allowed to spend, by the quality the viewport is set to. An effect that
 * chose its own resolution would make the setting unpredictable.
 *
 * The final render never comes through the cheap end: `renderFilm` and `captureStill` pass `high`.
 */
import type { PostCost } from '@shared/domain/postProcessing'
import type { ViewportQuality } from '@shared/domain/scene'

export type PostBudget = {
  /**
   * How many device pixels one pass pixel covers. `2` halves the SCENE render too, the scene
   * being drawn into the head of the chain.
   */
  divisor: number
  /** What share of the samples a sampling effect asks for it actually takes. */
  samples: number
}

const FULL: PostBudget = Object.freeze({ divisor: 1, samples: 1 })
/** Frozen module constants: `budgetFor` runs once per surface per image. */
const FEWER_SAMPLES: PostBudget = Object.freeze({ divisor: 1, samples: 0.6 })
const HALF: PostBudget = Object.freeze({ divisor: 2, samples: 0.4 })

/** A stack of cheap effects is never downscaled, whatever the setting: nothing to save. */
export function budgetFor(heaviest: PostCost | null, quality: ViewportQuality): PostBudget {
  if (quality === 'high' || heaviest === null) return FULL
  if (quality === 'balanced') return heaviest === 'high' ? FEWER_SAMPLES : FULL
  return heaviest === 'high' ? HALF : FEWER_SAMPLES
}

/**
 * A count asked for by a parameter, brought down to what the budget allows. Never below one.
 *
 * The SHARE alone: a node chain carries its own resolution scale rather than a divisor, and
 * asking it to build one back just to be read past would be an invented number.
 */
export function samplesOf(asked: number, budget: Pick<PostBudget, 'samples'>): number {
  return Math.max(1, Math.round(asked * budget.samples))
}

/** Scratch: `chainSize` answers once per surface per image, and its answer is read at once. */
const SIZE = { width: 1, height: 1 }

/**
 * The step a chain's size is rounded UP to.
 *
 * Chains are cached on the SHAPE of a stack and never on its size, and `paneRects` gives a quad
 * four rectangles of different widths whenever a dimension is odd — so four panes walked one
 * chain through four sizes, and `WebGLRenderTarget.setSize` frees its buffers on every change.
 * UP, so a chain is never coarser than the surface it fills.
 */
const SIZE_STEP = 8

/** The size a pass chain is built at for a surface of this size. Never zero. */
export function chainSize(width: number, height: number, budget: PostBudget): typeof SIZE {
  SIZE.width = steppedSize(width / budget.divisor)
  SIZE.height = steppedSize(height / budget.divisor)
  return SIZE
}

function steppedSize(pixels: number): number {
  return Math.max(SIZE_STEP, Math.ceil(pixels / SIZE_STEP) * SIZE_STEP)
}
