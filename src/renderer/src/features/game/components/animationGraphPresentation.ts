// SPDX-License-Identifier: MIT
import type {
  AnimationCondition,
  AnimationGraph,
  AnimationLayer,
} from '@shared/domain/animationGraph'
import type { ClipSource } from '@shared/domain/sceneModel'

/** The clip a state plays, as one word — the name, whatever the source keeps beside it. */
export function clipSourceLabel(source: ClipSource): string {
  return source.name
}

/** `speed > 0.1`, read left to right. The operator is a symbol in every language. */
export function conditionLabel(condition: AnimationCondition): string {
  return `${condition.param} ${condition.op} ${String(condition.value)}`
}

/** The one layer a graph holds — the reader refuses a second, so this never chooses. */
export function layerOf(graph: AnimationGraph): AnimationLayer | null {
  return graph.layers[0] ?? null
}

/** The graph with that layer in place of its own, which is the whole of what an edit changes. */
export function withLayer(graph: AnimationGraph, layer: AnimationLayer): AnimationGraph {
  return { ...graph, layers: [layer] }
}
