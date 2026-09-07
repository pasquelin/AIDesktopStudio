/**
 * The scene, as plain data. It holds no three.js object on purpose: an engine is rebuilt from
 * its serialized state, never from its DOM, and jsdom has no WebGL context to test against.
 *
 * The descriptors themselves live in `shared/domain/scene.ts`: they are what a saved document
 * contains, and the native menu builds its Add entries from the same kinds.
 */
import {
  DEFAULT_WORLD,
  type CameraDescriptor,
  type SceneWorld,
  type GeometryDescriptor,
  type LightDescriptor,
  type MaterialDescriptor,
  type ModelRef,
  type OptimizationSettings,
  type PathDescriptor,
  type SpriteDescriptor,
  type TextDescriptor,
  type Transform,
  type Vector3,
} from '@shared/domain/scene'
import type { Component } from '@shared/domain/component'
import type { CsgGraph } from '@shared/domain/csg'
import { EMPTY_TIMELINE, type AnimationTimeline } from '@shared/domain/animation'
import { DEFAULT_FONT } from '@shared/domain/font'
import { cachedOn } from '../core/cachedOn'

export type { OptimizationSettings } from '@shared/domain/scene'

export type BakedInstance = {
  sourceId: string
  name: string
  transform: Transform
}

export type SceneNodeBase = {
  id: string
  /** `null` is a direct child of the scene. Reparenting is not offered yet. */
  parentId: string | null
  name: string
  visible: boolean
  transform: Transform
  /** Throws a shadow. On a light, whether it casts any at all — six renders a frame for a point. */
  castShadow: boolean
  /** Catches the shadows of others. Meaningless on a light, and ignored there. */
  receiveShadow: boolean
  /**
   * What the entity DOES, beside what `type` says it DRAWS. Absent means none, so no document
   * written before this existed changes by one byte.
   *
   * Beside the type rather than replacing it: the `switch (node.type)` is the contract of several
   * thousand lines, and it is what gives the compiler its grip. A component is gameplay, not
   * rendering — the behaviour lives in a system, never in the component.
   */
  components?: readonly Component[]
  /**
   * The attachment point of the PARENT this node hangs on — a sword in a hand, a hat on a head.
   *
   * It REFINES `parentId` and never replaces it: the parent is still the character, and this
   * says which of its sockets to follow. A node whose parent carries no such socket hangs from
   * the character itself, which is where it stood before the socket was named.
   */
  attach?: { socket: string }
  /**
   * How a person answered « how should this be drawn » — read by the grouping, which keeps its own
   * representation as a disposable cache. `instances` is NOT that cache: it is written and read
   * back verbatim, so once baked it IS the document.
   */
  optimization?: OptimizationSettings
}

export type SceneNode = SceneNodeBase &
  (
    | {
        type: 'mesh'
        geometry: GeometryDescriptor
        material: MaterialDescriptor
        instances?: readonly BakedInstance[]
        /**
         * Marked as a TOOL for the next boolean — Roblox's Negate, and the only explicit way to
         * say which way a cut runs. Absent on every node ever written so far, and absent means
         * matter: that is the whole migration.
         */
        negative?: boolean
      }
    | { type: 'light'; light: LightDescriptor }
    | { type: 'model'; model: ModelRef }
    | { type: 'sprite'; sprite: SpriteDescriptor }
    // A solid like a mesh, and lit like one — so it wears the same material, and the inspector's
    // material section serves it without knowing it exists.
    | { type: 'text'; text: TextDescriptor; material: MaterialDescriptor }
    // A solid cut out of other solids. It wears a material like a mesh, and its SHAPE is a
    // recipe rather than a descriptor — ADR-25: the graph is the document, the mesh is a cache.
    | { type: 'carved'; carved: CsgGraph; material: MaterialDescriptor; negative?: boolean }
    // Nothing of its own: a group is a transform others hang from, and a name to find it by.
    | { type: 'group' }
    // What a render looks through. Not the viewport's camera: that one is how the scene is being
    // WATCHED, and this one is part of what the scene IS.
    | { type: 'camera'; camera: CameraDescriptor }
    // A rail. Its points live in its own frame, so moving the node moves the whole trajectory.
    | { type: 'path'; path: PathDescriptor }
  )

