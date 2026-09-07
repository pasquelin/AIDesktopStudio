import { isCsgGraph, type CsgGraph, type CsgPart } from '@shared/domain/csg'
import type { GeometryDescriptor } from '@shared/domain/geometry'
import type {
  CompiledMeshGeometry,
  CompiledNodeGeometry,
  CompiledSceneOptimization,
  LossyOptimization,
} from '@shared/domain/gameExport'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import type { BufferGeometry } from 'three'
import type { SceneNode, SceneState } from './sceneState'
import { compiledMeshOf } from './compiledGeometry'
import type { LossyWorldPlan } from './worldAnalyzer'

/** Compiles only runtime hints; the authoring state is neither mutated nor embedded in the plan. */
export function compileLossyWorld(
  state: Pick<SceneState, 'nodes'>,
  options: LossyOptimization,
  plan: LossyWorldPlan,
): CompiledSceneOptimization | undefined {
  if (!options.generateLods && options.geometrySimplification === 'off') return undefined

  const ratio = DEFAULT_OPTIMIZATION_POLICY.simplificationRatios[options.geometrySimplification]
  const candidates = new Set(plan.nodeIds)
  const nodes = state.nodes.flatMap(node =>
    candidates.has(node.id) ? compiledNode(node, options.generateLods, ratio) : [],
  )
  return nodes.length > 0 ? { nodes } : undefined
}

export type CarvedGeometryCompiler = (graph: CsgGraph) => Promise<BufferGeometry | null>

/** Evaluates requested CSG levels before packaging so the exported runtime only uploads them. */
export async function compileLossyWorldGeometry(
  state: Pick<SceneState, 'nodes'>,
  options: LossyOptimization,
  carve: CarvedGeometryCompiler,
  plan: LossyWorldPlan,
): Promise<CompiledSceneOptimization | undefined> {
  const compiled = compileLossyWorld(state, options, plan)
  if (!compiled) return undefined

  const nodes = await Promise.all(
    compiled.nodes.map(async node => {
      if (node.lodCarved) {
        const meshes = await compileGraphs(node.lodCarved, carve)
        return meshes ? { nodeId: node.nodeId, lodMeshes: meshes } : node
      }
      if (node.carved) {
        const geometry = await carve(node.carved)
        return geometry ? { nodeId: node.nodeId, mesh: compiledMeshOf(geometry) } : node
      }
      return node
    }),
  )
  return { nodes }
}

async function compileGraphs(
  graphs: readonly CsgGraph[],
  carve: CarvedGeometryCompiler,
): Promise<readonly CompiledMeshGeometry[] | null> {
  const meshes: CompiledMeshGeometry[] = []
  for (const graph of graphs) {
    const geometry = await carve(graph)
    if (!geometry) return null
    meshes.push(compiledMeshOf(geometry))
  }
  return meshes
}

function compiledNode(
  node: SceneNode,
  generateLods: boolean,
  ratio: number,
): readonly CompiledNodeGeometry[] {
  if (node.type === 'mesh') {
    if (generateLods) {
      return [
        {
          nodeId: node.id,
          lodGeometries: [
            node.geometry,
            ...DEFAULT_OPTIMIZATION_POLICY.lodSimplificationRatios.map(level =>
              reducedGeometry(node.geometry, Math.max(level, ratio)),
            ),
          ],
        },
      ]
    }
    return [{ nodeId: node.id, geometry: reducedGeometry(node.geometry, ratio) }]
  }
  if (node.type === 'carved') {
    if (generateLods) {
      return [
        {
          nodeId: node.id,
          lodCarved: [
            node.carved,
            ...DEFAULT_OPTIMIZATION_POLICY.lodSimplificationRatios.map(level =>
              reducedGraph(node.carved, Math.max(level, ratio)),
            ),
          ],
        },
      ]
    }
    return [{ nodeId: node.id, carved: reducedGraph(node.carved, ratio) }]
  }
  return []
}

function reducedGraph(graph: CsgGraph, ratio: number): CsgGraph {
  return {
    ...graph,
    base: reducedPart(graph.base, ratio),
    steps: graph.steps.map(step => ({ ...step, part: reducedPart(step.part, ratio) })),
  }
}

function reducedPart(part: CsgPart, ratio: number): CsgPart {
  return {
    ...part,
    geometry: isCsgGraph(part.geometry)
      ? reducedGraph(part.geometry, ratio)
      : reducedGeometry(part.geometry, ratio),
  }
}

function reducedGeometry(geometry: GeometryDescriptor, ratio: number): GeometryDescriptor {
  const segments = (value: number, minimum: number): number =>
    Math.max(minimum, Math.round(value * (1 - ratio)))

  switch (geometry.kind) {
    case 'ribbon':
      return { ...geometry, segments: segments(geometry.segments, 1) }
    case 'capsule':
      return {
        ...geometry,
        capSegments: segments(geometry.capSegments, 1),
        radialSegments: segments(geometry.radialSegments, 3),
      }
    case 'circle':
    case 'cylinder':
    case 'lathe':
    case 'ring':
      return { ...geometry, segments: segments(geometry.segments, 3) }
    case 'sphere':
      return {
        ...geometry,
        widthSegments: segments(geometry.widthSegments, 3),
        heightSegments: segments(geometry.heightSegments, 2),
      }
    case 'torus':
    case 'torusKnot':
    case 'tube':
      return {
        ...geometry,
        radialSegments: segments(geometry.radialSegments, 3),
        tubularSegments: segments(geometry.tubularSegments, 3),
      }
    case 'box':
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
    case 'plane':
    case 'tetrahedron':
      return geometry
  }
}
