/**
 * What two successive edit lists changed, which is what decides between building a terrain again
 * and patching the chunks it dirtied.
 */
import { changedChunks } from '@shared/domain/relief'
import type { ReliefChunkKey, ReliefMask, ReliefSculpt } from '@shared/domain/relief'
import type { TerrainEditLayer } from '@shared/domain/scene'

/** Whether a change reaches past the chunks `dirtiedChunks` names, so the terrain is built again. */
export function blendChanged(
  before: readonly TerrainEditLayer[],
  after: readonly TerrainEditLayer[],
): boolean {
  const previous = new Map(before.map(edit => [edit.id, edit]))
  for (const edit of after) {
    const held = previous.get(edit.id)
    if (!held) continue
    if (held.enabled !== edit.enabled || held.alpha !== edit.alpha) return true
    // A painted mask moves chunk by chunk, which the patch path handles. Height and slope read the
    // incoming combined of the whole map, so either bound moving repaints all of it.
    if (held.mask !== edit.mask && !(paintedWeights(held.mask) && paintedWeights(edit.mask))) {
      return true
    }
  }
  return false
}

/** The chunks whose sculpt or painted mask moved, each named once. */
export function dirtiedChunks(
  before: readonly TerrainEditLayer[],
  after: readonly TerrainEditLayer[],
): ReliefChunkKey[] {
  const keys = new Map<string, ReliefChunkKey>()
  const previous = new Map(before.map(edit => [edit.id, edit]))
  const next = new Map(after.map(edit => [edit.id, edit]))
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const left = previous.get(id)
    const right = next.get(id)
    const moved = [
      ...changedChunks(left?.sculpt, right?.sculpt ?? { chunks: [] }),
      ...changedChunks(paintedWeights(left?.mask), paintedWeights(right?.mask) ?? { chunks: [] }),
    ]
    for (const chunk of moved) keys.set(`${chunk.column}:${chunk.row}`, chunk)
  }
  return [...keys.values()]
}

function paintedWeights(mask: ReliefMask | undefined): ReliefSculpt | undefined {
  return mask?.kind === 'painted' ? mask.weights : undefined
}
