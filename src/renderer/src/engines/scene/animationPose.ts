import { Vector3 } from 'three'
import type { Quaternion } from 'three'

/**
 * Which frame of a clip a thumbnail should show, decided without a GPU.
 *
 * Apart from the renderer that uses it because none of it needs one: what is left there is
 * WebGL, and what is here is the arithmetic that chooses — the half that had no measure while
 * it was a closure, and the half that shipped a bug nobody could have written a test against.
 */

/** How far something has turned since its rest, seen from above. */
export function yawOf(current: Quaternion, rest: Quaternion): number {
  const turn = current.clone().multiply(rest.clone().invert())
  const facing = new Vector3(0, 0, 1).applyQuaternion(turn)
  return Math.atan2(facing.x, facing.z)
}

/**
 * The same angle brought back inside a half turn.
 *
 * Without it a character that turned a hair past π reads as having turned almost a full circle
 * the other way, and the frame chosen for a `TurnAround` is the one where it faces the camera.
 */
export function wrappedAngle(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians))
}

/** How near a turn is to the one it should be showing. NEARER IS HIGHER, like every score here. */
export function turnScoreOf(yaw: number, wanted: number): number {
  return -Math.abs(Math.abs(yaw) - wanted)
}

/**
 * Where in the clip to stop, as a fraction of it — the settled one when a clip is known, else
 * the best-scoring sample.
 *
 * Frame zero is never a candidate: every score below measures distance FROM it, so it scores
 * nothing and a clip that barely moves would always be drawn at rest.
 */
export function poseFractionOf(
  settled: number | undefined,
  samples: number,
  scoreAt: (fraction: number) => number,
): number {
  const chosen = settled ?? bestSampleOf(samples, scoreAt)
  if (chosen === undefined || !Number.isFinite(chosen) || chosen < 0 || chosen > 1)
    throw new Error('The pose fraction must be between 0 and 1')

  return chosen
}

function bestSampleOf(samples: number, scoreAt: (fraction: number) => number): number | undefined {
  let chosen: number | undefined
  let best = -Infinity

  for (let index = 1; index < samples; index += 1) {
    const fraction = index / samples
    const score = scoreAt(fraction)
    // Strictly greater, so a clip whose samples all score alike is drawn at its earliest.
    if (score > best) {
      best = score
      chosen = fraction
    }
  }

  return chosen
}
