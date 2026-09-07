/**
 * Which bones drive each vertex, and how much.
 *
 * The arithmetic of the skinning worker, held apart from it so it can be measured without one:
 * everything that can go wrong here — a vertex caught by the wrong limb, weights that do not sum
 * to one, a bone of zero length — is numbers.
 *
 * A bone is a SEGMENT between itself and its child, never a point. Measuring to a point puts the
 * whole forearm's influence at the elbow, and the skin folds there instead of bending.
 */
import { clamp } from '@shared/numeric'
import { INFLUENCES, SKIN_REGION_WITHIN, SKIN_REGIONS, type SkinRequest } from './skinMessage'

export type SkinBinding = { skinIndex: Uint16Array; skinWeight: Float32Array }

/** Index of the `trunk` region in `SKIN_REGIONS`, which is the one that agrees with every other. */
const TRUNK = 0

/** Index of `handle` in `SKIN_REGIONS` — read from the list, never counted by hand. */
const HANDLE = SKIN_REGIONS.indexOf('handle')

/** The region each region sits inside, by index — `-1` for one that sits in nothing. */
const WITHIN = Int8Array.from(SKIN_REGIONS, region => {
  const holder = SKIN_REGION_WITHIN[region]
  return holder === undefined ? -1 : SKIN_REGIONS.indexOf(holder)
})

/** Keeps a vertex sitting exactly on a bone from weighing infinity. */
const EPSILON = 1e-6

/** How often the worker looks up: often enough to cancel promptly, rarely enough to cost nothing. */
const REPORT_EVERY = 4096

export type SkinProgress = {
  /** Called with 0…1 as the walk advances. Never with 1 — finishing is what the return says. */
  report: (progress: number) => void
  /** Asked between batches. `true` abandons the walk, and `skinVertices` answers `null`. */
  cancelled: () => boolean
}

export function vertexCountOf(request: SkinRequest): number {
  return Math.floor(request.position.length / 3)
}

export function emptyBinding(vertices: number): SkinBinding {
  return {
    skinIndex: new Uint16Array(vertices * INFLUENCES),
    skinWeight: new Float32Array(vertices * INFLUENCES),
  }
}

/**
 * Weights one slice of the vertices into a binding already made.
 *
 * A slice at a time because the worker has to come back for air: its message queue is only read
 * between tasks, so a single synchronous walk over half a million vertices would take a
 * cancellation nobody could deliver.
 */
export function skinRange(
  request: SkinRequest,
  binding: SkinBinding,
  from: number,
  to: number,
): void {
  const bones = Math.floor(request.segments.length / 6)
  if (bones === 0) return

  const distances = new Float64Array(bones)

  for (let vertex = from; vertex < to; vertex += 1) {
    const x = request.position[vertex * 3] ?? 0
    const y = request.position[vertex * 3 + 1] ?? 0
    const z = request.position[vertex * 3 + 2] ?? 0

    let nearest = 0
    for (let bone = 0; bone < bones; bone += 1) {
      distances[bone] = distanceToBone(request.segments, bone, x, y, z)
      if ((distances[bone] ?? 0) < (distances[nearest] ?? 0)) nearest = bone
    }

    writeInfluences(request, distances, nearest, vertex, binding.skinIndex, binding.skinWeight)
  }
}

/**
 * The binding for every vertex of the request, or `null` if it was taken back mid-walk.
 *
 * Weights are the inverse SQUARE of the distance to each bone, normalised to one — a vertex twice
 * as far from a bone follows it a quarter as much. Candidates are restricted by region first: that is what
 * stops the hand bone from catching a hip vertex when the arm hangs beside the body.
 */
export function skinVertices(request: SkinRequest, progress?: SkinProgress): SkinBinding | null {
  const vertices = vertexCountOf(request)
  const binding = emptyBinding(vertices)

  for (let from = 0; from < vertices; from += REPORT_EVERY) {
    if (progress) {
      if (progress.cancelled()) return null
      progress.report(from / vertices)
    }
    skinRange(request, binding, from, Math.min(from + REPORT_EVERY, vertices))
  }

  return binding
}

/**
 * The four nearest ALLOWED bones for one vertex, weighted and normalised.
 *
 * The vertex takes the region of the bone nearest it whatever the region, and only then are the
 * candidates narrowed — deciding a region any other way would need to know the body, which a
 * bounding box does not.
 */
