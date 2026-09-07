import { clamp } from '../numeric'
import type { Vector3 } from './scene'

/**
 * Spherical angles and the direction they stand for. Two callers need exactly this and would
 * otherwise each write it: the sun of a skybox, and a camera that turns its head in place.
 *
 * Convention, shared with `domain/skybox`: azimuth `0` aims at `+Z` and grows towards `+X`;
 * elevation is `0` at the horizon, `+PI/2` at the zenith.
 */
export type SphericalAngles = {
  elevation: number
  azimuth: number
}

const TWO_PI = Math.PI * 2
const PER_RADIAN = 180 / Math.PI

/** Radians are what three.js turns in and what a document stores; nobody types in them. */
export function toRadians(degrees: number): number {
  return degrees / PER_RADIAN
}

export function toDegrees(radians: number): number {
  return radians * PER_RADIAN
}

/** The three axes at once, which is how an inspector shows a rotation. */
export function degreesOf(vector: Vector3): Vector3 {
  return { x: toDegrees(vector.x), y: toDegrees(vector.y), z: toDegrees(vector.z) }
}

/**
 * Just short of the pole. Exactly at it the direction is vertical and the azimuth stops
 * meaning anything, so a camera clamped to the pole loses which way it was facing.
 */
export const POLE_LIMIT = Math.PI / 2 - 1e-3

/** Wraps an angle into `[0, 2PI)`, so two azimuths aiming the same way compare equal. */
export function normalizeAzimuth(azimuth: number): number {
  const wrapped = azimuth % TWO_PI
  return wrapped < 0 ? wrapped + TWO_PI : wrapped
}

export function clampElevation(elevation: number): number {
  return clamp(elevation, -POLE_LIMIT, POLE_LIMIT)
}

/** Unit vector pointing from the origin along the given angles. */
export function directionFromAngles({ elevation, azimuth }: SphericalAngles): Vector3 {
  const horizontal = Math.cos(elevation)
  return {
    x: horizontal * Math.sin(azimuth),
    y: Math.sin(elevation),
    z: horizontal * Math.cos(azimuth),
  }
}

/**
 * The angles a direction stands for — the inverse of `directionFromAngles`, and the half of a
 * drag gesture that turns a ray into state. The vector is normalized here rather than by the
 * caller: a ray off unit length by a rounding error would push `asin` out of range and hand
 * back `NaN` for an elevation, which then poisons every frame that reads it.
 *
 * `fallback` answers the degenerate ray of no length, where no angle is more true than another.
 */
export function anglesFromDirection(
  direction: Vector3,
  fallback: SphericalAngles,
): SphericalAngles {
  const { x, y, z } = direction
  const length = Math.hypot(x, y, z)
  if (length === 0) return fallback

  // Clamped before `asin`, not after: a ray off unit length by 1e-16 is outside its domain.
  const vertical = clamp(y / length, -1, 1)
  return {
    elevation: Math.asin(vertical),
    azimuth: normalizeAzimuth(Math.atan2(x, z)),
  }
}