/** Derived, never restated: a member added to the union above is a member here on the spot. */
export type SceneNodeType = SceneNode['type']

/** What the shadow rules read of a node — its type, and a light's kind. */
type ShadowSubject =
  { type: 'light'; light: LightDescriptor } | { type: Exclude<SceneNodeType, 'light'> }

/**
 * A flat ordered list, not a nested tree: reparenting becomes one field instead of moving a
 * subtree, lookups stay a find, and the serialized form never nests. The tree is derived.
 */
export type SceneState = {
  nodes: readonly SceneNode[]
  /** Ordered, and the last one is the anchor: what the inspector reads out. See `helpers/selection`. */
  selectedIds: readonly string[]
  /** What lights the scene and what hangs behind it. Part of the document, and belongs to no node. */
  world: SceneWorld
  /** The tracks that move it through time. Where the head STANDS is session state, not this. */
  animation: AnimationTimeline
  /**
   * The axes held still, which `setTransform` refuses to write — so a padlock holds against the
   * viewport handle as much as against the field. Session state like `selectedIds`: no file
   * carries it, and it is written through `replace` rather than as a command.
   */
  lockedAxes?: readonly AxisLock[]
}

/** One axis of one channel of one node, held still. */
export type AxisLock = {
  nodeId: string
  channel: keyof Transform
  axis: keyof Vector3
}

/** Whether this axis is held, read off the state a command already receives. */
export function axisIsLocked(
  state: Pick<SceneState, 'lockedAxes'>,
  nodeId: string,
  channel: keyof Transform,
  axis: keyof Vector3,
): boolean {
  return (state.lockedAxes ?? []).some(
    lock => lock.nodeId === nodeId && lock.channel === channel && lock.axis === axis,
  )
}

/** The same list with one lock taken out or put in. */
export function withAxisLock(
  locks: readonly AxisLock[],
  lock: AxisLock,
  held: boolean,
): readonly AxisLock[] {
  const without = locks.filter(
    one => one.nodeId !== lock.nodeId || one.channel !== lock.channel || one.axis !== lock.axis,
  )
  return held ? [...without, lock] : without
}

/**
 * `next` with every held axis put back to where `from` had it. The whole reason the padlock holds
 * everywhere: both the inspector and the viewport write through `setTransform`.
 */
export function withoutLockedAxes(
  state: Pick<SceneState, 'lockedAxes'>,
  nodeId: string,
  from: Transform,
  next: Transform,
): Transform {
  if ((state.lockedAxes ?? []).length === 0) return next

  const channels: (keyof Transform)[] = ['position', 'rotation', 'scale']
  return channels.reduce((held, channel) => {
    const axes = XYZ.filter(axis => axisIsLocked(state, nodeId, channel, axis))
    if (axes.length === 0) return held

    return {
      ...held,
      [channel]: axes.reduce(
        (vector, axis) => ({ ...vector, [axis]: from[channel][axis] }),
        held[channel],
      ),
    }
  }, next)
}

const XYZ: readonly (keyof Vector3)[] = ['x', 'y', 'z']

/** Where a node ended up, reported by whatever moved it — a gizmo drag moves a whole selection. */
export type NodeMove = {
  id: string
  transform: Transform
  /** A bone of that node's model, when the pose mode moved one rather than the node itself. */
  bone?: string
  /**
   * Where the bone rested when it arrived. Carried with the move because that pose lives in the
   * FILE, not in the document — only the renderer ever knew it.
   */
  rest?: Transform
}