function writeInfluences(
  request: SkinRequest,
  distances: Float64Array,
  nearest: number,
  vertex: number,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
): void {
  const region = request.regions[nearest] ?? TRUNK
  const bones = CHOSEN_BONES
  const near = CHOSEN_DISTANCES
  const held = nearestBones(request, distances, region, bones, near)
  let total = 0
  for (let slot = 0; slot < held; slot += 1) total += pull(near[slot] ?? 0)
  for (let slot = 0; slot < held; slot += 1) {
    skinIndex[vertex * INFLUENCES + slot] = bones[slot] ?? 0
    skinWeight[vertex * INFLUENCES + slot] = pull(near[slot] ?? 0) / total
  }
}

function nearestBones(
  request: SkinRequest,
  distances: Float64Array,
  region: number,
  bones: Uint16Array,
  near: Float64Array,
): number {
  let held = 0
  for (let bone = 0; bone < distances.length; bone += 1) {
    if (!mayDrive(region, request.regions[bone] ?? TRUNK)) continue
    const distance = distances[bone] ?? 0
    if (held === INFLUENCES && distance >= (near[INFLUENCES - 1] ?? 0)) continue
    let slot = Math.min(held, INFLUENCES - 1)
    while (slot > 0 && (near[slot - 1] ?? 0) > distance) {
      bones[slot] = bones[slot - 1] ?? 0
      near[slot] = near[slot - 1] ?? 0
      slot -= 1
    }
    bones[slot] = bone
    near[slot] = distance
    if (held < INFLUENCES) held += 1
  }
  return held
}

/**
 * How hard a bone pulls one vertex, before the four are normalised — the INVERSE SQUARE, not the
 * inverse: under `1/d` four bones at comparable distances shared a vertex almost evenly, and the
 * dominant weight averaged 0.46 over the whole body. Measured on tripo-character, 2026-09-02.
 */
function pull(distance: number): number {
  const near = distance + EPSILON
  return 1 / (near * near)
}

/** Scratch for the four slots above. Module-level because the walk runs once, in one worker. */
const CHOSEN_BONES = new Uint16Array(INFLUENCES)
const CHOSEN_DISTANCES = new Float64Array(INFLUENCES)

/**
 * Whether a bone may drive a vertex of this region. ASYMMETRIC on purpose, and that asymmetry is
 * the whole guard: a trunk bone reaches anywhere, a limb bone reaches only its own limb.
 *
 * Read the other way round it protected nothing — a hip vertex is nearest the hips, so its region
 * is the trunk, and a trunk that agreed with everything let the hand bone straight back in.
 */
function mayDrive(vertexRegion: number, boneRegion: number): boolean {
  // A handle is nobody's region, and nobody's trunk: six chains would otherwise take six
  // handfuls of vertices away from the limbs they belong to.
  if (boneRegion === HANDLE) return false
  if (boneRegion === vertexRegion || boneRegion === TRUNK) return true

  // A region is also driven by the one it sits INSIDE: a knuckle still follows the hand, while
  // the finger beside it never does.
  return boneRegion === WITHIN[vertexRegion]
}

/** Distance from a point to a bone's segment, clamped to its ends so a limb has no reach beyond itself. */
function distanceToBone(
  segments: Float32Array,
  bone: number,
  x: number,
  y: number,
  z: number,
): number {
  const at = bone * 6
  const headX = segments[at] ?? 0
  const headY = segments[at + 1] ?? 0
  const headZ = segments[at + 2] ?? 0
  const alongX = (segments[at + 3] ?? 0) - headX
  const alongY = (segments[at + 4] ?? 0) - headY
  const alongZ = (segments[at + 5] ?? 0) - headZ

  const lengthSquared = alongX * alongX + alongY * alongY + alongZ * alongZ
  // A leaf bone — a hand, a toe — has no child to reach towards, so it measures as a point.
  const along =
    lengthSquared === 0
      ? 0
      : clamp(
          ((x - headX) * alongX + (y - headY) * alongY + (z - headZ) * alongZ) / lengthSquared,
          0,
          1,
        )

  return Math.hypot(
    x - (headX + alongX * along),
    y - (headY + alongY * along),
    z - (headZ + alongZ * along),
  )
}
