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
 * The ground the walk keeps to: an ELLIPSE, and the point the camera BOTH orbits and aims at —
 * `WELCOME_TARGET` stands over it. Orbited around anything else, the yard sweeps out of frame as
 * the carousel turns. Deep rather than wide: near and far is the only amplitude a single frame
 * holds, since the camera sees barely four metres of width at this range.
 */
export const WELCOME_YARD_AT = { x: 0, z: -3 }

export const WELCOME_YARD = { x: 3.9, z: 5 }

/** How wide a walker is, for the purpose of not clipping a planter. */
const WELCOME_WALKER_WIDTH = 0.42

/** One foreground tree shows the foliage up close; the others frame the yard. */
export const WELCOME_GROVE: readonly WelcomeTree[] = [
  { x: 1.7, z: 3.5, height: 0.85, crown: 0.65, planter: 0.41, turn: 0.9 },
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

/** How far out a spot is taken, as shares of the yard's half-width, from the rim inward. */
const SHARES = [0.82, 0.62, 0.42, 0.22]

/**
 * The first spot along a BEARING a walker can stand on, taken from the rim and backed off toward
 * the middle until the ground is clear. Nothing here knows the camera or the carousel — this is
 * the yard answering a direction, and `welcomeSlideGoal` is what chooses the direction.
 */
export function welcomeYardAlong(
  trees: readonly WelcomeTree[],
  bearing: number,
): { x: number; z: number } {
  const sin = Math.sin(bearing)
  const cos = Math.cos(bearing)
  const rim = 1 / Math.hypot(sin / WELCOME_YARD.x, cos / WELCOME_YARD.z)

  for (const share of SHARES) {
    const at = {
      x: WELCOME_YARD_AT.x + sin * rim * share,
      z: WELCOME_YARD_AT.z + cos * rim * share,
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
  { turn = 0, slack = WELCOME_SLACK }: { turn?: number; slack?: number } = {},
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
