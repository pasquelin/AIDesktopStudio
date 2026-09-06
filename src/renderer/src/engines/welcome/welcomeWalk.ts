/**
 * The stroll itself: where the walker stands, which shipped clip is playing, and what plays next.
 *
 * Plain numbers and no three, like `welcomeMotion`. What a clip actually covers in a frame is
 * READ off that clip and handed in — the feet decide the speed, never a constant written here.
 */
import { type WelcomeClipName } from '@shared/domain/welcome'
import { FULL_TURN, shortWay } from '@game/numeric'
import { clamp } from '@shared/numeric'
import {
  welcomeGroveAllows,
  welcomeGroveOpens,
  welcomeYardAlong,
  welcomeYardOffset,
  WELCOME_SLACK,
  WELCOME_YARD,
  WELCOME_YARD_AT,
  type WelcomeTree,
} from './welcomeGrove'

export type WelcomeWalkState = {
  x: number
  z: number
  /** Radians about Y, zero facing +Z — three's own convention, so the group takes it as is. */
  heading: number
  /** Where the walker is headed. Always drawn ahead of them, on ground they can reach. */
  goal: { x: number; z: number }
  /** What is playing, or `null` while the walker stands. */
  clip: WelcomeClipName | null
  /** Seconds into that clip. */
  time: number
  /** Seconds of standing left. Only ever above zero while `clip` is null. */
  pause: number
}

const QUARTER = Math.PI / 2

/**
 * Radians a second a walking clip may be steered by, over and above its own turn. Small enough
 * that the feet still point where the body goes; it is what lets a path curve without a turn clip.
 */
const STEER = 0.9

/**
 * How far off its goal a walk may be aimed — the steering cap, and the widest a fresh goal is
 * drawn. 🛑 A TURN is never played to FACE a goal: a quarter turn overshoots a small error into
 * one the other way, and the walker rocks between two of them.
 */
const SPREAD = 0.9

/** What `WalkStart` carries the walker while they gather speed. */
const START_REACH = 2.2

/** What a stop needs: its own stride PLUS a start's, or it halts with no room to set off again. */
const STOP_REACH = 3.4

/** What a quarter turn covers along its arc, which is the ground it has to find free. */
const TURN_REACH = 2.9

/**
 * And what walking on needs — a stride, no more. 🛑 Asked for a TURN's ground instead, a walker in
 * a yard 3.2 m deep almost never had it: ten strolls of a quarter of an hour, 2026-09-06, spent
 * 87 % to 99.6 % of themselves turning.
 */
const WALK_REACH = 2.2

/** A side step's own reach, PLUS the slack the look-ahead keeps: under it, a strafe grazed a planter. */
const STRAFE_REACH = 2.1

/** The clips that are a garnish rather than a gait: never two in a row. */
const RARE: readonly WelcomeClipName[] = ['StrafeLeft', 'StrafeRight', 'TurnAround']

const PAUSE_SECONDS = { least: 1.1, most: 2.9 }

/**
 * Metres a second no clip may exceed — faster than the running jump, the quickest shipped. 🛑 A
 * ceiling, not a speed: it stops a root channel READ WRONG, which throws the walker clean out of
 * the window. Measured 2026-09-06, one misread channel answered 149 m for a side step.
 */
const FASTEST = 6

/** How often a walker chooses to stop where they are, per clip that runs out. */
const STOPS = 0.12

/** A goal nearer than this is not worth walking to: a stroll needs a stride, not a shuffle. */
const SHORTEST_WALK = 2.4

/** The share of the yard a goal is preferred to land within, so the stroll keeps to the middle. */
const INSIDE = 0.7

/** What is left of a stand when the camera moves: enough to read as a beat, not as a freeze. */
const WOKEN = 0.25

/**
 * Radians the goal swings by per slide, over and above the camera's own bearing. A third of a
 * turn, so a carousel of seven never sends the walker to the same corner twice.
 */
const SLIDE_TURN = 1.9

/**
 * A suggestion from the carousel; the stroll may choose another goal when this one cannot
 * be reached naturally from the current heading.
 */
export const welcomeSlideGoal = (
  trees: readonly WelcomeTree[],
  azimuth: number,
  slide: number,
): { x: number; z: number } =>
  welcomeYardAlong(trees, azimuth + slide * SLIDE_TURN + (slide % 2) * Math.PI)

/**
 * A goal handed from OUTSIDE — the carousel moved, and the walker comes round to meet it.
 *
 * 🛑 Never touches `clip` nor `time`. A slide flicked through faster than a stride would otherwise
 * restart a gait on every step, and a walker restarted twice a second reads as a flicker.
 */
export const welcomeToward = (
  state: WelcomeWalkState,
  goal: { x: number; z: number },
): WelcomeWalkState => ({
  ...state,
  goal,
  pause: state.clip ? state.pause : Math.min(state.pause, WOKEN),
})

