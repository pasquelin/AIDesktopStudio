import { clamp } from '@shared/numeric'
import type { GeometryDescriptor } from '@shared/domain/geometry'
import type { OptimizationPolicy } from '@shared/domain/optimizationPolicy'
import type { SceneNode } from './sceneState'

type MeshNode = Extract<SceneNode, { type: 'mesh' }>

export type AdaptiveCell = {
  size: number
  x: number
  y: number
  z: number
}

export type AdaptiveCellGroup = {
  cell: AdaptiveCell
  nodes: MeshNode[]
}

export type WorldPoint = { x: number; y: number; z: number }

/**
 * One spelling of a cell, for everyone. The analyzer's non-mesh fallback has to land in the cell
 * `adaptiveCellsOf` produced for the same place, and nothing would go red if the two drifted.
 */
export function cellKeyOf(cell: AdaptiveCell): string {
  return `${cell.size}:${cell.x}:${cell.y}:${cell.z}`
}

/** The same node stood at its world placement — what both the analyzer and the compiler partition. */
export function nodeAtWorld<N extends SceneNode>(
  node: N,
  position: WorldPoint,
  scale: WorldPoint,
): N {
  return {
    ...node,
    transform: {
      ...node.transform,
      position: { x: position.x, y: position.y, z: position.z },
      scale: { x: scale.x, y: scale.y, z: scale.z },
    },
  }
}

export function adaptiveCellsOf(
  nodes: readonly MeshNode[],
  policy: OptimizationPolicy,
): readonly AdaptiveCellGroup[] {
  const roots = new Map<string, MeshNode[]>()
  for (const node of nodes) {
    const key = adaptiveRootCellKeyOf(node, policy)
    if (!key) continue
    const members = roots.get(key)
    if (members) members.push(node)
    else roots.set(key, [node])
  }
  const cells = new Map<string, AdaptiveCellGroup>()
  for (const members of roots.values()) {
    const size = adaptiveCellSize(members, policy)
    for (const node of members) {
      const cell = adaptiveCellOf(node, size, policy)
      if (!cell) continue
      const key = cellKeyOf(cell)
      const group = cells.get(key)
      if (group) group.nodes.push(node)
      else cells.set(key, { cell, nodes: [node] })
    }
  }
  return [...cells.values()]
}

export function adaptiveRootCellKeyOf(node: MeshNode, policy: OptimizationPolicy): string | null {
  const rootSize = maximumCellSize(policy)
  if (spatialDiameterOf(node) > rootSize) return null
  const position = node.transform.position
  return `${Math.floor(position.x / rootSize)}:${Math.floor(position.y / rootSize)}:${Math.floor(position.z / rootSize)}`
}

export function adaptiveCellOf(
  node: MeshNode,
  size: number,
  policy: OptimizationPolicy,
): AdaptiveCell | null {
  const diameter = spatialDiameterOf(node)
  if (diameter > size || size * 4 > Math.max(1, policy.maxBatchBounds)) return null
  const position = node.transform.position
  return {
    size,
    x: Math.floor(position.x / size),
    y: Math.floor(position.y / size),
    z: Math.floor(position.z / size),
  }
}

export function adaptiveCellSize(nodes: readonly MeshNode[], policy: OptimizationPolicy): number {
  if (nodes.length === 0) {
    return maximumCellSize(policy)
  }
  let lowX = Infinity
  let lowZ = Infinity
  let highX = -Infinity
  let highZ = -Infinity
  let cost = 0
  let largest = 0
  for (const node of nodes) {
    const radius = spatialDiameterOf(node) / 2
    const position = node.transform.position
    lowX = Math.min(lowX, position.x - radius)
    lowZ = Math.min(lowZ, position.z - radius)
    highX = Math.max(highX, position.x + radius)
    highZ = Math.max(highZ, position.z + radius)
    largest = Math.max(largest, radius * 2)
    cost += geometryCostOf(node.geometry)
  }
  const maxSize = maximumCellSize(policy)
  const minSize = Math.max(1, Math.min(policy.spatialCellMinSize, maxSize))
  const area = Math.max(minSize * minSize, (highX - lowX) * (highZ - lowZ))
  const desired = Math.sqrt((Math.max(1, policy.spatialCellTargetObjects) * area) / cost)
  const lowerBound = Math.max(minSize, largest)
  let size = maxSize
  while (size / 2 >= clamp(desired, lowerBound, maxSize)) size /= 2
  return size
}

