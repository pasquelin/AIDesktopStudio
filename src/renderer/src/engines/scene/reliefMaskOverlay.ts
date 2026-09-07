import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Mesh,
  type Group,
  type Material,
} from 'three'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import { clamp } from '@shared/numeric'
import { chunkLayout, overlayDeltaReader, type ReliefChunkLayout } from '@shared/domain/relief'
import type { TerrainEditLayer } from '@shared/domain/scene'
import { rootColour, rootRatio } from '../core/palette'
import type { ReliefGeometryData } from './reliefBuildMessage'

type OverlayHost = {
  material: Material
  group: Group
  meshes: Map<string, Mesh>
}

/**
 * Draws the tint on a template and on the terrains cloned from it, or hides it, and answers what
 * the template was showing — so a caller restores what it found rather than deriving the rule.
 */
export function showMaskTint(
  template: Material,
  clones: Iterable<{ material: Material }>,
  shown: boolean,
): boolean {
  const was = template.vertexColors
  const apply = (material: Material): void => {
    if (material.vertexColors === shown) return
    material.vertexColors = shown
    material.needsUpdate = true
  }
  apply(template)
  for (const clone of clones) apply(clone.material)
  return was
}

export function addReliefChunk(
  host: OverlayHost,
  data: ReliefGeometryData,
  samples: HeightmapSamples,
  grain: number,
  edits: readonly TerrainEditLayer[],
): void {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(data.position, 3).setUsage(DynamicDrawUsage),
  )
  geometry.setAttribute('normal', new BufferAttribute(data.normal, 3).setUsage(DynamicDrawUsage))
  geometry.setAttribute('uv', new BufferAttribute(data.uv, 2))
  geometry.setIndex(new BufferAttribute(data.index, 1))
  writeMaskOverlay(
    geometry,
    samples,
    chunkLayout(data.column, data.row, samples.width, samples.height, grain),
    grain,
    edits,
  )
  const mesh = new Mesh(geometry, host.material)
  mesh.name = `relief-chunk-${data.column}-${data.row}`
  mesh.castShadow = false
  mesh.receiveShadow = true
  host.group.add(mesh)
  host.meshes.set(`${data.column}:${data.row}`, mesh)
}

/**
 * Vertex tint of a painted mask: white where the stencil is empty, softened accent where it is
 * full. A mask is a CHOSEN content, so it carries `accent-soft` rather than the solid accent the
 * contract keeps for what one actions.
 */
export function writeMaskOverlay(
  geometry: BufferGeometry,
  samples: HeightmapSamples,
  layout: ReliefChunkLayout,
  grain: number,
  edits: readonly TerrainEditLayer[],
): void {
  const vertices = layout.width * layout.height
  const painted = paintedEdits(edits)
  // Nothing to tint and nothing tinted last time: a raise dab on a terrain with no painted mask
  // rewrote 12 675 floats of white and re-uploaded 50 kB per dirtied chunk, for nothing.
  if (painted.length === 0 && geometry.userData.maskOverlayTinted !== true) return
  geometry.userData.maskOverlayTinted = painted.length > 0
  const color = colorAttribute(geometry, vertices)
  const into = color.array
  if (!(into instanceof Float32Array)) return
  const [red, green, blue] = accentRgb()
  const tint = rootRatio('--sc-relief-mask-tint', 1)
  const weightAt = paintedOverlayAt(painted, samples, grain)
  for (let z = 0; z < layout.height; z++) {
    for (let x = 0; x < layout.width; x++) {
      const weight = weightAt(layout.sampleX + x, layout.sampleZ + z) * tint
      const at = (z * layout.width + x) * 3
      into[at] = 1 - weight + weight * red
      into[at + 1] = 1 - weight + weight * green
      into[at + 2] = 1 - weight + weight * blue
    }
  }
  color.addUpdateRange(0, vertices * 3)
  color.needsUpdate = true
}

/** The enabled edits whose mask is painted — the only ones that tint anything. */
function paintedEdits(edits: readonly TerrainEditLayer[]): readonly TerrainEditLayer[] {
  return edits.filter(edit => edit.enabled && edit.mask?.kind === 'painted')
}

function paintedOverlayAt(
  edits: readonly TerrainEditLayer[],
  samples: HeightmapSamples,
  grain: number,
): (sx: number, sz: number) => number {
  const readers = edits.flatMap(edit =>
    edit.mask?.kind === 'painted' ? [overlayDeltaReader(samples, grain, edit.mask.weights)] : [],
  )
  return (sx, sz) => {
    let peak = 0
    for (const read of readers) {
      const weight = clamp(read(sx, sz), 0, 1)
      if (weight > peak) peak = weight
    }
    return peak
  }
}

function colorAttribute(geometry: BufferGeometry, vertices: number): BufferAttribute {
  const held = geometry.getAttribute('color')
  if (held instanceof BufferAttribute && held.array.length === vertices * 3) return held
  // Filled with white: zeroes under `vertexColors` are not « no tint », they are black.
  const next = new BufferAttribute(new Float32Array(vertices * 3).fill(1), 3).setUsage(
    DynamicDrawUsage,
  )
  geometry.setAttribute('color', next)
  return next
}

/**
 * Through `Color`, never a hand-rolled parse: a vertex colour is read as already linear, so the
 * raw sRGB of `#346ef2` (0.204, 0.431, 0.949) paints 0.034, 0.156, 0.888 — a washed-out blue.
 * It also reads `rgb()`, which a hex parse silently turned black.
 *
 * 🛑 It does NOT read `color-mix()`: measured 2026-09-05, `new Color()` renders that WHITE. Hence
 * the softening rides a ratio gauge rather than the `--color-accent-soft` token.
 */
function accentRgb(): [number, number, number] {
  const accent = new Color(rootColour('--color-accent'))
  return [accent.r, accent.g, accent.b]
}
