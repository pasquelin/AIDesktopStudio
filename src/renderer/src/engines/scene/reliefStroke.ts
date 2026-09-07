import type { ReliefLayer, TerrainEditLayer, WorldLayer } from '@shared/domain/scene'

export type ReliefStrokePoint = { x: number; z: number }

/**
 * Dabs between two pointer samples, spaced in world units — the canvas brush does the same,
 * rather than one dab per raw mouse pixel.
 *
 * The starting sample is the previous dab; this returns the new ones, `to` included when it
 * lands on a step.
 */
export function strokeDabs(
  from: ReliefStrokePoint,
  to: ReliefStrokePoint,
  spacing: number,
): ReliefStrokePoint[] {
  if (!(spacing > 0)) return [to]
  const dx = to.x - from.x
  const dz = to.z - from.z
  const dist = Math.hypot(dx, dz)
  if (dist < spacing) return []
  const out: ReliefStrokePoint[] = []
  const steps = Math.floor(dist / spacing)
  for (let step = 1; step <= steps; step += 1) {
    const u = (step * spacing) / dist
    out.push({ x: from.x + dx * u, z: from.z + dz * u })
  }
  return out
}

/** How far apart consecutive dabs sit, as a fraction of the brush radius. */
export const STROKE_SPACING = 0.25

/** Sample-space raise of one dab. The session default; the panel exposes it as intensity. */
export const SCULPT_AMOUNT = 0.1

export type SculptTool = 'raise' | 'smooth' | 'flatten' | 'paint' | 'paintGround'

/**
 * The edit a stroke writes into. An armed terrain with no edit of its own takes the first
 * enabled unlocked one — the World panel arms a terrain as a whole that way.
 */
export function sculptEditOf(
  layers: readonly WorldLayer[],
  armed: { terrainId: string; editId: string | null } | null,
): { terrainId: string; editId: string } | null {
  if (!armed) return null
  const terrain = layers.find(
    (layer): layer is ReliefLayer => layer.kind === 'relief' && layer.id === armed.terrainId,
  )
  if (!terrain || !terrain.enabled || terrain.locked.sculpt) return null
  const edit = armed.editId
    ? terrain.edits.find(candidate => candidate.id === armed.editId)
    : terrain.edits.find(writableEdit)
  if (!edit || !writableEdit(edit)) return null
  return { terrainId: terrain.id, editId: edit.id }
}

function writableEdit(edit: TerrainEditLayer): boolean {
  return edit.enabled && !edit.locked
}