export function maximumCellSize(policy: OptimizationPolicy): number {
  return Math.max(1, Math.min(policy.maxBatchBounds / 4, policy.spatialCellTargetSize))
}

export function spatialDiameterOf(node: MeshNode): number {
  const scale = node.transform.scale
  return (
    geometryDiameterOf(node.geometry) *
    Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z))
  )
}

function geometryDiameterOf(geometry: GeometryDescriptor): number {
  if (geometry.kind === 'ribbon') return ribbonDiameterOf(geometry)
  return primitiveGeometryDiameterOf(geometry)
}

function primitiveGeometryDiameterOf(
  geometry: Exclude<GeometryDescriptor, { kind: 'ribbon' }>,
): number {
  switch (geometry.kind) {
    case 'box':
      return Math.hypot(geometry.width, geometry.height, geometry.depth)
    case 'capsule':
      return geometry.height + geometry.radius * 2
    case 'circle':
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
    case 'sphere':
    case 'tetrahedron':
      return geometry.radius * 2
    case 'cylinder':
      return Math.hypot(Math.max(geometry.radiusTop, geometry.radiusBottom) * 2, geometry.height)
    case 'plane':
      return Math.hypot(geometry.width, geometry.height)
    case 'ring':
      return geometry.outerRadius * 2
    case 'torus':
    case 'torusKnot':
    case 'tube':
    case 'lathe':
      return curvedGeometryDiameterOf(geometry)
  }
}

function curvedGeometryDiameterOf(
  geometry: Extract<GeometryDescriptor, { kind: 'torus' | 'torusKnot' | 'tube' | 'lathe' }>,
): number {
  if (geometry.kind === 'lathe') return 4
  if (geometry.kind === 'tube') return (1 + geometry.radius) * 2
  return (geometry.radius + geometry.tube) * 2
}

function ribbonDiameterOf(geometry: Extract<GeometryDescriptor, { kind: 'ribbon' }>): number {
  if (geometry.path.points.length === 0) return Math.hypot(geometry.width, geometry.height)
  const low = { x: Infinity, y: Infinity, z: Infinity }
  const high = { x: -Infinity, y: -Infinity, z: -Infinity }
  const include = (x: number, y: number, z: number): void => {
    low.x = Math.min(low.x, x)
    low.y = Math.min(low.y, y)
    low.z = Math.min(low.z, z)
    high.x = Math.max(high.x, x)
    high.y = Math.max(high.y, y)
    high.z = Math.max(high.z, z)
  }
  for (const [index, point] of geometry.path.points.entries()) {
    include(point.x, point.y, point.z)
    const handles = geometry.path.kind === 'bezier' ? geometry.path.handles[index] : undefined
    if (!handles) continue
    include(point.x + handles.in.x, point.y + handles.in.y, point.z + handles.in.z)
    include(point.x + handles.out.x, point.y + handles.out.y, point.z + handles.out.z)
  }
  return Math.hypot(
    high.x - low.x + geometry.width,
    high.y - low.y + geometry.height,
    high.z - low.z + geometry.width,
  )
}

function geometryCostOf(geometry: GeometryDescriptor): number {
  switch (geometry.kind) {
    case 'sphere':
      return Math.max(1, (geometry.widthSegments * geometry.heightSegments) / 12)
    case 'torus':
    case 'torusKnot':
    case 'tube':
      return Math.max(1, (geometry.radialSegments * geometry.tubularSegments) / 12)
    case 'capsule':
      return Math.max(1, (geometry.capSegments * geometry.radialSegments) / 12)
    case 'cylinder':
    case 'circle':
    case 'ring':
    case 'lathe':
    case 'ribbon':
      return Math.max(1, geometry.segments / 12)
    default:
      return 1
  }
}
