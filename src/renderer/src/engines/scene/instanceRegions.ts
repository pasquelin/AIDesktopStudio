/**
 * Splits the instances of one group into spatial regions, so the frustum can drop them by region.
 *
 * An `InstancedMesh` is tested by a SINGLE bounding sphere: 10 000 instances of a 980-triangle
 * shape over 600 units cost 3.4 ms in one group against 0.5 ms once split, measured at 1600×900.
 */

/** Instance centres, three numbers each — the translation of a world matrix, nothing more. */
export type Centres = { at: Float64Array; count: number }

export type SpatialRegions = {
  /** Instance slots, reordered so that each region occupies one contiguous run. */
  order: Uint32Array
  /** Where each region starts in `order`, with a last entry holding `count`. */
  starts: Uint32Array
}

/**
 * What a region is worth drawing on its own — a budget in TRIANGLES, never in instances.
 *
 * Measured across four shape densities and two counts: a tight view reaches the empty-scene floor
 * once a region holds under 100 000 to 200 000 triangles, wherever those triangles come from, and
 * splitting past that buys 0.1 ms at best. Counting instances instead needed a second constant to
 * keep cheap shapes whole; this one does it alone — 10 000 cubes are 120 000 triangles and stay
 * in a single call. On 40 000 instances of a 180-triangle shape it asks for 49 regions, which
 * took a tight view from 7.6 ms to 5.9 and cost 0.4 ms on a wide one where nothing is culled.
 */
export const TRIANGLES_PER_REGION = 150_000

/** Divisions one axis may take. Three of them are packed into one cell key, so it is the base. */
const CELLS_PER_AXIS = 1024

/**
 * Uniform grid over the bounding box of the centres, cut into `cells` regions or a few more.
 *
 * Weighed against a median-split BVH — no better at culling, 256 instances submitted against 296
 * on a tight view of 10 000 — which cost 0.94 ms to build against 0.27 ms, and 6.66 against 1.76
 * at 50 000. And against `BatchedMesh`, exact instance by instance but costing 1.6 ms of CPU a
 * frame at rest and 9.1 ms on a wide view, against 0.6 ms here.
 */
export function regionsByGrid({ at, count }: Centres, cells: number): SpatialRegions {
  const [low, high] = boundsOf(at, count)
  const held = slotsByCell(at, count, low, high, divisionsFor(low, high, cells))
  const order = new Uint32Array(count)
  const starts: number[] = [0]
  let written = 0
  for (const slots of held.values()) {
    for (const slot of slots) order[written++] = slot
    starts.push(written)
  }
  return { order, starts: Uint32Array.from(starts) }
}

function boundsOf(at: Float64Array, count: number): [number[], number[]] {
  const low = [Infinity, Infinity, Infinity]
  const high = [-Infinity, -Infinity, -Infinity]
  for (let slot = 0; slot < count; slot += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = at[slot * 3 + axis] ?? 0
      if (value < (low[axis] ?? 0)) low[axis] = value
      if (value > (high[axis] ?? 0)) high[axis] = value
    }
  }
  return [low, high]
}

function slotsByCell(
  at: Float64Array,
  count: number,
  low: number[],
  high: number[],
  divisions: number[],
): Map<number, number[]> {
  const held = new Map<number, number[]>()
  for (let slot = 0; slot < count; slot += 1) {
    let key = 0
    for (let axis = 0; axis < 3; axis += 1) {
      const span = (high[axis] ?? 0) - (low[axis] ?? 0)
      const cuts = divisions[axis] ?? 1
      const share = span > 0 ? ((at[slot * 3 + axis] ?? 0) - (low[axis] ?? 0)) / span : 0
      key = key * CELLS_PER_AXIS + Math.min(cuts - 1, Math.floor(share * cuts))
    }
    const cell = held.get(key)
    if (cell) cell.push(slot)
    else held.set(key, [slot])
  }
  return held
}

/**
 * Divisions handed out one at a time, always to the axis whose cells are longest — so they stay
 * as cubic as the box allows and an axis with no extent never takes one.
 *
 * Solving for a division per axis instead rounds each one down on a flat level and collapses the
 * whole grid to a single cell: two cells over two wide axes want 1.41 divisions each, both round
 * to one, and the level comes back undivided — which is the ordinary decor case.
 */
function divisionsFor(low: number[], high: number[], cells: number): number[] {
  const spans = [0, 1, 2].map(axis => (high[axis] ?? 0) - (low[axis] ?? 0))
  const divisions = [1, 1, 1]
  if (spans.every(span => span <= 0)) return divisions

  let made = 1
  while (made < cells) {
    const axis = widestCell(spans, divisions)
    if (axis < 0) break
    made = (made / (divisions[axis] ?? 1)) * ((divisions[axis] ?? 1) + 1)
    divisions[axis] = (divisions[axis] ?? 1) + 1
  }
  return divisions
}

/** The axis whose cells are longest, and none once every axis is at the key's base. */
function widestCell(spans: number[], divisions: number[]): number {
  let widest = -1
  let longest = 0
  for (let axis = 0; axis < 3; axis += 1) {
    if ((divisions[axis] ?? 1) >= CELLS_PER_AXIS) continue
    const length = (spans[axis] ?? 0) / (divisions[axis] ?? 1)
    if (length > longest) {
      longest = length
      widest = axis
    }
  }
  return widest
}
