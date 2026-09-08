import type { Compatibility, MemorySnapshot } from './aiMemory'
import { modelRefusalOf, runtimeStatusOf, type LocalModel } from './localModel'

/**
 * How a model stands against THIS machine — the verdict a manager shows on every candidate.
 *
 * Kept out of `main/` on purpose: the window explains the verdict and the main process decides on
 * it, so both sides read the same rule rather than two that drift.
 */

/** What the machine offers, as the verdict needs to see it. Free disk is `null` when unreadable. */
export type MachineOffer = {
  readonly snapshot: MemorySnapshot
  readonly diskFreeBytes: number | null
  readonly installed: boolean
  /**
   * Whether the runtime that would host this model is answering.
   *
   * Its own field rather than folded into `installed`: a runtime the studio does not start —
   * Ollama is one — leaves a model that is perfectly compatible with nowhere to run, and the two
   * ask for opposite gestures. Always true for a loader the application ships with.
   */
  readonly runtimeReady: boolean
  /**
   * NVIDIA CUDA. TRELLIS's kernels do not run on Metal, and absent is "no card".
   *
   * Three states and not two booleans: `repairable` is a card that IS here with a torch built
   * without CUDA beside it, which a download mends — and telling someone holding an RTX that
   * their model needs an NVIDIA card is the sentence that separation exists to stop.
   */
  readonly cuda?: CudaState
}

/** What a card and the torch beside it allow. Absent everywhere means there is no card. */
export type CudaState = 'usable' | 'repairable'

/**
 * What stands between a model and this machine, or `null` when nothing does.
 *
 * Narrower than the verdict on purpose: `Compatibility` says `insufficient-memory` for a disk
 * that is full as much as for a machine that is small, and a screen that explained the second
 * where the first is true would be telling the person to free the wrong thing.
 */
export type FitObstacle =
  'refused' | 'plugin' | 'runtime' | 'disk' | 'memory' | 'tight' | 'cuda' | 'cudaTorch'

/** The one decision the verdict and the sentence beside it both read, so neither can drift. */
export function fitObstacleOf(model: LocalModel, offer: MachineOffer): FitObstacle | null {
  if (modelRefusalOf(model) !== null) return 'refused'

  // Before the runtime that would HOST it: a model nothing here can open does not become usable
  // because a process answered. The download is still offered — see the note at the bottom.
  if (runtimeStatusOf(model) !== 'supported') return 'plugin'

  if (model.needsCuda === true && offer.cuda !== 'usable') {
    return offer.cuda === 'repairable' ? 'cudaTorch' : 'cuda'
  }

  // Before the disk and before the memory: neither figure changes anything while the runtime that
  // would hold the model is not answering, and what it asks for is a different gesture entirely.
  if (!offer.runtimeReady) return 'runtime'

  // Disk is checked before memory, and only when the model is not already here: a model that will
  // not fit on the disk cannot be tried at all, whatever the memory says.
  if (!offer.installed && offer.diskFreeBytes !== null) {
    if (offer.diskFreeBytes < model.diskBytes) return 'disk'
  }

  if (model.reservationBytes > offer.snapshot.availableBytes) return 'memory'

  // Past two thirds of what is offered, it will run and it will hurt — the reservation is a floor,
  // never the peak (R3), so the margin above it is what the job actually has to grow into.
  if (model.reservationBytes > offer.snapshot.availableBytes * (2 / 3)) return 'tight'

  return null
}

/**
 * `runtime` reads as `incompatible`, and that is the point of `FitObstacle` existing: the verdict
 * says the studio cannot run this here and now, and only the obstacle can name what to do about it.
 */
const VERDICT: Record<FitObstacle, Compatibility> = {
  refused: 'incompatible',
  plugin: 'incompatible',
  cuda: 'incompatible',
  cudaTorch: 'incompatible',
  runtime: 'incompatible',
  disk: 'insufficient-memory',
  memory: 'insufficient-memory',
  tight: 'slow',
}

/** The verdict AND what it names, read in one pass: the caller needs both and they must agree. */
export function fitReadingOf(
  model: LocalModel,
  offer: MachineOffer,
): { fit: Compatibility; obstacle: FitObstacle | null } {
  const obstacle = fitObstacleOf(model, offer)
  if (obstacle !== null) return { fit: VERDICT[obstacle], obstacle }

  return { fit: offer.snapshot.source === 'runtime' ? 'compatible' : 'unknown', obstacle: null }
}

/**
 * Whether a model fits, and how comfortably.
 *
 * `unknown` is the DEFAULT rather than a failure — R1 of ADR-19: a probe reading may sort a
 * catalogue and explain a refusal, but it never admits a job, so it can never answer `compatible`
 * either. Saying `unknown` where no runtime answered is the only true reading.
 */
export function fitOf(model: LocalModel, offer: MachineOffer): Compatibility {
  return fitReadingOf(model, offer).fit
}

/** Whether a verdict lets the studio offer the model at all. `slow` does: it runs, it warns. */
export function fitAllowsUse(fit: Compatibility): boolean {
  return fit === 'compatible' || fit === 'slow' || fit === 'experimental' || fit === 'unknown'
}

/**
 * 🛑 There is deliberately no `fitAllowsDownload`. It gated the Install button on the verdict, so
 * a machine judged too small was never OFFERED the download — the screen decided instead of the
 * person. What a machine can hold is the person's call; the verdict is what tells them.
 *
 * The same holds for `plugin`, and it is a DECISION of 2026-08-22: a model no runtime here can
 * open is still offered, with the reservation on screen. The studio distributes none of these
 * bytes — it names the publisher's address — so the download is the person's to make.
 */
