import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { csgPartOf, type CsgGraph, type CsgPart } from '@shared/domain/csg'
import { DEFAULT_MATERIAL } from '../scene/sceneState'
import { evaluateGraph } from './csgEvaluate'

const cube = (name: string): CsgPart =>
  csgPartOf(name, { kind: 'box', width: 1, height: 1, depth: 1 }, DEFAULT_MATERIAL)

const at = (name: string, x: number): CsgPart => ({
  ...cube(name),
  transform: { ...cube(name).transform, position: { x, y: 0, z: 0 } },
})

/** A solid built by folding one more cube onto the last — what a modeller actually does. */
function chained(depth: number): CsgGraph {
  let graph: CsgGraph = { base: cube('Base'), steps: [], collision: 'trimesh' }
  for (let step = 0; step < depth; step += 1) {
    graph = {
      base: csgPartOf(`Solid ${step}`, graph, DEFAULT_MATERIAL),
      steps: [{ operation: 'unite', part: at(`Cube ${step}`, step * 0.6 + 0.6) }],
      collision: 'trimesh',
    }
  }
  return graph
}

describe('one more cut on a solid already made', () => {
  // The gesture the sub-recipe cache exists for: everything below the new step is already known.
  bench('a tenth union, over nine already evaluated', () => {
    evaluateGraph(chained(10))
  })

  bench('a plain window in a wall', () => {
    evaluateGraph({
      base: {
        ...cube('Wall'),
        transform: { ...cube('Wall').transform, scale: { x: 4, y: 3, z: 0.2 } },
      },
      steps: [{ operation: 'subtract', part: cube('Hole') }],
      collision: 'trimesh',
    })
  })
})
