// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { createGameLoop, MAX_FRAME_SECONDS, STEP_SECONDS } from './gameLoop'
import { testWorld } from './world-fixtures'

describe('the loop that catches a frame up', () => {
  it('runs no step on the first call, having no elapsed time to catch up on', () => {
    expect(createGameLoop(testWorld()).advance(10)).toBe(0)
  })

  it('runs one step per whole step of elapsed time, and keeps the remainder', () => {
    const loop = createGameLoop(testWorld())
    loop.advance(0)

    expect(loop.advance(STEP_SECONDS * 2.5)).toBe(2)
    expect(loop.alpha()).toBeCloseTo(0.5, 6)
    expect(loop.advance(STEP_SECONDS * 2.9)).toBe(0)
    expect(loop.advance(STEP_SECONDS * 3.2)).toBe(1)
  })

  /**
   * A tab in the background comes back with seconds elapsed. Unclamped, the catch-up takes longer
   * than a frame, which makes the next frame later still — the spiral. The game runs slow instead.
   */
  it('simulates at most a clamped frame, however long the machine was away', () => {
    const loop = createGameLoop(testWorld())
    loop.advance(0)

    expect(loop.advance(30)).toBe(Math.floor(MAX_FRAME_SECONDS / STEP_SECONDS))
  })

  /**
   * What smoothing reads. Taken from the FRAME and not from the step: a lag written against the
   * step runs twice as fast on a screen drawing twice as often.
   */
  it('hands a late pass the seconds of the frame, clamped as the catch-up is', () => {
    const frames: number[] = []
    const world = testWorld({
      systems: [
        { name: 'camera', reads: [], writes: [], lateUpdate: (_, __, dt) => frames.push(dt) },
      ],
    })
    const loop = createGameLoop(world)
    loop.advance(0)
    loop.advance(0.02)
    loop.advance(0.05)
    loop.advance(30)

    expect(frames[0]).toBeCloseTo(0.02, 6)
    expect(frames[1]).toBeCloseTo(0.03, 6)
    expect(frames[2]).toBe(MAX_FRAME_SECONDS)
  })

  it('draws between two steps rather than only on one', () => {
    const drawn: number[] = []
    const world = testWorld({
      systems: [
        { name: 'camera', reads: [], writes: [], lateUpdate: (_, alpha) => drawn.push(alpha) },
      ],
    })
    const loop = createGameLoop(world)
    loop.advance(0)
    loop.advance(STEP_SECONDS * 1.5)

    expect(drawn).toHaveLength(1)
    expect(drawn[0]).toBeCloseTo(0.5, 6)
  })
})

describe('the clock the loop reads', () => {
  /** A world at another rate driven by the loop's own default ran every system at the wrong dt. */
  it('steps at the rate the world was built with, not at its own default', () => {
    const world = testWorld({ step: 1 / 30 })
    const loop = createGameLoop(world)
    loop.advance(0)

    expect(loop.advance(1 / 30)).toBe(1)
    expect(world.time.step).toBe(1 / 30)
  })

  it('stands still rather than falling behind when the clock goes backwards', () => {
    const loop = createGameLoop(testWorld())
    loop.advance(0)
    loop.advance(1)

    expect(loop.advance(0.5)).toBe(0)
    expect(loop.alpha()).toBeGreaterThanOrEqual(0)
    expect(loop.advance(0.5 + STEP_SECONDS * 2)).toBe(2)
  })
})

describe('a loop that comes back from a pause', () => {
  /** A minute paused is not a minute of gameplay owed — the clamp alone would still owe 0,25 s. */
  it('takes the next frame as an origin rather than a gap to catch up on', () => {
    const world = testWorld()
    const loop = createGameLoop(world)
    loop.advance(0)
    loop.advance(1)
    const caught = world.time.tick

    loop.reset()

    expect(loop.advance(61)).toBe(0)
    expect(world.time.tick).toBe(caught)
  })
})
