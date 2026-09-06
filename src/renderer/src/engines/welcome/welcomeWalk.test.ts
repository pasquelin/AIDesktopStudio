import { describe, expect, it } from 'vitest'
import { WELCOME_CLIP_NAMES, type WelcomeClipName } from '@shared/domain/welcome'
import {
  welcomeGroveAllows,
  WELCOME_GROVE,
  WELCOME_YARD_AT,
  type WelcomeTree,
} from './welcomeGrove'
import {
  welcomeAdvance,
  welcomeFadeOf,
  welcomeNextClip,
  welcomeToward,
  welcomeTurnOver,
  welcomeWalkStart,
  type WelcomeWalkState,
} from './welcomeWalk'

/**
 * What each shipped clip runs for and how far its own root carries it, measured on the files in
 * `resources/animations/` on 2026-09-06. The engine reads these back off the retargeted clip; a
 * test cannot, and the raw figures are the LONGER of the two — the demanding case for the yard.
 */
type Measured = { duration: number; distance: number; turn: number; side?: number }

const QUARTER = Math.PI / 2

const MEASURED: Record<WelcomeClipName, Measured> = {
  Walk: { duration: 1.067, distance: 1.77, turn: 0 },
  WalkStart: { duration: 2.967, distance: 1.905, turn: 0 },
  WalkStop: { duration: 3.033, distance: 1.158, turn: 0 },
  TurnLeft: { duration: 2.233, distance: 2.803, turn: 1.59 },
  TurnRight: { duration: 2.167, distance: 2.759, turn: -1.54 },
  TurnAround: { duration: 1.033, distance: 0.096, turn: Math.PI },
  StrafeLeft: { duration: 1.067, distance: 1.716, turn: 0, side: QUARTER },
  StrafeRight: { duration: 1.067, distance: 1.716, turn: 0, side: -QUARTER },
}

/** One frame of a clip as the engine hands it over: already turned into the walker's own frame. */
function stepOf(state: WelcomeWalkState, clip: Measured, seconds: number) {
  const turned = (clip.turn * seconds) / clip.duration
  const along = state.heading + turned / 2 + (clip.side ?? 0)
  const covered = (clip.distance * seconds) / clip.duration

  return { x: Math.sin(along) * covered, z: Math.cos(along) * covered, turned }
}

const FRAME = 1 / 60

const NO_STEP = { x: 0, z: 0, turned: 0 }

const TURNS: readonly WelcomeClipName[] = ['TurnLeft', 'TurnRight', 'TurnAround']

/** A tree placed relative to where a stroll begins, which is the middle of the yard and not zero. */
const treeAt = (side: number, ahead: number): WelcomeTree => ({
  x: WELCOME_YARD_AT.x + side,
  z: WELCOME_YARD_AT.z + ahead,
  height: 1,
  crown: 1,
  planter: 0.6,
  turn: 0,
})

/** Somewhere the walker is already facing, far enough off to be worth walking to. */
const goalAhead = { x: WELCOME_YARD_AT.x, z: WELCOME_YARD_AT.z + 2.6 }

/** A stroll of `seconds`, at sixty frames a second, on a roll nobody can call heads or tails on. */
function stroll(seconds: number, trees: readonly WelcomeTree[] = WELCOME_GROVE, seed = 1) {
  let dice = seed
  const roll = (): number => (dice = (dice * 48271) % 2147483647) / 2147483647

  let state = welcomeWalkStart()
  const visited: WelcomeWalkState[] = []
  const played: (WelcomeClipName | null)[] = []

  for (let step = 0; step * FRAME < seconds; step += 1) {
    const clip = state.clip ? MEASURED[state.clip] : null
    state = welcomeAdvance(state, clip ? stepOf(state, clip, FRAME) : NO_STEP, FRAME)
    if (clip ? state.time >= clip.duration : state.pause <= 0) {
      state = welcomeTurnOver(state, trees, roll)
      played.push(state.clip)
    }
    visited.push(state)
  }

  const spent = (names: readonly WelcomeClipName[]): number =>
    visited.filter(state => state.clip !== null && names.includes(state.clip)).length

  return { visited, played, spent }
}

describe('a walker taking one clip', () => {
  it('covers exactly the ground the clip covered, which is what stops the feet sliding', () => {
    const state: WelcomeWalkState = {
      ...welcomeWalkStart(),
      clip: 'Walk',
      heading: 0,
      goal: goalAhead,
    }

    expect(welcomeAdvance(state, { x: 0, z: 0.4, turned: 0 }, 0.1).z - state.z).toBeCloseTo(0.4, 2)
  })

  it('is left turned by the clip’s own turn, which the clip is what carries', () => {
    let state: WelcomeWalkState = { ...welcomeWalkStart(), clip: 'TurnLeft', heading: 0 }
    const clip = MEASURED.TurnLeft
    for (let step = 0; step * FRAME < clip.duration; step += 1) {
      state = welcomeAdvance(state, stepOf(state, clip, FRAME), FRAME)
    }

    expect(state.heading).toBeCloseTo(clip.turn, 1)
  })

  it('carries a strafe sideways without turning, which is what makes it a side step', () => {
    const state: WelcomeWalkState = { ...welcomeWalkStart(), clip: 'StrafeLeft', heading: 0 }
    const moved = welcomeAdvance(state, stepOf(state, MEASURED.StrafeLeft, 0.1), 0.1)

    expect(moved.heading).toBe(0)
    expect(moved.x - state.x).toBeGreaterThan(0.1)
    expect(Math.abs(moved.z - state.z)).toBeLessThan(0.001)
  })

  it('steers a straight gait toward its goal, which is what curves a path without a turn clip', () => {
    const state: WelcomeWalkState = {
      ...welcomeWalkStart(),
      clip: 'Walk',
      heading: 0,
      goal: { x: 4, z: 4 },
    }

    expect(welcomeAdvance(state, { x: 0, z: 0.4, turned: 0 }, 0.1).heading).toBeGreaterThan(0)
  })
})

