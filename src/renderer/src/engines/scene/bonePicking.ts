/**
 * Picking, as screen arithmetic rather than as a ray — a bone first, a rail's knobs since.
 *
 * A bone carries no geometry — it is a transform, and what a skeleton draws are lines between
 * them. Raycasting those lines answers a SEGMENT, not a named bone, and the bones of a rig cross
 * every mesh they drive, so a ray through the viewport lands on whichever one happens to be
 * behind the pointer. That is why bones were kept off the raycaster entirely.
 *
 * Projecting each bone to the screen and taking the nearest one has neither problem: it names a
 * bone directly, it never picks one hidden behind a shoulder by accident, and it is pure — which
 * is what lets it be held to account without a GPU.
 */

/** Anything the screen has been handed a place for: normalised device coordinates, in `[-1, 1]`. */
export type Projected = {
  x: number
  y: number
  /** Depth in the same space. Anything outside `[-1, 1]` is behind the camera or past its far plane. */
  z: number
}

/** A bone as the screen sees it. */
export type ProjectedBone = Projected & {
  nodeId: string
  bone: string
}

export type Pointer = { x: number; y: number }

/**
 * How near the pointer must fall, in normalised device units. Roughly forty pixels across a
 * thousand-pixel view — a rig's bones crowd, and asking for less is asking for a miss.
 */
export const BONE_REACH = 0.04

/**
 * The projected thing under the pointer, or nothing.
 *
 * Nearest wins, and depth breaks a tie: two of them projecting to the same spot are one in front
 * of the other, and the front one is the one being looked at.
 *
 * Bones are what it was written for and a rail's knobs are the second caller: a knob keeps its
 * size on SCREEN, so what it can be grabbed by is a screen distance too — a ray would answer
 * with whatever its world radius happened to be on the last frame drawn.
 */
export function nearestProjected<T extends Projected>(
  items: readonly T[],
  pointer: Pointer,
  reach = BONE_REACH,
): T | null {
  let best: T | null = null
  let bestDistance = Infinity

  for (const item of items) {
    // Behind the camera, or past the far plane: it is not on screen at all.
    if (item.z < -1 || item.z > 1) continue

    const distance = Math.hypot(item.x - pointer.x, item.y - pointer.y)
    if (distance > reach) continue

    if (distance < bestDistance || (distance === bestDistance && best && item.z < best.z)) {
      best = item
      bestDistance = distance
    }
  }

  return best
}

/** A bone as the screen sees it: from its own joint to its child's, which is what one clicks. */
export type ProjectedSegment = {
  nodeId: string
  bone: string
  head: Projected
  tail: Projected
}

/**
 * The bone under the pointer, or nothing — measured to the whole SEGMENT rather than to its head.
 *
 * A skeleton is clicked on its bones, not on the points where two of them meet: asking for the
 * nearest joint left the middle of every bone dead, and a long one — a thigh, a forearm — could
 * only be taken by aiming at one of its ends.
 *
 * Depth breaks a tie exactly as it does for a point: two bones crossing on screen are one in
 * front of the other, and the front one is the one being looked at.
 */
export function nearestSegment(
  segments: readonly ProjectedSegment[],
  pointer: Pointer,
  reach = BONE_REACH,
): ProjectedSegment | null {
  let best: ProjectedSegment | null = null
  let bestDistance = Infinity
  let bestAlong = Infinity
  let bestDepth = Infinity

  for (const segment of segments) {
    if (offScreen(segment.head) && offScreen(segment.tail)) continue
    const near = nearestOn(segment, pointer)
    if (near.distance > reach) continue

    if (
      near.distance < bestDistance ||
      (near.distance === bestDistance &&
        (near.along < bestAlong || (near.along === bestAlong && near.depth < bestDepth)))
    ) {
      best = segment
      bestDistance = near.distance
      bestAlong = near.along
      bestDepth = near.depth
    }
  }

  return best
}

/** Behind the camera or past its far plane — the window `project` maps everything else into. */
export function offScreen(point: Projected): boolean {
  return point.z < -1 || point.z > 1
}

/** How far the pointer falls from a segment, where along it (0 head, 1 tail) and how deep there. */
function nearestOn(
  segment: ProjectedSegment,
  pointer: Pointer,
): { distance: number; along: number; depth: number } {
  const span = { x: segment.tail.x - segment.head.x, y: segment.tail.y - segment.head.y }
  const length = span.x * span.x + span.y * span.y
  const reach = { x: pointer.x - segment.head.x, y: pointer.y - segment.head.y }

  // A bone with no child projects to a point, and so does one seen end on: both fall back to the
  // head, which is exactly what the joint-only pick used to answer.
  const along =
    length <= 0 ? 0 : Math.min(1, Math.max(0, (reach.x * span.x + reach.y * span.y) / length))
  const at = { x: segment.head.x + span.x * along, y: segment.head.y + span.y * along }

  return {
    distance: Math.hypot(at.x - pointer.x, at.y - pointer.y),
    along,
    depth: segment.head.z + (segment.tail.z - segment.head.z) * along,
  }
}
