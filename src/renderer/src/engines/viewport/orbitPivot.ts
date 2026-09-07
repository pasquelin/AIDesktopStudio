import type { Vector3 } from 'three'

/**
 * Where the view turns, decided once at the start of a gesture.
 *
 * The cascade of Blender's Navigation panel, under the names it gives them: *Orbit Around
 * Selection* first, *Auto Depth* next, and the point the view last settled on as the floor.
 */

/**
 * Metres. Where a pivot rests when NOTHING names one — a camera just lent to a pane, a flight
 * that walked away from whatever it was turning around. Not a fallback for the wheel, which now
 * meets the ground when it meets no object.
 */
export const PIVOT_AHEAD = 5

export type PivotMode = {
  /** Blender's *Orbit Around Selection*; Unreal's *Orbit camera around selection*. */
  aroundSelection: boolean
  /** Blender's *Auto Depth*: the depth under the pointer, read at each gesture. */
  underCursor: boolean
}

/**
 * Asked for rather than handed over: `underCursor` is a full raycast, and the preference that
 * consumes it is off by default — computed eagerly, every gesture would pay for nothing.
 */
export type PivotSources = {
  /** The selection's centre — `null` where nothing is selected, or where it sits off screen. */
  selection: () => Vector3 | null
  /** What the pointer's ray meets: an object first, then the ground. */
  underCursor: () => Vector3 | null
  /** Where the view last settled — a wheel, a pan, a framing. Always answers. */
  settled: Vector3
}

export function pivotFor(
  { selection, underCursor, settled }: PivotSources,
  mode: PivotMode,
): Vector3 {
  const chosen = mode.aroundSelection ? selection() : null
  if (chosen) return chosen

  return (mode.underCursor ? underCursor() : null) ?? settled
}

/**
 * Whether a projected point is one the view may turn around. Off screen it must not: that is the
 * known complaint about Unreal's setting — selecting something distant then orbiting yanks the
 * view. A point BEHIND the camera projects into the same box with its depth past `1`.
 */
export function onScreen({ x, y, z }: { x: number; y: number; z: number }): boolean {
  return Math.abs(x) <= 1 && Math.abs(y) <= 1 && z >= -1 && z <= 1
}

/**
 * The pivot brought back onto the line of sight, keeping the depth it had.
 *
 * What every reader that takes the pivot for « what the camera looks at » needs, and they restore
 * it by `lookAt`: a framing published from an off-axis pivot comes back TURNED.
 */
export function gazeTargetOf(position: Vector3, gaze: Vector3, pivot: Vector3): Vector3 {
  const depth = pivot.clone().sub(position).dot(gaze)
  return position.clone().addScaledVector(gaze, depth > 0 ? depth : PIVOT_AHEAD)
}