export function welcomeWalkStart(): WelcomeWalkState {
  return {
    x: WELCOME_YARD_AT.x,
    z: WELCOME_YARD_AT.z,
    heading: 0.6,
    goal: { ...WELCOME_YARD_AT },
    clip: null,
    time: 0,
    pause: 0.8,
  }
}

/** A roll of the dice, in `[0, 1)`. Handed in so a test decides what the stroll does. */
export type WelcomeRoll = () => number

/** What one frame of a clip does to the body: ground covered, and yaw turned through. */
export type WelcomeStep = { x: number; z: number; turned: number }

/**
 * Where the walker has got to after `seconds` of the clip they are playing.
 *
 * 🛑 `step` is the clip's OWN root motion, already turned into this walker's frame — MEASURED on
 * the file rather than declared here. A table of net turns was written first, and it could not say
 * that a half turn reached the character as a tumble. Steering is the only turn this module adds.
 */
export function welcomeAdvance(
  state: WelcomeWalkState,
  step: WelcomeStep,
  seconds: number,
): WelcomeWalkState {
  if (!state.clip) {
    return { ...state, pause: Math.max(0, state.pause - seconds), time: state.time + seconds }
  }

  const turn = step.turned + steerOf(state, seconds)
  const covered = Math.hypot(step.x, step.z)
  const held = covered > FASTEST * seconds ? (FASTEST * seconds) / covered : 1

  return {
    ...state,
    x: state.x + step.x * held,
    z: state.z + step.z * held,
    // Wrapped, so a stroll left running for an hour keeps its heading where a float still resolves
    // the short way round — unwrapped, the way round broke and the walker span on the spot.
    heading: (state.heading + turn) % FULL_TURN,
    time: state.time + seconds,
  }
}

/**
 * Only a gait that walks where it faces steers, and only within the error a turn is not for. 🛑
 * Read as « anything turning slower than `STEER` », the shipped turns tour at 0.71 rad/s and
 * slipped under it, and so did every side step — onto an arc the look-ahead had never cleared.
 */
function steerOf(state: WelcomeWalkState, seconds: number): number {
  if (!state.clip || !STEERED.includes(state.clip)) return 0

  return clamp(steerTo(state), -STEER * seconds, STEER * seconds)
}

/** The gaits a heading may be nudged on: they carry the walker where they face, so the feet follow. */
const STEERED: readonly WelcomeClipName[] = ['Walk', 'WalkStart', 'WalkStop']

/**
 * The yaw a straight gait is steered THROUGH on its way to the goal, which is nothing at all once
 * the goal is further round than a walk is for. 🛑 The look-ahead reads this very function: told to
 * expect a bend the steering then refuses, it cleared an arc the walker never took.
 */
function steerTo(state: WelcomeWalkState): number {
  const error = headingErrorOf(state, state.goal)

  return Math.abs(error) > SPREAD ? 0 : error
}

/** How far the walker is turned away from a point, the short way round. */
const headingErrorOf = (state: WelcomeWalkState, at: { x: number; z: number }): number =>
  shortWay(state.heading, Math.atan2(at.x - state.x, at.z - state.z))

/**
 * How one clip gives way to the next. A pause is a HOLD of the stand, never a fade in from
 * weight zero — Three mixes the bind pose (T-pose) for any frame whose weights sum under one.
 */
export function welcomeFadeOf(
  held: WelcomeClipName | null,
  next: WelcomeClipName | null,
): 'loop' | 'cross' | 'rise' | 'hold' {
  if (held && next === held) return 'loop'
  if (next && held) return 'cross'
  if (next) return 'rise'

  return 'hold'
}

/**
 * The state as the next clip begins — the one call the engine makes when a clip runs out.
 *
 * 🛑 The goal is refreshed BEFORE the clip is chosen. Decided against a goal already reached, the
 * bearing is the noise of two points a hand's width apart, and every other clip came out a turn.
 */
export function welcomeTurnOver(
  state: WelcomeWalkState,
  trees: readonly WelcomeTree[],
  roll: WelcomeRoll,
): WelcomeWalkState {
  const aimed = {
    ...state,
    goal: strandedIn(state, trees)
      ? WELCOME_YARD_AT
      : reaches(state, state.goal, trees)
        ? state.goal
        : aimedAt(state, trees, roll),
  }
  const clip = welcomeNextClip(aimed, trees, roll)

  return {
    ...aimed,
    clip,
    time: 0,
    pause: clip ? 0 : PAUSE_SECONDS.least + roll() * (PAUSE_SECONDS.most - PAUSE_SECONDS.least),
  }
}

/**
 * What to play now that the clip has run out — or `null` to stand for a while.
 *
 * Read as a ladder: what the ground forces, then what the dice offer, then walking on. The goal
 * never asks for a clip of its own; it is steered toward, which is what makes this a stroll
 * rather than a list of poses played in order.
 */
