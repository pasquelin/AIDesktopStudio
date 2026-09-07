import { copyTransform } from '@shared/domain/transform'
import type { SceneNode, SceneState } from './sceneState'

export type RuntimePlacement = Pick<SceneNode, 'id' | 'transform'>

/** A private node order for runtime poses; the authored array is never written into. */
export class RuntimeTransformState {
  private source: SceneState | null = null
  private held: SceneState | null = null
  private readonly indices = new Map<string, number>()

  reset(state: SceneState): void {
    this.source = state
    this.held = null
    this.indices.clear()
  }

  prepare(
    placements: readonly RuntimePlacement[],
    applied: ReadonlyMap<string, SceneNode>,
  ): { state: SceneState; changed: readonly SceneNode[] } | null {
    if (!this.source) return null
    if (this.indices.size === 0) {
      this.source.nodes.forEach((node, index) => this.indices.set(node.id, index))
    }
    const changed = this.changedNodes(placements, applied)
    if (!changed) return null
    // Identity-keyed readers and retained snapshots require a fresh immutable list per frame.
    const nodes = [...(this.held ?? this.source).nodes]
    for (const node of changed) {
      const index = this.indices.get(node.id)
      if (index === undefined) return null
      nodes[index] = node
    }
    this.held = { ...this.source, nodes }
    return { state: this.held, changed }
  }

  private changedNodes(
    placements: readonly RuntimePlacement[],
    applied: ReadonlyMap<string, SceneNode>,
  ): SceneNode[] | null {
    const changed: SceneNode[] = []
    for (const placement of placements) {
      const previous = applied.get(placement.id)
      if (!previous || !this.indices.has(placement.id)) return null
      if (previous.type !== 'mesh' && previous.type !== 'model') return null
      if (previous.type === 'mesh' && previous.instances) return null
      changed.push({ ...previous, transform: copyTransform(placement.transform) })
    }
    return changed
  }
}
