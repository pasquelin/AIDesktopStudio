// SPDX-License-Identifier: MIT
import type {
  AnimationCondition,
  AnimationGraph,
  AnimationLayer,
  AnimationTransition,
} from '@shared/domain/animationGraph'

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

/** Every way INTO a state, which is what says when it is played at all. */
export function entriesOf(layer: AnimationLayer, state: string): readonly AnimationTransition[] {
  return layer.transitions.filter(transition => transition.to === state)
}

/** Its conditions as one reading — `grounded == true, speed > 0.15`. */
export function conditionsLabel(transition: AnimationTransition): string {
  return transition.when.map(conditionLabel).join(', ')
}