export function welcomeNextClip(
  state: WelcomeWalkState,
  trees: readonly WelcomeTree[],
  roll: WelcomeRoll,
): WelcomeClipName | null {
  if (strandedIn(state, trees)) return outOf(state, trees)
  if (state.clip === 'WalkStop') return null

  const opens = (aim: number, reach: number, turn = 0): boolean =>
    welcomeGroveOpens(trees, { ...state, heading: state.heading + aim }, reach, { turn })
  // The path the walker will actually take, steering included: read along the bare heading, a walk
  // one hair off its goal line reports a planter it is already curving past.
  const ahead = (reach: number): boolean => opens(0, reach, steerTo(state))

  if (!state.clip) return ahead(START_REACH) ? 'WalkStart' : 'TurnAround'

  const dice = roll()
  if (dice < STOPS && state.clip !== 'WalkStart' && ahead(STOP_REACH)) return 'WalkStop'

  if (!ahead(WALK_REACH)) {
    const away = sideThatOpens(opens, roll)
    return away === null ? 'TurnAround' : turnOf(away)
  }

  if (RARE.includes(state.clip)) return 'Walk'
  if (dice < 0.2 && opens(QUARTER, STRAFE_REACH)) return 'StrafeLeft'
  if (dice < 0.26 && opens(-QUARTER, STRAFE_REACH)) return 'StrafeRight'
  // On the spot, so it needs no ground of its own — the one clip that is always playable.
  if (dice < 0.32) return 'TurnAround'

  return 'Walk'
}

/**
 * Standing where no plan can start: over the yard's rim, or within the look-ahead's own slack of a
 * planter. 🛑 Read at bare contact instead, a walker inside that ring counted as fine while every
 * clip read shut — measured 2026-09-06, one stroll of ten span there for five minutes.
 */
const strandedIn = (state: WelcomeWalkState, trees: readonly WelcomeTree[]): boolean =>
  !welcomeGroveAllows(trees, state.x, state.z, WELCOME_SLACK)

/**
 * The way back to the middle. 🛑 Read at CONTACT and not at the look-ahead's slack: the walker is
 * already inside that ring, so asking for it again answers shut and strands them there for the
 * rest of the session — measured 2026-09-06, two strolls of ten ended theirs doing exactly that.
 */
function outOf(state: WelcomeWalkState, trees: readonly WelcomeTree[]): WelcomeClipName {
  const error = headingErrorOf(state, WELCOME_YARD_AT)
  if (Math.abs(error) > Math.PI - QUARTER) return 'TurnAround'
  if (Math.abs(error) > SPREAD) return turnOf(error)
  if (!welcomeGroveOpens(trees, state, WALK_REACH, { slack: 0 })) return turnOf(error)

  return state.clip ? 'Walk' : 'WalkStart'
}

type Opens = (aim: number, reach: number, turn?: number) => boolean

const turnOf = (side: number): WelcomeClipName => (side >= 0 ? 'TurnLeft' : 'TurnRight')

/** Which way there is room to swing, or `null` for a walker boxed in on both sides. */
function sideThatOpens(opens: Opens, roll: WelcomeRoll): number | null {
  const left = opens(0, TURN_REACH, QUARTER)
  const right = opens(0, TURN_REACH, -QUARTER)
  if (left && right) return roll() < 0.5 ? QUARTER : -QUARTER
  if (left) return QUARTER

  return right ? -QUARTER : null
}

/**
 * Whether the walker can still walk there: far enough to be worth it, near enough ahead to be
 * steered onto, and with clear ground along the very arc the steering will trace.
 */
function reaches(
  state: WelcomeWalkState,
  goal: { x: number; z: number },
  trees: readonly WelcomeTree[],
): boolean {
  const reach = Math.hypot(goal.x - state.x, goal.z - state.z)
  const error = headingErrorOf(state, goal)
  if (reach < SHORTEST_WALK || Math.abs(error) > SPREAD) return false

  return welcomeGroveOpens(trees, state, reach, { turn: error })
}

/**
 * Somewhere ahead with clear ground between. Drawn rather than laid out: a fixed round of
 * waypoints is a patrol, and a reader watching two turns of it sees the loop.
 */
function aimedAt(
  state: WelcomeWalkState,
  trees: readonly WelcomeTree[],
  roll: WelcomeRoll,
): { x: number; z: number } {
  let outward: { x: number; z: number } | null = null

  for (let tries = 0; tries < 16; tries += 1) {
    const bearing = state.heading + (roll() * 2 - 1) * SPREAD
    const reach = SHORTEST_WALK + roll() * WELCOME_YARD.x
    const goal = {
      x: state.x + Math.sin(bearing) * reach,
      z: state.z + Math.cos(bearing) * reach,
    }
    if (!reaches(state, goal, trees)) continue
    // One that lands well inside wins outright: taking the first that merely fits sent the walker
    // to the rim over and over, where the only clip with room left is a half turn on the spot.
    if (welcomeYardOffset(goal.x, goal.z) < INSIDE) return goal
    outward ??= goal
  }

  // Nothing ahead: the walker keeps the goal they had, and the ladder above turns them out of it.
  return outward ?? state.goal
}
