import { Box3, Sphere, Vector3, type InstancedMesh, type Light, type Object3D } from 'three'
import { applyShadowFlags, holdShadowMap } from '@/engines/scene/shadows'
import { receivesShadow, type SceneNode } from '@/engines/scene/sceneState'
import { isFramed } from '@/engines/scene/framedNodes'

/**
 * 🛑 The flags a node carries, read through the same two answers the editor reads — lights and
 * models included. It stops at a child standing for a node of its own, which carries its own.
 * A light's map is taken off three's per-frame redraw here: `flush` says which frames owe one.
 */
export function dressShadows(
  nodes: readonly SceneNode[],
  byEntity: ReadonlyMap<string, Object3D>,
): void {
  const ownObjects = new Set(byEntity.values())
  // Identity, not the name `ownedByAnotherNode` reads: a game names its objects after the NODE,
  // where the editor names them after its id.
  const belongsElsewhere = (child: Object3D): boolean => ownObjects.has(child)
  for (const node of nodes) {
    const object = byEntity.get(node.id)
    if (!object) continue
    applyShadowFlags(object, node.castShadow, receivesShadow(node), belongsElsewhere)
    if (node.type === 'light') holdShadowMap(object)
  }
}

/**
 * 🛑 What a shadow frustum is measured against: the nodes that DRAW something, never the ground,
 * the scatter or the relief — the editor's `framedObjects`. A scatter spans the world, and a
 * frustum cut to it spreads one shadow map over kilometres.
 *
 * Each object's own reach is remembered on the way: what `growShadowBounds` reads per frame.
 */
export function shadowBoundsOf(
  nodes: readonly SceneNode[],
  byEntity: ReadonlyMap<string, Object3D>,
): Box3 {
  const bounds = new Box3()
  for (const node of nodes) {
    const object = isFramed(node.type) ? byEntity.get(node.id) : undefined
    if (!object) continue
    OWN.setFromObject(object)
    if (OWN.isEmpty()) continue
    bounds.union(OWN)
    OWN.getBoundingSphere(SPHERE)
    ORIGIN.setFromMatrixPosition(object.matrixWorld)
    const scale = scaleOf(object)
    REACH.set(object, scale > 0 ? (SPHERE.center.distanceTo(ORIGIN) + SPHERE.radius) / scale : 0)
  }
  return bounds
}

/**
 * How far an object's subtree reaches from its origin, in its own units — read once at build.
 * A moved entity is then a sphere placed at its origin, never a subtree walked per frame.
 */
const REACH = new WeakMap<Object3D, number>()

/**
 * Grows the bounds by what moved, and answers whether the frustums have to be fitted again — a
 * box only ever grows, as the editor's `heldShadowBounds`. An instanced mesh is read off its
 * sphere, its box never following a slot. A GROUP has no reach of its own: it is walked, and it
 * always asks for a fit, since a light it carries has moved with it.
 */
export function growShadowBounds(
  bounds: Box3,
  moved: Iterable<Object3D>,
  instanced: Iterable<InstancedMesh>,
): boolean {
  HELD.copy(bounds)
  let carried = false
  for (const object of moved) {
    const reach = REACH.get(object)
    if (reach === undefined) {
      bounds.expandByObject(object)
      carried = true
      continue
    }
    object.updateWorldMatrix(true, false)
    SPHERE.center.setFromMatrixPosition(object.matrixWorld)
    SPHERE.radius = reach * scaleOf(object)
    grow(bounds, SPHERE)
  }
  for (const mesh of instanced) {
    if (!mesh.boundingSphere) continue
    mesh.updateWorldMatrix(true, false)
    grow(bounds, SPHERE.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld))
  }
  return carried || !HELD.equals(bounds)
}

/** By a stride past the sphere: a walker at the edge then reframes every few metres, not every step. */
function grow(bounds: Box3, sphere: Sphere): void {
  sphere.getBoundingBox(REACHED)
  if (bounds.containsBox(REACHED)) return
  bounds.union(REACHED.expandByScalar(STRIDE))
}

const STRIDE = 8

const scaleOf = (object: Object3D): number =>
  Math.max(Math.abs(object.scale.x), Math.abs(object.scale.y), Math.abs(object.scale.z))

const HELD = new Box3()
const OWN = new Box3()
const REACHED = new Box3()
const SPHERE = new Sphere()
const ORIGIN = new Vector3()

/** The lights a game tunes and owes passes to: the nodes' own, as the editor reads them. */
export function lightsOf(
  nodes: readonly SceneNode[],
  byEntity: ReadonlyMap<string, Object3D>,
): Light[] {
  const lights: Light[] = []
  for (const node of nodes) {
    const object = node.type === 'light' ? byEntity.get(node.id) : undefined
    if (object && isLight(object)) lights.push(object)
  }
  return lights
}

export function isLight(object: Object3D): object is Light {
  return 'isLight' in object
}