/**
 * What a node without shadow flags means — a document written before they existed, which is
 * every one saved so far.
 *
 * A mesh both throws and catches: that is what makes a scene read as lit rather than as a set of
 * cut-outs. Of the lights, only the directional one throws by default: it is what carries the key
 * of a scene. A point light is six renders of the whole scene per frame, and a spot — one render,
 * like the directional — points down at a set nobody aimed it at yet, where it mostly produces
 * acne. Both are one checkbox away in the inspector.
 */
export function shadowDefaults(node: ShadowSubject): {
  castShadow: boolean
  receiveShadow: boolean
} {
  if (node.type === 'light') {
    return { castShadow: node.light.kind === 'directional', receiveShadow: false }
  }
  // Everything else defaults to what it is capable of: a mesh both throws and catches, a sprite
  // does neither, and nothing has to say so twice.
  return { castShadow: canCastShadow(node), receiveShadow: canReceiveShadow(node) }
}

/** A light catches nothing: the flag exists on every node, but only two kinds answer to it. */
export function receivesShadow(node: SceneNode): boolean {
  return canReceiveShadow(node) && node.receiveShadow
}

/**
 * Whether a node can throw a shadow at all. An ambient or hemisphere light has no shadow camera,
 * and three.js warns once per frame about a light told to cast one — so the box is not offered
 * rather than offered and ignored. A sprite is never drawn into a shadow map: three.js walks
 * meshes there, and nothing else.
 */
export function canCastShadow(node: ShadowSubject): boolean {
  if (node.type === 'light') return SHADOW_CASTING_LIGHTS.includes(node.light.kind)
  // A camera draws nothing at all, so it can neither throw a shadow nor be drawn into a map.
  return node.type !== 'sprite' && node.type !== 'camera'
}

/** Whether a node catches the shadows of others. A light catches none, and a sprite is unlit. */
export function canReceiveShadow(node: ShadowSubject): boolean {
  return node.type !== 'light' && node.type !== 'sprite' && node.type !== 'camera'
}

/**
 * Whether turning a node shows anything. A sprite always faces the camera: three.js reads its size
 * off the *lengths* of the first two columns of the model matrix — which a rotation leaves
 * untouched — and takes its angle from a material uniform. Nodes hanging under one are the
 * exception: turning the sprite swings them around it, and that does show.
 *
 * The whole rule rather than the half the type answers, because three places have to agree: the
 * handle offered in the viewport, the row offered in the inspector, and the command that writes
 * the angle. Two of the three agreeing is how the angle stayed typeable after the handle was
 * refused.
 *
 * The children are asked for, not handed over, because the three do not count them the same way:
 * the viewport reads the object three.js built, the other two read the node list.
 */
export function rotationShows(node: { type: SceneNodeType }, children: () => boolean): boolean {
  return node.type !== 'sprite' || children()
}

/** Keyed on the LIST: `SceneState.nodes` is readonly, and no `parentId` is ever written in place. */
const parentIds = new WeakMap<readonly SceneNode[], ReadonlySet<string>>()

/**
 * Whether anything hangs from the node. The scan was the whole cost of the two gestures that ask
 * it once per node: dragging 200 sprites of 40 000 took 29.40 ms an image against 1.39 through
 * here, and the inspector row asked it again on every render — 52.34 ms against 0.05.
 */
export function hasChildren(nodes: readonly SceneNode[], id: string): boolean {
  return cachedOn(parentIds, nodes, () => {
    const parents = new Set<string>()
    for (const node of nodes) if (node.parentId !== null) parents.add(node.parentId)
    return parents
  }).has(id)
}

const SHADOW_CASTING_LIGHTS: readonly LightDescriptor['kind'][] = ['directional', 'spot', 'point']

// Re-exported rather than moved away from its readers: it lives beside `Transform` now, because
// `shared/domain/rig.ts` rests a new bone on it and cannot reach into the renderer.
export { IDENTITY_TRANSFORM } from '@shared/domain/transform'

