/**
 * Where the welcome's little trees stand, in world units. Plain numbers, like `welcomeMotion`:
 * the walk reads them to steer around, and the builder reads them to place meshes.
 */

/** One tree: a trunk, a crown above it, and the planter it grows out of. */
export type WelcomeTree = {
  x: number
  z: number
  /** Trunk height, crown centre sitting at it. */
  height: number
  crown: number
  /** Half the planter's width. The box is square in plan and a third as tall. */
  planter: number
  /** Yaw, so no two crowns show a reader the same facet. */
  turn: number
}

/**
 * The ground the walk keeps to: an ELLIPSE, wide and shallow.
 *
 * 🛑 Both halves of that shape are the window's, not the world's. The welcome's sheet of copy owns
 * the middle of the frame, so the yard stands BEHIND the camera's mark — where the floor projects
 * above the sheet — and it is stretched sideways because that band is wide and short.
 */
export const WELCOME_YARD_AT = { x: 0, z: -3 }

export const WELCOME_YARD = { x: 3.9, z: 5 }

/** How wide a walker is, for the purpose of not clipping a planter. */
const WELCOME_WALKER_WIDTH = 0.42

/**
 * The composition: eight, scattered on BOTH sides and at four depths, so the eye reads a place
 * rather than a pair of props. Sizes and yaws all differ — two crowns of the same build a metre
 * apart read as one repeated object.
 *
 * 🛑 Every one of them stands BEHIND the yard. The camera swings round to +45°, and a tree the
 * walk's own side of that arc would pass a metre from the lens and cover the whole screen.
 */
export const WELCOME_GROVE: readonly WelcomeTree[] = [
  { x: -6.8, z: -2.4, height: 1.42, crown: 1.08, planter: 0.68, turn: 0.9 },
  { x: 6.6, z: -2.8, height: 1.22, crown: 0.9, planter: 0.6, turn: 4.8 },
  { x: -8.6, z: -5.6, height: 0.96, crown: 0.72, planter: 0.46, turn: 3.7 },
  { x: 8.2, z: -5.2, height: 1.08, crown: 0.8, planter: 0.5, turn: 1.1 },
  { x: -5.4, z: -7.4, height: 1.18, crown: 0.88, planter: 0.56, turn: 2.1 },
  { x: 5.2, z: -7.8, height: 1.36, crown: 1.04, planter: 0.66, turn: 0.4 },
  { x: -2.8, z: -11.2, height: 1.3, crown: 0.98, planter: 0.62, turn: 5.2 },
  { x: 2.4, z: -11.8, height: 1.1, crown: 0.82, planter: 0.52, turn: 1.4 },
]

/**
 * How far out of the yard's middle a spot stands, with one at its rim answering exactly 1 — the
 * ellipse read as a circle, which is the only way a single number says « outside ».
 */
export const welcomeYardOffset = (x: number, z: number): number =>
  Math.hypot((x - WELCOME_YARD_AT.x) / WELCOME_YARD.x, (z - WELCOME_YARD_AT.z) / WELCOME_YARD.z)

/** How far out a walker is sent, as a share of the yard's own half-width. */
const AWAY = 0.82

/**
 * Where a walker is sent when the carousel moves: an EVEN slide brings them forward, into the
 * camera's own half of the yard; an ODD one sends them to the far half and out to a side. Two
 * slides in a row therefore cross the whole plate, near to far, which is what makes it a stroll
 * rather than a walker fidgeting on one spot.
 *
 * Backed off until the ground is clear, so a planter on that bearing brings them nearer instead.
 */
export function welcomeYardStop(
  trees: readonly WelcomeTree[],
  eye: { x: number; z: number },
  slide: number,
): { x: number; z: number } {
  const toward = Math.atan2(eye.x - WELCOME_YARD_AT.x, eye.z - WELCOME_YARD_AT.z)
  // A third of a turn per slide, from the eye's own bearing: near, then far and to one side, and
  // never twice the same corner over a carousel of seven.
  const bearing = toward + slide * 1.9 + (slide % 2 === 0 ? 0 : Math.PI)

  for (const share of [AWAY, 0.62, 0.42, 0.22]) {
    const rim =
      1 / Math.hypot(Math.sin(bearing) / WELCOME_YARD.x, Math.cos(bearing) / WELCOME_YARD.z)
    const at = {
      x: WELCOME_YARD_AT.x + Math.sin(bearing) * rim * share,
      z: WELCOME_YARD_AT.z + Math.cos(bearing) * rim * share,
    }
    if (welcomeGroveAllows(trees, at.x, at.z, WELCOME_SLACK)) return at
  }

  return { ...WELCOME_YARD_AT }
}

/** How far a walker must stay from a tree's centre: its planter, plus their own width. */
export function welcomeClearanceOf(tree: WelcomeTree): number {
  // The planter is square, so its CORNER is what a circle has to clear, not its side.
  return tree.planter * Math.SQRT2 + WELCOME_WALKER_WIDTH
}

/**
 * Whether that spot is walkable: inside the yard, and out of every planter. `slack` is what the
 * look-ahead keeps ON TOP of contact — a clip cannot stop halfway, so a plan that only just fits
 * is a plan that grazes.
 */
export function welcomeGroveAllows(
  trees: readonly WelcomeTree[],
  x: number,
  z: number,
  slack = 0,
): boolean {
  // The slack is a distance in metres, read against the SHORTER half — the edge crossed soonest.
  if (welcomeYardOffset(x, z) > 1 - slack / Math.min(WELCOME_YARD.x, WELCOME_YARD.z)) return false

  return trees.every(tree => Math.hypot(x - tree.x, z - tree.z) >= welcomeClearanceOf(tree) + slack)
}

/**
 * How much of that slack the look-ahead asks for. Wider than any overshoot a clip's arc leaves.
 *
 * 🛑 Exported because a walker STANDING inside it is a walker every look-ahead reads shut on, and
 * the walk has to recognise that spot to leave it — allowed at contact, refused as a starting line.
 */
export const WELCOME_SLACK = 0.35

/**
 * Whether a walker leaving that spot has room for `distance` metres, turning by `turn` as they
 * go. Walked in short steps rather than solved: a swept circle against seven discs and a ring is
 * an equation nobody would reread, and a clip cannot stop halfway through its own arc.
 */
export function welcomeGroveOpens(
  trees: readonly WelcomeTree[],
  from: { x: number; z: number; heading: number },
  distance: number,
  turn = 0,
  slack = WELCOME_SLACK,
): boolean {
  const steps = 12
  let { x, z, heading } = from
  for (let step = 0; step < steps; step += 1) {
    // The MID-heading, exactly as `welcomeAdvance` integrates: a walk read one way and predicted
    // the other drifts apart over an arc, and the drift is what steps onto a planter.
    const along = heading + turn / (steps * 2)
    x += (Math.sin(along) * distance) / steps
    z += (Math.cos(along) * distance) / steps
    heading += turn / steps
    if (!welcomeGroveAllows(trees, x, z, slack)) return false
  }

  return true
}
