import {
  BoxGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  Vector3,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { meshNode } from './scene-fixtures'
import type { SceneState } from './sceneState'
import { createOptimizedGroups } from './optimizedGrouping'
import { runtimeOptimizationOf, type RuntimeWorld } from './runtimeWorldCompiler'
import type { SafeRuntimeSnapshot } from './safeRuntimeValidation'
import {
  validateRuntimeRepresentation,
  type RuntimeRenderCamera,
  type RuntimeValidationDriver,
} from './runtimeRepresentationValidation'

const FRAME = { width: 1, height: 1, pixels: new Uint8Array([20, 40, 60, 255]) }
const CAMERAS: readonly RuntimeRenderCamera[] = [
  camera('front', 0, 10, 20),
  camera('back', 0, 10, -20),
  camera('side', 20, 10, 0),
]

type Representation = ReturnType<typeof representationOf>

function camera(id: string, x: number, y: number, z: number): RuntimeRenderCamera {
  return {
    id,
    position: { x, y, z },
    target: { x: 0, y: 0, z: 0 },
    projection: 'perspective',
    fieldOfView: 50,
    near: 0.1,
    far: 100,
    width: 64,
    height: 64,
    cameraMask: 1,
  }
}

function state(): SceneState {
  const nodes = Array.from({ length: 20 }, (_unused, index): ReturnType<typeof meshNode> => {
    const node = meshNode(`tree-${index}`)
    return {
      ...node,
      optimization: { mode: 'instance' },
      transform: { ...node.transform, position: { x: index * 2, y: 0, z: 0 } },
    }
  })
  return { nodes, selectedIds: [], world: DEFAULT_WORLD, animation: EMPTY_TIMELINE }
}

function representationOf(world: SceneState | RuntimeWorld, optimized: boolean) {
  const host = new Object3D()
  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial()
  const objects = new Map(
    world.nodes.map(node => {
      const mesh = new Mesh(geometry, material)
      mesh.name = node.id
      mesh.position.set(
        node.transform.position.x,
        node.transform.position.y,
        node.transform.position.z,
      )
      host.add(mesh)
      return [node.id, mesh]
    }),
  )
  host.updateMatrixWorld(true)
  const groups = optimized ? createOptimizedGroups(host) : null
  groups?.rebuild(
    world.nodes,
    id => objects.get(id),
    new Set(),
    runtimeOptimizationOf(world)?.artifacts,
  )
  host.updateMatrixWorld(true)
  return { host, geometry, material, objects, groups, world }
}

function snapshot(representation: Representation): SafeRuntimeSnapshot {
  representation.host.updateMatrixWorld(true)
  const ray = new Raycaster()
  const picks = [...representation.objects].map(([id, mesh]) => {
    ray.set(new Vector3(mesh.position.x, 10, 0), new Vector3(0, -1, 0))
    const targets = representation.groups?.pickable() ?? [...representation.objects.values()]
    const hit = ray.intersectObjects([...targets], false)[0]
    const resolved = hit ? (representation.groups?.nodeIdOf(hit) ?? sourceIdOf(hit.object)) : null
    return { expected: id, resolved }
  })
  const nodes = representation.world.nodes
  return {
    picking: picks,
    animation: representation.world.animation.tracks,
    timeline: representation.world.animation,
    scripts: componentsOf(nodes, 'Script'),
    physics: componentsOf(nodes, 'RigidBody'),
    shadows: [...representation.objects].map(([id, mesh]) => ({
      id,
      cast: mesh.castShadow,
      receive: mesh.receiveShadow,
    })),
    cameras: nodes.flatMap(node => (node.type === 'camera' ? [node.camera] : [])),
    visibility: [...representation.objects].map(([id, mesh]) => ({ id, visible: mesh.visible })),
    postProcessing: representation.world.world.post,
    transforms: [...representation.objects].map(([id, mesh]) => ({
      id,
      matrix: mesh.matrixWorld.toArray(),
    })),
    duplication: nodes.map(node => node.id),
    undoRedo: nodes.map(node => ({ id: node.id, parentId: node.parentId })),
  }
}

function componentsOf(nodes: SceneState['nodes'], type: string): unknown {
  return nodes.flatMap(node =>
    (node.components ?? []).flatMap(component => (component.type === type ? [component] : [])),
  )
}

function sourceIdOf(object: Object3D): string | null {
  return object.name || null
}

function driver(
  render: RuntimeValidationDriver<Representation>['render'] = async () => FRAME,
): RuntimeValidationDriver<Representation> {
  return {
    buildOriginal: async world => representationOf(world, false),
    buildOptimized: async world => representationOf(world, true),
    render,
    observe: async representation => snapshot(representation),
    dispose: representation => {
      representation.groups?.dispose()
      representation.geometry.dispose()
      representation.material.dispose()
    },
  }
}

describe('runtime representation validation driver', () => {
  it('passes three full camera descriptors and observes a real InstancedMesh', async () => {
    const rendered: string[] = []
    const report = await validateRuntimeRepresentation(state(), {
      cameras: CAMERAS,
      visualOptions: { channelTolerance: 0, maximumChangedPixelRatio: 0 },
      driver: driver(async (representation, currentCamera) => {
        rendered.push(`${currentCamera.id}:${representation.groups ? 'optimized' : 'original'}`)
        expect(currentCamera.width).toBe(64)
        if (representation.groups) {
          expect(representation.groups.drawn()[0]).toBeInstanceOf(InstancedMesh)
        }
        return FRAME
      }),
    })

    expect(rendered).toEqual([
      'front:original',
      'front:optimized',
      'back:original',
      'back:optimized',
      'side:original',
      'side:optimized',
    ])
    expect(report.equivalent).toBe(true)
    expect(report.functional.find(result => result.check === 'picking')?.equivalent).toBe(true)
  })

  it('reports pixels and runtime observations supplied by the driver', async () => {
    let calls = 0
    const report = await validateRuntimeRepresentation(state(), {
      cameras: CAMERAS,
      visualOptions: { channelTolerance: 0, maximumChangedPixelRatio: 0 },
      driver: driver(async () => {
        calls += 1
        return calls % 2 === 0 ? { ...FRAME, pixels: new Uint8Array([21, 40, 60, 255]) } : FRAME
      }),
    })

    expect(report.equivalent).toBe(false)
    expect(report.visual.every(result => !result.equivalent)).toBe(true)
  })

  it('refuses duplicate camera IDs before allocating a runtime', async () => {
    const buildOriginal = vi.fn(async world => representationOf(world, false))
    await expect(
      validateRuntimeRepresentation(state(), {
        cameras: [CAMERAS[0]!, CAMERAS[0]!],
        visualOptions: { channelTolerance: 0, maximumChangedPixelRatio: 0 },
        driver: { ...driver(), buildOriginal },
      }),
    ).rejects.toThrow('camera IDs must be unique')
    expect(buildOriginal).not.toHaveBeenCalled()
  })

  it('disposes the original representation when optimized construction fails', async () => {
    const dispose = vi.fn()
    await expect(
      validateRuntimeRepresentation(state(), {
        cameras: CAMERAS,
        visualOptions: { channelTolerance: 0, maximumChangedPixelRatio: 0 },
        driver: {
          ...driver(),
          buildOptimized: async () => {
            throw new Error('build failed')
          },
          dispose,
        },
      }),
    ).rejects.toThrow('build failed')
    expect(dispose).toHaveBeenCalledOnce()
  })
})
