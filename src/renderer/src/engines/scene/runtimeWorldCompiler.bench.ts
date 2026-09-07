import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { meshNode } from './scene-fixtures'
import {
  createRuntimeWorldCompiler,
  runtimeArtifactsOf,
  runtimeWorldPatch,
} from './runtimeWorldCompiler'
import type { SceneState } from './sceneState'

const COUNT = 50_000
const nodes = Array.from({ length: COUNT }, (_unused, index) => {
  const node = meshNode(`node-${index}`)
  return {
    ...node,
    transform: {
      ...node.transform,
      position: { x: Math.floor(index / 16) * 512, y: 0, z: index % 16 },
    },
  }
})
const before: SceneState = {
  nodes,
  selectedIds: [],
  world: DEFAULT_WORLD,
  animation: EMPTY_TIMELINE,
}
const changed: SceneState = {
  ...before,
  nodes: nodes.map((node, index) => (index === COUNT - 1 ? { ...node, visible: false } : node)),
}
const forward = runtimeWorldPatch(before, changed)
const backward = runtimeWorldPatch(changed, before)

describe('50,000 authoring nodes with one local edit', () => {
  let globallyCurrent = before
  bench('rescans every artifact after the delta', () => {
    const next = globallyCurrent === before ? changed : before
    runtimeArtifactsOf(next.nodes, next.animation)
    globallyCurrent = next
  })

  const compiler = createRuntimeWorldCompiler()
  compiler.compileRuntimeWorld(before)
  let current = before
  bench('compiles the delta from the regional cache', () => {
    const next = current === before ? changed : before
    compiler.compileRuntimeRegion(current === before ? forward : backward)
    current = next
  })
})
