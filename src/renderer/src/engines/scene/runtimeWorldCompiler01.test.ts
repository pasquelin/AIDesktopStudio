import { describe, expect, it } from 'vitest'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import { meshNode } from './scene-fixtures'
import {
  createRuntimeWorldCompiler,
  runtimeArtifactsOf,
  runtimeOptimizationOf,
  runtimeWorldPatch,
  runtimeWorldPatchIsEmpty,
  worldWithRuntimePatch,
} from './runtimeWorldCompiler'
import type { SceneNode, SceneState } from './sceneState'
import { sceneRuntimeSnapshot } from './sceneRuntimeSnapshot'
import {
  validateRuntimeRepresentation,
  type RuntimeRenderCamera,
  type RuntimeValidationDriver,
} from './runtimeRepresentationValidation'
import type { SafeRuntimeSnapshot } from './safeRuntimeValidation'

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

describe('runtimeWorldPatch', () => {
  it('applies a transported delta to the authoring world without using runtime state', () => {
    const a = meshNode('a')
    const b = meshNode('b')
    const before = stateOf(a, b)
    const after = stateOf({ ...b, visible: false }, meshNode('c'))

    expect(worldWithRuntimePatch(before, runtimeWorldPatch(before, after))).toEqual(after)
  })

  it('contains only changed authoring sections', () => {
    const a = meshNode('a')
    const b = meshNode('b')
    const before = stateOf(a, b)
    const changed = { ...b, visible: false }

    const patch = runtimeWorldPatch(before, stateOf(a, changed))

    expect(patch).toMatchObject({
      changedNodes: [changed],
      removedIds: [],
      order: null,
      world: null,
      animation: null,
    })
  })

  it('does not publish selection-only authoring changes', () => {
    const before = stateOf(meshNode('a'))
    const patch = runtimeWorldPatch(before, { ...before, selectedIds: ['a'] })

    expect(runtimeWorldPatchIsEmpty(patch)).toBe(true)
  })
})

const MAIN_CAMERA: RuntimeRenderCamera = {
  id: 'main',
  position: { x: 0, y: 0, z: 10 },
  target: { x: 0, y: 0, z: 0 },
  projection: 'perspective',
  fieldOfView: 50,
  near: 0.1,
  far: 100,
  width: 1,
  height: 1,
  cameraMask: 1,
}

/** The world itself as its own representation: what the driver hands back is what was compiled. */
type Held = { role: 'original' | 'optimized'; world: SceneState }

function identityDriver(
  render: RuntimeValidationDriver<Held>['render'],
  observe: (held: Held) => SafeRuntimeSnapshot,
): RuntimeValidationDriver<Held> {
  return {
    buildOriginal: async world => ({ role: 'original', world }),
    buildOptimized: async world => ({ role: 'optimized', world }),
    render,
    observe: async held => observe(held),
    dispose: () => {},
  }
}

