import { clamp } from '../numeric'

type Angles = { x: number; y: number; z: number }
type Up = { x: number; y: number; z: number }

/**
 * Euler angles, in the XYZ order `applyTransform` reads, that stand a prop on `up` and spin it by
 * `yaw`. Composed then extracted rather than written in closed form: with a yaw in the middle of
 * an XYZ triple, no pitch/roll pair reconstructs an arbitrary normal.
 */
export function standingAngles(up: Up, yaw: number): Angles {
  const length = Math.hypot(up.x, up.y, up.z) || 1
  const ux = up.x / length
  const uy = up.y / length
  const uz = up.z / length
  return eulerXyzOf(multiplied(alignedTo(ux, uy, uz), turnedAroundY(yaw)))
}

/** Row-major 3×3, the way `eulerXyzOf` reads it. */
type Matrix3 = readonly [number, number, number, number, number, number, number, number, number]

/** Rodrigues about the shortest arc from world up to (ux, uy, uz). */
function alignedTo(ux: number, uy: number, uz: number): Matrix3 {
  const sine = Math.hypot(uz, ux)
  if (sine < 1e-9) return uy >= 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, -1, 0, 0, 0, -1]
  const kx = uz / sine
  const kz = -ux / sine
  const cosine = clamp(uy, -1, 1)
  const rest = 1 - cosine
  return [
    cosine + kx * kx * rest,
    -kz * sine,
    kx * kz * rest,
    kz * sine,
    cosine,
    -kx * sine,
    kx * kz * rest,
    kx * sine,
    cosine + kz * kz * rest,
  ]
}

function turnedAroundY(angle: number): Matrix3 {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [cosine, 0, sine, 0, 1, 0, -sine, 0, cosine]
}

function multiplied(left: Matrix3, right: Matrix3): Matrix3 {
  const out: number[] = []
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0
      for (let at = 0; at < 3; at += 1)
        sum += (left[row * 3 + at] ?? 0) * (right[at * 3 + column] ?? 0)
      out.push(sum)
    }
  }
  return out as unknown as Matrix3
}

/** three's own decomposition for `Euler` order XYZ, where the matrix is Rx·Ry·Rz. */
function eulerXyzOf(m: Matrix3): Angles {
  const y = Math.asin(clamp(m[2] ?? 0, -1, 1))
  if (Math.abs(m[2] ?? 0) < 0.9999999)
    return { x: Math.atan2(-(m[5] ?? 0), m[8] ?? 0), y, z: Math.atan2(-(m[1] ?? 0), m[0] ?? 0) }
  return { x: Math.atan2(m[7] ?? 0, m[4] ?? 0), y, z: 0 }
}
