import { describe, expect, it } from 'vitest'
import {
  approach,
  WELCOME_DRIFT,
  WELCOME_HEIGHT,
  WELCOME_RADIUS,
  WELCOME_SWING,
  WELCOME_SWING_RATE,
  WELCOME_TARGET,
  welcomeAzimuth,
  welcomePose,
} from './welcomeMotion'

/** A sine crosses its own bound by an ulp at the top of the swing, and the bound is the claim. */
const ROUNDING = 1e-9

/** Read from what the camera ORBITS, which is the target and not the world's origin. */
const groundDistance = (pose: ReturnType<typeof welcomePose>): number =>
  Math.hypot(pose.eye.x - WELCOME_TARGET.x, pose.eye.z - WELCOME_TARGET.z)

describe('the welcome camera', () => {
  it('stands above what it looks at, so the floor fills the frame rather than a horizon band', () => {
    expect(welcomePose(0, 0).eye.y).toBeGreaterThan(WELCOME_TARGET.y)
  })

  it('orbits rather than slides, which is what swings every line of the floor at once', () => {
    const swung = welcomePose(0, welcomeAzimuth(3))

    expect(swung.eye.x).not.toBeCloseTo(welcomePose(0, 0).eye.x)
    expect(groundDistance(swung)).toBeCloseTo(WELCOME_RADIUS + WELCOME_DRIFT)
  })

  it('swings by a whole step per slide, so advancing is something the reader sees move', () => {
    expect(welcomeAzimuth(4) - welcomeAzimuth(3)).toBeCloseTo(WELCOME_SWING)
  })

  it('holds the horizon still while it moves, the target being what sets it', () => {
    expect(welcomePose(9.3, welcomeAzimuth(2)).target).toEqual(WELCOME_TARGET)
  })

  it('keeps its distance however long it drifts, the copy standing on this floor', () => {
    for (let step = 0; step < 400; step += 1) {
      const pose = welcomePose(step * 1.7, welcomeAzimuth(5))

      expect(Math.abs(groundDistance(pose) - WELCOME_RADIUS)).toBeLessThanOrEqual(
        WELCOME_DRIFT + ROUNDING,
      )
      expect(Math.abs(pose.eye.y - WELCOME_HEIGHT)).toBeLessThanOrEqual(WELCOME_DRIFT + ROUNDING)
    }
  })

  it('gives the same camera twice for a frozen clock, which is what reduced motion asks of it', () => {
    expect(welcomePose(4, 0.2)).toEqual(welcomePose(4, 0.2))
  })
})

describe('the settling of the swing', () => {
  it('takes the same time to catch an azimuth whatever the frame rate', () => {
    const slow = approach(0, 1, 0.5, WELCOME_SWING_RATE)
    const fast = Array.from({ length: 30 }).reduce<number>(
      swing => approach(swing, 1, 0.5 / 30, WELCOME_SWING_RATE),
      0,
    )

    expect(fast).toBeCloseTo(slow, 6)
  })

  it('closes on its azimuth without ever passing it, a camera that overshoots reading as a jolt', () => {
    let swing = 0
    for (let step = 0; step < 200; step += 1) {
      swing = approach(swing, WELCOME_SWING, 1 / 60, WELCOME_SWING_RATE)
      expect(swing).toBeLessThanOrEqual(WELCOME_SWING)
    }

    expect(swing).toBeCloseTo(WELCOME_SWING, 3)
  })
})
