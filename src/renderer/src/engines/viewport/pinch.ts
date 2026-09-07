import type { PointerPosition } from './pointer'

/**
 * How far apart two fingers are — the reading a pinch dollies by, where their middle pans.
 *
 * Spelled here so the pair answers without a surface to put fingers on. In the shape the pointer
 * map holds, so a gesture that fires as fast as a hand moves allocates nothing to be measured.
 */
export function fingerGap(one: PointerPosition, other: PointerPosition): number {
  return Math.hypot(other.clientX - one.clientX, other.clientY - one.clientY)
}

/** What a pair of fingers reads as: the gap that dollies, and the middle that pans. */
export type PinchReading = { gap: number; middleX: number; middleY: number }

export function pinchReading(two: readonly [PointerPosition, PointerPosition]): PinchReading {
  return {
    gap: fingerGap(two[0], two[1]),
    middleX: (two[0].clientX + two[1].clientX) / 2,
    middleY: (two[0].clientY + two[1].clientY) / 2,
  }
}