export const DEFAULT_MATERIAL: MaterialDescriptor = {
  kind: 'standard',
  color: null,
  roughness: 1,
  metalness: 0,
  /** One square per metre: the density at which the working checker reads as a measure. */
  tilesPerMetre: 1,
  map: null,
  normalMap: null,
  roughnessMap: null,
  metalnessMap: null,
  aoMap: null,
  emissiveMap: null,
  displacementMap: null,
}

export const DEFAULT_SPRITE: SpriteDescriptor = {
  color: null,
  opacity: 1,
  map: null,
}

/**
 * A metre tall and slightly thick, in a face the studio ships: a text dropped into a scene reads
 * against the grid straight away, and opens the same on whatever machine it travels to.
 */
export const DEFAULT_TEXT: TextDescriptor = {
  value: 'Text',
  font: DEFAULT_FONT,
  size: 1,
  depth: 0.2,
  curveSegments: 6,
}

export const EMPTY_SCENE: SceneState = {
  nodes: [],
  selectedIds: [],
  world: DEFAULT_WORLD,
  animation: EMPTY_TIMELINE,
}

export type MeshNode = Extract<SceneNode, { type: 'mesh' }>
export type LightNode = Extract<SceneNode, { type: 'light' }>
export type ModelNode = Extract<SceneNode, { type: 'model' }>
export type SpriteNode = Extract<SceneNode, { type: 'sprite' }>
export type TextNode = Extract<SceneNode, { type: 'text' }>
export type CarvedNode = Extract<SceneNode, { type: 'carved' }>

/**
 * What wears a `MaterialDescriptor` — a mesh, a text and a solid, lit by the same rules and
 * served by one section of the inspector.
 *
 * Derived, never restated: the three sites that listed the types by hand each forgot the solid,
 * and each forgot it silently — a wall could be pierced and then not painted.
 */
export type MaterialNode = Extract<SceneNode, { material: MaterialDescriptor }>

export function carriesMaterial(node: SceneNode): node is MaterialNode {
  return 'material' in node
}
export type CameraNode = Extract<SceneNode, { type: 'camera' }>
export type PathNode = Extract<SceneNode, { type: 'path' }>

/** Keyed on the LIST, like `parentIds`: the first of two nodes sharing an id wins, as `find` did. */
const nodesById = new WeakMap<readonly SceneNode[], ReadonlyMap<string, SceneNode>>()

/**
 * Rebuilt per CALL, this cost 3.56 ms on 40 000 nodes — and a drag hands a NEW list to each of
 * the readers below on every image, so no `useMemo` at a call site ever hit. Paid once a list
 * now: 3.56 ms for the first reader, 0.0066 for every one after.
 */
function byIdOf(nodes: readonly SceneNode[]): ReadonlyMap<string, SceneNode> {
  return cachedOn(nodesById, nodes, () => {
    const found = new Map<string, SceneNode>()
    for (const node of nodes) if (!found.has(node.id)) found.set(node.id, node)
    return found
  })
}

export function nodeById(state: SceneState, id: string): SceneNode | null {
  return byIdOf(state.nodes).get(id) ?? null
}

/**
 * What an edit acts on, in the order the selection was built — so the last one is the anchor the
 * inspector reads out. Ids nothing answers to are dropped rather than reported as holes.
 *
 * The two halves are taken apart rather than a whole `SceneState`: every caller reads them as two
 * selectors, precisely so that selecting a node does not re-render what only watches the nodes.
 */
export function selectedNodes(
  nodes: readonly SceneNode[],
  selectedIds: readonly string[],
): SceneNode[] {
  const byId = byIdOf(nodes)
  return selectedIds.flatMap(id => byId.get(id) ?? [])
}

export function childrenOf(state: SceneState, parentId: string | null): SceneNode[] {
  return state.nodes.filter(node => node.parentId === parentId)
}