describe('a goal handed by the carousel', () => {
  it('never restarts the gait, which is what a slide flicked through would look like', () => {
    const walking: WelcomeWalkState = { ...welcomeWalkStart(), clip: 'Walk', time: 0.4, pause: 0 }

    let moved = walking
    for (let slide = 0; slide < 8; slide += 1) {
      moved = welcomeToward(moved, { x: slide, z: -3 })
    }

    expect(moved.clip).toBe('Walk')
    expect(moved.time).toBe(0.4)
    expect(moved.goal).toEqual({ x: 7, z: -3 })
  })

  it('cuts a stand short, so a change of slide shows rather than passing unseen', () => {
    const standing: WelcomeWalkState = { ...welcomeWalkStart(), clip: null, pause: 2.5 }

    expect(welcomeToward(standing, { x: 0, z: -3 }).pause).toBeLessThan(standing.pause)
  })
})

describe('what a walker plays next', () => {
  it('sets off from a stand rather than breaking into a stride', () => {
    expect(welcomeNextClip(welcomeWalkStart(), WELCOME_GROVE, () => 0.5)).toBe('WalkStart')
  })

  it('stands once it has stopped, so a pause is a pause and not a stutter', () => {
    const stopped: WelcomeWalkState = { ...welcomeWalkStart(), clip: 'WalkStop' }

    expect(welcomeNextClip(stopped, WELCOME_GROVE, () => 0.5)).toBeNull()
  })

  it('holds a finished WalkStop rather than fading the stand in from an empty mixer', () => {
    expect(welcomeFadeOf('WalkStop', null)).toBe('hold')
    expect(welcomeFadeOf(null, 'WalkStart')).toBe('rise')
    expect(welcomeFadeOf('Walk', 'WalkStop')).toBe('cross')
    expect(welcomeFadeOf('Walk', 'Walk')).toBe('loop')
  })

  it('swings round something in the way rather than walking into it', () => {
    const walking: WelcomeWalkState = {
      ...welcomeWalkStart(),
      clip: 'Walk',
      heading: 0,
      goal: goalAhead,
    }

    // Off to one side, not dead ahead: a quarter turn's arc leaves straight before it bends, so a
    // planter squarely in front closes both swings and the walker turns on the spot instead.
    expect(['TurnLeft', 'TurnRight']).toContain(
      welcomeNextClip(walking, [treeAt(1.3, 1.8)], () => 0.5),
    )
  })

  it('turns on the spot rather than into a corner it cannot swing out of', () => {
    const boxed: readonly WelcomeTree[] = [treeAt(0, 1.9), treeAt(2, 0.4), treeAt(-2, 0.4)]
    const walking: WelcomeWalkState = {
      ...welcomeWalkStart(),
      clip: 'Walk',
      heading: 0,
      goal: goalAhead,
    }

    expect(welcomeNextClip(walking, boxed, () => 0.5)).toBe('TurnAround')
  })

  it('never lands two garnishes running, which is what a mechanical sequence looks like', () => {
    const { played } = stroll(900)
    // The two the dice alone bring. A half turn is left out: it is also what a corner forces,
    // and two of those in a row is the yard talking rather than the dice.
    const garnish: readonly (WelcomeClipName | null)[] = ['StrafeLeft', 'StrafeRight']

    expect(played.length).toBeGreaterThan(200)
    expect(
      played.filter(
        (clip, index) => garnish.includes(clip) && garnish.includes(played[index - 1] ?? null),
      ),
    ).toEqual([])
  })

  it('plays every clip it loads over a long enough stroll', () => {
    expect([...new Set(stroll(2400).played)].sort()).toEqual([null, ...WELCOME_CLIP_NAMES].sort())
  })
})

/**
 * 🛑 TEN rolls, not one. On the single seed this suite began with, three defects that strand the
 * walker for the rest of the session read green: a side step steered off the lane its look-ahead
 * had cleared, and standing within the look-ahead's own slack of a planter shut every clip at once.
 */
const STROLLS = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23].map(seed => stroll(900, WELCOME_GROVE, seed))

describe('a stroll of a quarter of an hour', () => {
  it('never leaves the yard and never walks into a planter', () => {
    const off = STROLLS.flatMap(({ visited }) =>
      visited.filter(state => !welcomeGroveAllows(WELCOME_GROVE, state.x, state.z)),
    )

    expect(off).toEqual([])
  })

  it('spends more of itself walking than turning, or it reads as a merry-go-round', () => {
    for (const { spent } of STROLLS) {
      expect(spent(['Walk', 'WalkStart', 'WalkStop'])).toBeGreaterThan(spent(TURNS))
    }
  })

  it('stands still now and then rather than pacing without end', () => {
    for (const { visited } of STROLLS) {
      expect(visited.filter(state => state.clip === null).length).toBeGreaterThan(600)
    }
  })
})
