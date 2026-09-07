/**
 * Lengths as they are WRITTEN, which is not how they are stored.
 *
 * One scene unit is one metre and stays one metre: nothing here rescales a document, and a
 * project opened under another unit holds exactly the same numbers. What changes is the figure a
 * field shows and the figure it reads back — the whole of what `three.units` is.
 */
import type { DisplayUnit, Vector3 } from './scene'

/** How many of a unit make one scene unit. */
const PER_METRE: Record<DisplayUnit, number> = { mm: 1000, cm: 100, m: 1 }

/** A length of the scene, as the chosen unit spells it. */
export function toDisplayLength(metres: number, unit: DisplayUnit): number {
  return metres * PER_METRE[unit]
}

/** The other way: what somebody typed, back into what the document holds. */
export function fromDisplayLength(shown: number, unit: DisplayUnit): number {
  return shown / PER_METRE[unit]
}

/** The three axes at once, which is how an inspector shows a position or a scale. */
export function shownLength(vector: Vector3, unit: DisplayUnit): Vector3 {
  return {
    x: toDisplayLength(vector.x, unit),
    y: toDisplayLength(vector.y, unit),
    z: toDisplayLength(vector.z, unit),
  }
}

/**
 * How finely a field steps in that unit. A tenth of a metre is a sensible nudge; a tenth of a
 * millimetre is not, so the step follows the unit rather than staying at the document's.
 */
export function displayStep(unit: DisplayUnit): number {
  return unit === 'm' ? 0.1 : 1
}