describe('createRuntimeWorldCompiler', () => {
  it('hands the validation path an optimized world carrying the compiled artifacts', async () => {
    const source = stateOf({ ...meshNode('a'), optimization: { mode: 'instance' } })
    const pixels = new Uint8Array([10, 20, 30, 255])
    const rendered: string[] = []

    const report = await validateRuntimeRepresentation(source, {
      cameras: [MAIN_CAMERA],
      visualOptions: { channelTolerance: 0, maximumChangedPixelRatio: 0 },
      driver: identityDriver(
        async (held, camera) => {
          rendered.push(`${held.role}:${camera.id}`)
          if (held.role === 'original') {
            expect(held.world).toBe(source)
            expect(runtimeOptimizationOf(held.world)).toBeNull()
          } else {
            expect(runtimeOptimizationOf(held.world)?.artifacts).toHaveLength(1)
          }
          return { width: 1, height: 1, pixels: pixels.slice() }
        },
        held => sceneRuntimeSnapshot(held.world),
      ),
    })

    expect(rendered).toEqual(['original:main', 'optimized:main'])
    expect(report.equivalent).toBe(true)
    expect(report.functional.every(result => result.equivalent)).toBe(true)
  })

  it('reports a functional difference observed on the compiled world', async () => {
    const report = await validateRuntimeRepresentation(stateOf(meshNode('a')), {
      cameras: [MAIN_CAMERA],
      visualOptions: { channelTolerance: 0, maximumChangedPixelRatio: 0 },
      driver: identityDriver(
        async () => ({ width: 1, height: 1, pixels: new Uint8Array(4) }),
        held =>
          held.role === 'optimized'
            ? { ...sceneRuntimeSnapshot(held.world), picking: [] }
            : sceneRuntimeSnapshot(held.world),
      ),
    })

    expect(report.equivalent).toBe(false)
    expect(report.functional.find(result => result.check === 'picking')?.equivalent).toBe(false)
  })

  it('drops removed nodes from a patch that carries no order', () => {
    const compiler = createRuntimeWorldCompiler()
    compiler.compileRuntimeWorld(stateOf(meshNode('a'), meshNode('b')))

    const next = compiler.compileRuntimeRegion({
      changedNodes: [],
      removedIds: ['a'],
      order: null,
      world: null,
      animation: null,
    })

    expect(next?.nodes.map(node => node.id)).toEqual(['b'])
  })

  it('reuses unchanged runtime nodes and recompiles only a transported delta', () => {
    const compiler = createRuntimeWorldCompiler()
    const a = meshNode('a')
    const b = meshNode('b')
    const authoring = stateOf(a, b)
    const compiled = compiler.compileRuntimeWorld(structuredClone(authoring))
    const nextAuthoring = stateOf(a, { ...b, visible: false })

    const next = compiler.compileRuntimeRegion(
      structuredClone(runtimeWorldPatch(authoring, nextAuthoring)),
    )
    if (!next) throw new Error('runtime was not compiled')

    expect(next.nodes[0]).toBe(compiled.nodes[0])
    expect(next.nodes[1]).not.toBe(compiled.nodes[1])
    expect(compiler.getOptimizationReport()).toMatchObject({
      compiledNodes: 1,
      reusedNodes: 1,
      removedNodes: 0,
      cachedNodes: 2,
    })
  })

  it('compiles repeated authoring nodes into a deterministic runtime instance artifact', () => {
    const compiler = createRuntimeWorldCompiler()
    const source = stateOf(
      ...Array.from({ length: 16 }, (_unused, index) => meshNode(`tree-${index}`)),
    )

    const runtime = compiler.compileRuntimeWorld(source)

    expect(runtime).not.toBe(source)
    expect(runtime.runtimeOptimization.artifacts).toHaveLength(1)
    expect(runtime.runtimeOptimization.artifacts[0]).toMatchObject({
      strategy: 'instance',
      sourceIds: source.nodes.map(node => node.id).sort(),
    })
    expect(compiler.getOptimizationReport()).toMatchObject({
      compiledArtifacts: 1,
      reusedArtifacts: 0,
    })
  })

  it('reuses unaffected runtime artifacts after a local transform change', () => {
    const compiler = createRuntimeWorldCompiler()
    const nodes = Array.from({ length: 32 }, (_unused, index) => {
      const node = meshNode(`mesh-${index}`)
      return index < 16 ? node : { ...node, material: { ...node.material, roughness: 0.25 } }
    })
    const before = stateOf(...nodes)
    const first = nodes[0]
    if (!first) throw new Error('missing fixture')
    const runtime = compiler.compileRuntimeWorld(before)
    const changed = {
      ...first,
      transform: {
        ...first.transform,
        position: { ...first.transform.position, x: 3 },
      },
    }
    const after = stateOf(changed, ...nodes.slice(1))

    const next = compiler.compileRuntimeRegion(runtimeWorldPatch(before, after))

    expect(next?.runtimeOptimization.artifacts).toEqual(runtime.runtimeOptimization.artifacts)
    expect(next?.runtimeOptimization.artifacts[0]).toBe(runtime.runtimeOptimization.artifacts[0])
    expect(compiler.getOptimizationReport()).toMatchObject({
      compiledNodes: 1,
      compiledArtifacts: 0,
      reusedArtifacts: 2,
    })
  })

  it('does not trust an unchanged UUID after its render data changes', () => {
    const compiler = createRuntimeWorldCompiler()
    const source = meshNode('same')
    const before = stateOf(source)
    const compiled = compiler.compileRuntimeWorld(structuredClone(before))
    const next = stateOf({ ...source, castShadow: !source.castShadow })

    const changed = compiler.compileRuntimeRegion(structuredClone(runtimeWorldPatch(before, next)))

    expect(changed?.nodes[0]).not.toBe(compiled.nodes[0])
  })

  it('reuses a changed reference whose complete signature is equal', () => {
    const compiler = createRuntimeWorldCompiler()
    const source = stateOf(meshNode('same'))
    const compiled = compiler.compileRuntimeWorld(structuredClone(source))
    const equal = structuredClone(source)

    const next = compiler.compileRuntimeRegion(structuredClone(runtimeWorldPatch(source, equal)))

    expect(next?.nodes[0]).toBe(compiled.nodes[0])
    expect(compiler.getOptimizationReport()).toMatchObject({ compiledNodes: 0, reusedNodes: 1 })
  })

  it('invalidates a selected entity even when its signature is equal', () => {
    const compiler = createRuntimeWorldCompiler()
    const forced: ReturnType<typeof meshNode> = {
      ...meshNode('a'),
      optimization: { mode: 'instance' },
    }
    const source = stateOf(forced)
    const compiled = compiler.compileRuntimeWorld(structuredClone(source))
    compiler.invalidateOptimization(['a'])

    const next = compiler.compileRuntimeRegion(runtimeWorldPatch(source, source))

    expect(next?.nodes[0]).not.toBe(compiled.nodes[0])
    expect(next?.runtimeOptimization.artifacts[0]).not.toBe(
      compiled.runtimeOptimization.artifacts[0],
    )
  })

  it('preserves forced instance and batch representations below automatic thresholds', () => {
    const compiler = createRuntimeWorldCompiler()
    const instance: ReturnType<typeof meshNode> = {
      ...meshNode('instance'),
      optimization: { mode: 'instance' },
    }
    const batch: ReturnType<typeof meshNode> = {
      ...meshNode('batch'),
      optimization: { mode: 'batch' },
    }

    const runtime = compiler.compileRuntimeWorld(stateOf(instance, batch))

    expect(runtime.runtimeOptimization.artifacts.map(artifact => artifact.strategy).sort()).toEqual(
      ['batch', 'instance'],
    )
  })

  it('keeps forced batches spatial instead of creating one world-sized draw unit', () => {
    const first = {
      ...boxNode('first', 1, 0),
      optimization: { mode: 'batch' },
    } satisfies ReturnType<typeof meshNode>
    const second = {
      ...boxNode('second', 2, DEFAULT_OPTIMIZATION_POLICY.maxBatchBounds * 2),
      optimization: { mode: 'batch' },
    } satisfies ReturnType<typeof meshNode>

    const artifacts = runtimeArtifactsOf([first, second], EMPTY_TIMELINE)

    expect(artifacts).toHaveLength(2)
    expect(artifacts.every(artifact => artifact.sourceIds.length === 1)).toBe(true)
  })

  it('partitions repeated instances into stable spatial artifacts', () => {
    const nodes = Array.from({ length: 32 }, (_unused, index) => {
      const node = meshNode(`tree-${index}`)
      return {
        ...node,
        transform: {
          ...node.transform,
          position: { x: index < 16 ? index : 512 + index, y: 0, z: 0 },
        },
      }
    })

    const artifacts = runtimeArtifactsOf(nodes, EMPTY_TIMELINE)

    expect(artifacts).toHaveLength(2)
    expect(artifacts.every(artifact => artifact.strategy === 'instance')).toBe(true)
    expect(artifacts.every(artifact => artifact.sourceIds.length === 16)).toBe(true)
  })

  it('refuses automatic instance cells below their local benefit threshold', () => {
    const nodes = Array.from({ length: 16 }, (_unused, index) => {
      const node = meshNode(`tree-${index}`)
      return {
        ...node,
        transform: {
          ...node.transform,
          position: { x: index * DEFAULT_OPTIMIZATION_POLICY.maxBatchBounds, y: 0, z: 0 },
        },
      }
    })

    expect(runtimeArtifactsOf(nodes, EMPTY_TIMELINE)).toEqual([])
  })

  it('partitions children from their resolved world transforms', () => {
    const parent = (id: string, x: number): SceneNode => {
      const transform = meshNode(id).transform
      return {
        id,
        parentId: null,
        name: id,
        visible: true,
        castShadow: false,
        receiveShadow: false,
        type: 'group',
        transform: { ...transform, position: { x, y: 0, z: 0 } },
      }
    }
    const children = Array.from({ length: 32 }, (_unused, index) => ({
      ...meshNode(`child-${index}`),
      parentId: index < 16 ? 'near' : 'far',
    }))

    const artifacts = runtimeArtifactsOf(
      [parent('near', 0), parent('far', 512), ...children],
      EMPTY_TIMELINE,
    )

    expect(artifacts).toHaveLength(2)
    expect(artifacts.every(artifact => artifact.sourceIds.length === 16)).toBe(true)
  })

  it('reuses instance artifacts outside the edited root cell', () => {
    const compiler = createRuntimeWorldCompiler()
    const nodes = Array.from({ length: 32 }, (_unused, index) => {
      const node = meshNode(`tree-${index}`)
      return {
        ...node,
        transform: {
          ...node.transform,
          position: { x: index < 16 ? index : 512 + index, y: 0, z: 0 },
        },
      }
    })
    const before = stateOf(...nodes)
    compiler.compileRuntimeWorld(before)
    const first = nodes[0]!
    const moved = {
      ...first,
      transform: { ...first.transform, position: { x: 70, y: 0, z: 0 } },
    }

    compiler.compileRuntimeRegion(runtimeWorldPatch(before, stateOf(moved, ...nodes.slice(1))))

    expect(compiler.getOptimizationReport().compiledArtifacts).toBe(1)
    expect(compiler.getOptimizationReport().reusedArtifacts).toBe(1)
  })

  it('analyzes only the affected spatial region after a local visibility change', () => {
    const compiler = createRuntimeWorldCompiler()
    const nodes = Array.from({ length: 48 }, (_unused, index) => {
      const node = meshNode(`tree-${index}`)
      return {
        ...node,
        transform: {
          ...node.transform,
          position: { x: Math.floor(index / 16) * 512, y: 0, z: index % 16 },
        },
      }
    })
    const before = stateOf(...nodes)
    compiler.compileRuntimeWorld(before)
    const last = nodes[47]
    if (!last) throw new Error('missing fixture')
    const after = stateOf(...nodes.slice(0, -1), { ...last, visible: false })

    compiler.compileRuntimeRegion(runtimeWorldPatch(before, after))

    expect(compiler.getOptimizationReport()).toMatchObject({
      compiledNodes: 1,
      analyzedArtifactNodes: 15,
      reusedArtifacts: 2,
    })
  })

  it('produces the same artifacts as a whole-world analysis for flat spatial scenes', () => {
    const nodes = Array.from({ length: 64 }, (_unused, index) => {
      const node = boxNode(`prop-${index}`, 1 + (index % 3), Math.floor(index / 16) * 512)
      return index >= 48
        ? ({ ...node, optimization: { mode: 'batch' } } satisfies ReturnType<typeof meshNode>)
        : node
    })

    const runtime = createRuntimeWorldCompiler().compileRuntimeWorld(stateOf(...nodes))

    expect(runtime.runtimeOptimization.artifacts).toEqual(runtimeArtifactsOf(nodes, EMPTY_TIMELINE))
  })
})
