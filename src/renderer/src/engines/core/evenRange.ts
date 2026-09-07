/**
 * One of `slices` contiguous slices of `total`, offset by `base`. The floors make the slices
 * differ by at most one, and leave no gap between them — every index belongs to exactly one.
 */
export function evenRange(
  total: number,
  slices: number,
  slice: number,
  base = 0,
): { from: number; to: number } {
  return {
    from: base + Math.floor((total * slice) / slices),
    to: base + Math.floor((total * (slice + 1)) / slices),
  }
}
