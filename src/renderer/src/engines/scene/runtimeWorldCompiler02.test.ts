import { describe, expect, it } from 'vitest'
import { EMPTY_TIMELINE, type AnimationTimeline } from '@shared/domain/animation'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import { meshNode } from './scene-fixtures'
import {
  createRuntimeWorldCompiler,
  runtimeArtifactsOf,
  runtimeWorldPatch,
} from './runtimeWorldCompiler'
import type { SceneState } from './sceneState'
import type { ModelNode } from './sceneState'

const stateOf = (...nodes: ReturnType<typeof meshNode>[]): SceneState => ({
  nodes,
  selectedIds: [],
  world: DEFAULT_WORLD,
  animation: EMPTY_TIMELINE,
})

function boxNode(id: string, width: number, x: number): ReturnType<typeof meshNode> {
  const node = meshNode(id)
  return {
    ...node,
    geometry: { kind: 'box', width, height: 1, depth: 1 },
    transform: { ...node.transform, position: { x, y: 0, z: 0 } },
  }
}

describe('createRuntimeWorldCompiler', () => {
  it('groups compatible automatic and forced model instances as the whole-world analysis does', () => {
    const model = (id: string, mode: 'auto' | 'instance'): ModelNode => ({
      ...meshNode(id),
      type: 'model',
      model: { assetId: 'tree' },
      optimization: { mode },
    })
    const nodes = [
      ...Array.from({ length: 15 }, (_unused, index) => model(`auto-${index}`, 'auto')),
      model('forced', 'instance'),
    ]

    const runtime = createRuntimeWorldCompiler().compileRuntimeWorld({
      ...stateOf(),
      nodes,
    })

    expect(runtime.runtimeOptimization.artifacts).toEqual(runtimeArtifactsOf(nodes, EMPTY_TIMELINE))
    expect(runtime.runtimeOptimization.artifacts[0]?.sourceIds).toHaveLength(16)
  })

  it('propagates a forced mesh instance across compatible spatial regions', () => {
    const compiler = createRuntimeWorldCompiler()
    const forced = {
      ...meshNode('forced'),
      optimization: { mode: 'instance' },
    } satisfies ReturnType<typeof meshNode>
    const sourceAuto = meshNode('auto')
    const automatic = {
      ...sourceAuto,
      transform: { ...sourceAuto.transform, position: { x: 512, y: 0, z: 0 } },
    }
    const before = stateOf(forced, automatic)

    const runtime = compiler.compileRuntimeWorld(before)

    expect(runtime.runtimeOptimization.artifacts).toEqual(
      runtimeArtifactsOf(before.nodes, EMPTY_TIMELINE),
    )
    expect(runtime.runtimeOptimization.artifacts).toHaveLength(2)

    const movedAutomatic = {
      ...automatic,
      transform: { ...automatic.transform, position: { x: 512, y: 0, z: 1 } },
    }
    const movedState = stateOf(forced, movedAutomatic)
    const movedRuntime = compiler.compileRuntimeRegion(runtimeWorldPatch(before, movedState))
    expect(movedRuntime?.runtimeOptimization.artifacts).toEqual(
      runtimeArtifactsOf(movedState.nodes, EMPTY_TIMELINE),
    )

    const unforced = { ...forced, optimization: { mode: 'auto' } } satisfies ReturnType<
      typeof meshNode
    >
    const after = stateOf(unforced, movedAutomatic)
    const changed = compiler.compileRuntimeRegion(runtimeWorldPatch(movedState, after))

    expect(changed?.runtimeOptimization.artifacts).toEqual(
      runtimeArtifactsOf(after.nodes, EMPTY_TIMELINE),
    )
  })

  it('does not propagate forcing from an animated mesh excluded by the canonical policy', () => {
    const sourceForced = meshNode('forced')
    const forced = {
      ...sourceForced,
      optimization: { mode: 'instance' },
    } satisfies ReturnType<typeof meshNode>
    const sourceAuto = meshNode('auto')
    const automatic = {
      ...sourceAuto,
      transform: { ...sourceAuto.transform, position: { x: 512, y: 0, z: 0 } },
    }
    const animation = {
      ...EMPTY_TIMELINE,
      tracks: [
        {
          id: 'move-forced',
          name: 'Move forced',
          index: 0,
          muted: false,
          solo: false,
          locked: false,
          target: { nodeId: forced.id, property: 'position' },
          keys: [],
        },
      ],
    } satisfies AnimationTimeline
    const source: SceneState = { ...stateOf(forced, automatic), animation }

    const runtime = createRuntimeWorldCompiler().compileRuntimeWorld(source)

    expect(runtime.runtimeOptimization.artifacts).toEqual(
      runtimeArtifactsOf(source.nodes, animation),
    )
    expect(runtime.runtimeOptimization.artifacts).toEqual([])
  })

  it('does not compile an invalidated node that the same patch removes', () => {
    const compiler = createRuntimeWorldCompiler()
    const source = stateOf(meshNode('removed'))
    compiler.compileRuntimeWorld(source)
    compiler.invalidateOptimization(['removed'])

    compiler.compileRuntimeRegion(runtimeWorldPatch(source, stateOf()))

    expect(compiler.getOptimizationReport()).toMatchObject({
      compiledNodes: 0,
      reusedNodes: 0,
      removedNodes: 1,
    })
  })

  it('falls back to a whole-world analysis when a hierarchy changes', () => {
    const compiler = createRuntimeWorldCompiler()
    const parent = meshNode('parent')
    const child = { ...meshNode('child'), parentId: parent.id }
    const peer = meshNode('peer')
    const before = stateOf(parent, child, peer)
    compiler.compileRuntimeWorld(before)
    const moved = {
      ...parent,
      transform: { ...parent.transform, position: { x: 512, y: 0, z: 0 } },
    }

    compiler.compileRuntimeRegion(runtimeWorldPatch(before, stateOf(moved, child, peer)))

    expect(compiler.getOptimizationReport().analyzedArtifactNodes).toBe(3)
  })

  it('leaves regional mode when a flat node becomes a child', () => {
    const compiler = createRuntimeWorldCompiler()
    const sourceParent = meshNode('parent')
    const parent = {
      ...sourceParent,
      transform: { ...sourceParent.transform, position: { x: 512, y: 0, z: 0 } },
    }
    const child = meshNode('child')
    const peer = meshNode('peer')
    const before = stateOf(parent, child, peer)
    compiler.compileRuntimeWorld(before)
    const nested = { ...child, parentId: parent.id }

    compiler.compileRuntimeRegion(runtimeWorldPatch(before, stateOf(parent, nested, peer)))

    expect(compiler.getOptimizationReport().analyzedArtifactNodes).toBe(3)
  })

  it('recompiles the destination region when a move creates a group there', () => {
    const compiler = createRuntimeWorldCompiler()
    const destination = Array.from({ length: 15 }, (_unused, index) => {
      const node = meshNode(`destination-${index}`)
      return {
        ...node,
        transform: { ...node.transform, position: { x: 512, y: 0, z: index } },
      }
    })
    const moving = meshNode('moving')
    const before = stateOf(moving, ...destination)
    compiler.compileRuntimeWorld(before)
    const moved = {
      ...moving,
      transform: { ...moving.transform, position: { x: 512, y: 0, z: 15 } },
    }

    const runtime = compiler.compileRuntimeRegion(
      runtimeWorldPatch(before, stateOf(moved, ...destination)),
    )

    expect(runtime?.runtimeOptimization.artifacts[0]?.sourceIds).toHaveLength(16)
    expect(runtime?.runtimeOptimization.artifacts).toEqual(
      runtimeArtifactsOf([moved, ...destination], EMPTY_TIMELINE),
    )
  })

  it('chooses a measured merge for a small cell and a batch for a larger compatible cell', () => {
    const compiler = createRuntimeWorldCompiler()
    const nodes = Array.from({ length: 11 }, (_unused, index) =>
      boxNode(
        `prop-${index}`,
        index + 1,
        index < 2 ? index : DEFAULT_OPTIMIZATION_POLICY.maxBatchBounds + index,
      ),
    )

    const runtime = compiler.compileRuntimeWorld(stateOf(...nodes))

    const merge = runtime.runtimeOptimization.artifacts.find(
      artifact => artifact.strategy === 'merge',
    )
    const batch = runtime.runtimeOptimization.artifacts.find(
      artifact => artifact.strategy === 'batch',
    )
    expect(merge?.sourceIds).toEqual(['prop-0', 'prop-1'])
    expect(batch?.sourceIds).toHaveLength(9)
  })

  it('keeps explicit individual and excluded nodes out of automatic artifacts', () => {
    const compiler = createRuntimeWorldCompiler()
    const individual: ReturnType<typeof meshNode>[] = Array.from(
      { length: 2 },
      (_unused, index) => ({
        ...boxNode(`individual-${index}`, index + 1, index),
        optimization: { mode: 'individual' },
      }),
    )
    const excluded: ReturnType<typeof meshNode>[] = Array.from({ length: 2 }, (_unused, index) => ({
      ...boxNode(`excluded-${index}`, index + 3, index),
      optimization: { mode: 'exclude' },
    }))

    const runtime = compiler.compileRuntimeWorld(stateOf(...individual, ...excluded))

    expect(runtime.runtimeOptimization.artifacts).toEqual([])
  })

  it('keeps compatible objects in distant spatial cells out of one batch', () => {
    const compiler = createRuntimeWorldCompiler()
    const first = meshNode('first')
    const second = boxNode('second', 2, DEFAULT_OPTIMIZATION_POLICY.maxBatchBounds * 2)

    const runtime = compiler.compileRuntimeWorld(stateOf(first, second))

    expect(runtime.runtimeOptimization.artifacts).toEqual([])
  })

  it('keeps a mesh wider than the culling bound out of automatic artifacts', () => {
    const compiler = createRuntimeWorldCompiler()
    const nodes: ReturnType<typeof meshNode>[] = ['first', 'second'].map((id, index) => ({
      ...boxNode(id, index + 1, index),
      geometry: { kind: 'box', width: 300, height: 1, depth: 1 },
    }))

    const runtime = compiler.compileRuntimeWorld(stateOf(...nodes))

    expect(runtime.runtimeOptimization.artifacts).toEqual([])
  })

  it('splits a dense compatible world into finer culling cells', () => {
    const nodes = Array.from({ length: 4_096 }, (_unused, index) =>
      boxNode(`dense-${index}`, 1 + index / 100_000, index % 64),
    ).map((node, index) => ({
      ...node,
      transform: {
        ...node.transform,
        position: { x: node.transform.position.x, y: 0, z: Math.floor(index / 64) },
      },
    }))

    const artifacts = runtimeArtifactsOf(nodes, EMPTY_TIMELINE)

    expect(artifacts).toHaveLength(4)
    expect(artifacts.every(artifact => artifact.sourceIds.length === 1_024)).toBe(true)
  })

  it('recompiles when a move crosses an adaptive boundary inside the legacy fixed cell', () => {
    const compiler = createRuntimeWorldCompiler()
    const nodes = Array.from({ length: 512 }, (_unused, index) =>
      boxNode(`prop-${index}`, 1 + index / 100_000, index % 32),
    ).map((node, index) => ({
      ...node,
      transform: {
        ...node.transform,
        position: { x: node.transform.position.x, y: 0, z: Math.floor(index / 32) },
      },
    }))
    const before = stateOf(...nodes)
    compiler.compileRuntimeWorld(before)
    const moved = {
      ...nodes[0]!,
      transform: { ...nodes[0]!.transform, position: { x: 40, y: 0, z: 0 } },
    }
    const after = stateOf(moved, ...nodes.slice(1))

    compiler.compileRuntimeRegion(runtimeWorldPatch(before, after))

    expect(compiler.getOptimizationReport().compiledArtifacts).toBeGreaterThan(0)
  })

  it('recompiles when scale makes a spatial member too large for its cell', () => {
    const compiler = createRuntimeWorldCompiler()
    const first = boxNode('first', 1, 0)
    const second = boxNode('second', 2, 1)
    const before = stateOf(first, second)
    compiler.compileRuntimeWorld(before)
    const scaled = {
      ...second,
      transform: { ...second.transform, scale: { x: 300, y: 300, z: 300 } },
    }

    const runtime = compiler.compileRuntimeRegion(runtimeWorldPatch(before, stateOf(first, scaled)))

    expect(runtime?.runtimeOptimization.artifacts).toEqual([])
    expect(compiler.getOptimizationReport().compiledArtifacts).toBe(0)
  })

  it('recompiles spatial artifacts when a node crosses a cell boundary', () => {
    const compiler = createRuntimeWorldCompiler()
    const first = meshNode('first')
    const second = boxNode('second', 2, 1)
    const before = stateOf(first, second)
    compiler.compileRuntimeWorld(before)
    const after = stateOf(
      first,
      boxNode('second', 2, DEFAULT_OPTIMIZATION_POLICY.spatialCellTargetSize * 2),
    )

    const runtime = compiler.compileRuntimeRegion(runtimeWorldPatch(before, after))

    expect(runtime?.runtimeOptimization.artifacts).toEqual([])
    expect(compiler.getOptimizationReport().compiledArtifacts).toBe(0)
  })

  it('keeps mesh parents individual so their document subtree remains reachable', () => {
    const compiler = createRuntimeWorldCompiler()
    const parent = meshNode('parent')
    const peer = boxNode('peer', 2, 1)
    const child = { ...meshNode('child'), parentId: parent.id }

    const runtime = compiler.compileRuntimeWorld(stateOf(parent, peer, child))

    expect(
      runtime.runtimeOptimization.artifacts.some(artifact =>
        artifact.sourceIds.includes(parent.id),
      ),
    ).toBe(false)
  })

  it('chunks artifact members deterministically before signing them', () => {
    const nodes = Array.from({ length: 5 }, (_unused, index) =>
      boxNode(`prop-${index}`, index + 1, 0),
    )
    const policy = { ...DEFAULT_OPTIMIZATION_POLICY, maxObjectsPerBatch: 2 }

    const forward = runtimeArtifactsOf(nodes, EMPTY_TIMELINE, policy)
    const reversed = runtimeArtifactsOf([...nodes].reverse(), EMPTY_TIMELINE, policy)

    expect(reversed).toEqual(forward)
  })

  it('separates indexed and non-indexed primitives before merge', () => {
    const boxes = [boxNode('box-a', 1, 0), boxNode('box-b', 2, 1)]
    const polyhedra: ReturnType<typeof meshNode>[] = ['poly-a', 'poly-b'].map(id => ({
      ...meshNode(id),
      geometry: { kind: 'icosahedron', radius: 1 },
    }))

    const artifacts = runtimeArtifactsOf([...boxes, ...polyhedra], EMPTY_TIMELINE)

    expect(artifacts).toHaveLength(2)
    expect(artifacts.every(artifact => artifact.strategy === 'merge')).toBe(true)
  })

  it('evicts deleted entities and preserves the requested order', () => {
    const compiler = createRuntimeWorldCompiler()
    const a = meshNode('a')
    const b = meshNode('b')
    const before = stateOf(a, b)
    compiler.compileRuntimeWorld(structuredClone(before))

    const next = compiler.compileRuntimeRegion(
      structuredClone(runtimeWorldPatch(before, stateOf({ ...b, name: 'B' }))),
    )

    expect(next?.nodes.map(node => node.id)).toEqual(['b'])
    expect(compiler.getOptimizationReport()).toMatchObject({ removedNodes: 1, cachedNodes: 1 })
  })

  it('keeps authoring-only session data out of the runtime world', () => {
    const compiler = createRuntimeWorldCompiler()
    const source: SceneState = {
      ...stateOf(meshNode('a')),
      selectedIds: ['a'],
      lockedAxes: [{ nodeId: 'a', channel: 'position', axis: 'x' }],
    }

    const runtime = compiler.compileRuntimeWorld(source)

    expect(runtime.selectedIds).toEqual([])
    expect(runtime.lockedAxes).toBeUndefined()
  })

  it('clears its disposable cache', () => {
    const compiler = createRuntimeWorldCompiler()
    const source = stateOf(meshNode('a'))
    compiler.compileRuntimeWorld(source)
    compiler.clearOptimizationCache()

    expect(
      compiler.compileRuntimeRegion(runtimeWorldPatch(source, structuredClone(source))),
    ).toBeNull()
    expect(compiler.getOptimizationReport()).toEqual({
      compiledNodes: 0,
      reusedNodes: 0,
      removedNodes: 0,
      cachedNodes: 0,
      compilationMs: 0,
      compiledArtifacts: 0,
      reusedArtifacts: 0,
      analyzedArtifactNodes: 0,
    })
  })
})