/**
 * Whether a node may hang from a parent — which is to say, whether doing so would make a loop.
 *
 * A node cannot become its own descendant's child: the tree would close on itself, and every
 * walk of it would run forever. This is the classic bug of the feature, so it is one function
 * with one test rather than a check written wherever a parent is chosen.
 */
export function canReparent(
  nodes: readonly SceneNode[],
  id: string,
  parentId: string | null,
): boolean {
  if (parentId === null) return true

  const byId = byIdOf(nodes)
  let walker: SceneNode | undefined = byId.get(parentId)
  while (walker) {
    if (walker.id === id) return false
    walker = walker.parentId === null ? undefined : byId.get(walker.parentId)
  }
  // The chain from the wanted parent never met the node, so hanging it there closes nothing.
  return parentId !== id
}

/**
 * Every node under the ones named, themselves included — what a delete has to carry along.
 *
 * 🛑 The index is built ONCE, and that is the whole point: four gestures called this per selected
 * node, each rebuilding it. On 40 000 nodes, deleting 2 000 cost 2 705 ms and isolating them
 * 1 783 — measured, against 1.9 and 6.1 through here.
 *
 * The roots keep the order they were NAMED in: a duplicate reads its last copy as the anchor, so
 * scene order there moved the gizmo onto a shape nobody pointed at. A node named twice — or
 * hanging from another root — is answered once, and that is also what ends a parent cycle.
 */
export function subtreesOf(nodes: readonly SceneNode[], ids: readonly string[]): SceneNode[] {
  const wanted = new Set(ids)
  const byParent = new Map<string | null, SceneNode[]>()
  const roots = new Map<string, SceneNode>()
  for (const node of nodes) {
    if (wanted.has(node.id)) roots.set(node.id, node)
    const siblings = byParent.get(node.parentId)
    if (siblings) siblings.push(node)
    else byParent.set(node.parentId, [node])
  }
  const found: SceneNode[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const root = roots.get(id)
    if (!root || seen.has(id)) continue
    seen.add(id)
    found.push(root)
  }
  for (let at = 0; at < found.length; at += 1) {
    const node = found[at]
    if (!node) continue
    for (const child of byParent.get(node.id) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      found.push(child)
    }
  }
  return found
}

/** The half of the scene a panel is about — meshes or lights. */
export function nodesOfType(nodes: readonly SceneNode[], type: SceneNodeType): SceneNode[] {
  return nodes.filter(node => node.type === type)
}

const cameraSets = new WeakMap<readonly SceneNode[], ReadonlySet<string>>()

/**
 * The cameras a scene holds, in document order. Both readers are on the frame path — the shots
 * ask which cameras still exist, the fall back asks for the first — and both walked the whole
 * scene to answer: measured 18/08 on `cameraShots.bench`, 7,2 µs a call over 5 000 nodes and
 * 73 µs over 50 000 with a shot covering the instant, 15 and 151 µs on the fall back, against
 * 0,1 µs whatever the count.
 */
export function cameraIds(nodes: readonly SceneNode[]): ReadonlySet<string> {
  return cachedOn(cameraSets, nodes, () => new Set(nodesOfType(nodes, 'camera').map(n => n.id)))
}

/**
 * What a render looks through: the first camera the scene holds, in document order.
 *
 * `null` for a scene that has none, which is not a failure — a model dropped straight onto a
 * montage is drawn by the free camera instead. The rule lives here rather than at its two call
 * sites so that what the Render button writes and what a montage shows cannot disagree.
 */
export function firstCameraId(nodes: readonly SceneNode[]): string | null {
  return cameraIds(nodes).values().next().value ?? null
}

/** The nodes of a set whose parent is not in it — what a gesture over a subtree acts on once. */
export function rootsOf(nodes: readonly SceneNode[]): SceneNode[] {
  const ids = new Set(nodes.map(node => node.id))
  return nodes.filter(node => node.parentId === null || !ids.has(node.parentId))
}
