// SPDX-License-Identifier: MIT

/**
 * 🛑 Spelt here rather than taken from `@shared/numeric`, which is the same function: this tree
 * is MIT and the shared one is not, and `main/game-imports.test.ts` holds the frontier.
 */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export const DEGREES = Math.PI / 180

/** A hair over a full turn: past a few million radians a float stops resolving a degree. */
export const FULL_TURN = Math.PI * 2

/**
 * Two angles blended the SHORT way round, in radians. A yaw of 3,1 drawn towards −3,1 is a tenth
 * of a turn, not a whole one backwards — which a plain lerp would spin through.
 */
export function lerpAngle(from: number, to: number, alpha: number): number {
  return from + shortWay(from, to) * alpha
}

/** How far `to` is from `from`, signed, never more than half a turn either way. */
export function shortWay(from: number, to: number): number {
  return ((((to - from + Math.PI) % FULL_TURN) + FULL_TURN) % FULL_TURN) - Math.PI
}
