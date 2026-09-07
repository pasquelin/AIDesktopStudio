import type { ReliefSculpt } from './reliefPacking'

/**
 * One edit's contribution to a combined height. Identity (id, name, locked) lives on
 * `TerrainEditLayer` — this is the blend the height functions read.
 */
export type ReliefOverlay = {
  enabled: boolean
  alpha: number
  sculpt?: ReliefSculpt
  mask?: ReliefMask
}

/**
 * Per-texel weight on an overlay. Absent mask = 1 everywhere. Painted missing chunks = 0
 * (paint-in). Height and slope are procedural on the incoming unmasked combined of the others.
 */
export type ReliefMask =
  | { kind: 'painted'; weights: ReliefSculpt }
  | { kind: 'height'; min: number; max: number }
  | { kind: 'slope'; min: number; max: number }
