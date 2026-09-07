import { Mesh, type Camera, type Intersection, type Material, type Object3D } from 'three'
import { stableKey } from '@shared/hash'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import { cachedOn } from '../core/cachedOn'
import type { SceneNode } from './sceneState'
import { isInstanceable, meshesOf, modelShapeKey } from './instanceableModel'
import { isDrawn } from './groupPlacement'
import { forcesGrouping } from './groupingExclusions'
import { heldSourceAncestors } from './heldSourceAncestors'
export {
  behavioralGroupingExclusions,
  excludesGrouping,
  groupingExclusions,
  type GroupingStrategy,
} from './groupingExclusions'

export {
  dropSlotsOf,
  isDrawn,
  pushSlot,
  slotOn,
  trianglesOf,
  widen,
  worldReach,
  writeMoved,
  type Placed,
  type PlacedSlot,
} from './groupPlacement'

/**
 * The layer a mesh goes to once something else draws it in its place.
 *
 * TWO, and never one: `EDGE_LAYER` is one, and a view that shows edges enables it on the camera.
 * Sharing the number put every hidden mesh back on screen beside the instance drawing it —
 * measured, a tight view of 10 000 went from 3.7 ms and 40 calls to 12.6 ms and 9 605.
 *
 * The camera renders layer 0 alone, so nothing on this one costs a draw call — but the mesh stays
 * in the scene with its matrix up to date, which is what keeps picking, the gizmo and the
 * selection working untouched. A raycaster must enable it explicitly: `withEveryLayer` in `SceneRenderer` does.
 */
export const DRAWN_BY_INSTANCE = 2

/**
 * Past this many nodes of one group, drawing them one by one stops being free.
 *
 * Measured on this Mac at 1600×900, 10 000 bodies, group size the only variable: a group of 16
 * already gives back 90 % of the CPU a frame spends in `render` (8.62 ms against 0.86), and 4
 * gives back 59 %. The curve is flat well before the old floor of 64 — 95 % at 32, 96 % at 64.
 * The GPU never moves, 1.25 to 1.76 ms whatever the grouping.
 *
 * 🛑 The floor does NOT defend against a rebuild that grows as groups shrink: measured over three
 * series, that cost is 10 to 30 ms with no trend against group size at all. What it did instead
 * was pay the sweep and group nothing — below the old floor, the count of grouped nodes was zero.
 */
export const WORTH_INSTANCING = DEFAULT_OPTIMIZATION_POLICY.minInstancesPerGroup

export type InstancedGroups = {
  /**
   * Recomposes the groups from what the scene now holds. Answers how many nodes are drawn by
   * something other than themselves — zero when nothing reached the floor, the ordinary scene.
   *
   * Call it after the world matrices are up to date: the matrices are copied from them.
   */
  rebuild: (
    nodes: readonly SceneNode[],
    objectOf: (id: string) => Object3D | undefined,
    excluded?: ReadonlySet<string>,
    artifacts?: readonly RuntimeRenderArtifact[],
  ) => number
  /**
   * Writes the matrices of nodes that just moved, without rebuilding a thing — and says whether
   * any of them was drawn by something else.
   *
   * A gesture reports its move only when it ends, so between the two a grouped node would stand
   * where the last rebuild left it. Ten nodes cost 0.95 µs at 10 000 and 1.35 µs at 40 000,
   * against 7.2 and 47.5 ms to group again. Read the world matrices before calling: they are
   * what is copied.
   */
  moved: (ids: Iterable<string>, objectOf: (id: string) => Object3D | undefined) => boolean
  /**
   * The meshes it draws with, for the passes that dress the scene: a display mode REPLACES a
   * mesh's material, and one left out of that walk keeps the one it was built with.
   */
  drawn: () => readonly Mesh[]
  /**
   * What a ray must meet beside the sources. A grouped mesh names a hit by its slot through
   * `nodeIdOf`, independently of the representation that draws it.
   */
  pickable: () => readonly Mesh[]
  /** Editor ray targets, resolved through `nodeIdOf` when they are runtime representations. */
  editorPickable: () => readonly Mesh[]
  editorSourceCount: () => number
  nodeIdOf: (hit: Intersection) => string | null
  /**
   * Hangs every source back under the node it belongs to, for whoever reads the tree DOWNWARD.
   *
   * A source is drawn by something else, so it is kept out of the array three walks — see
   * `heldOutOfDraw`. Reading the scene BY ID needs nothing of this; walking a parent's children
   * does, and so does `updateMatrixWorld`, which composes through them.
   */
  hangSources: () => void
  dropSources: () => void
  holdsSource: (object: Object3D) => boolean
  /**
   * Composes the world matrices of the sources held out of the walk, which no longer reaches
   * them. A group COPIES those matrices, so this runs between `updateMatrixWorld` and a rebuild.
   */
  refreshSources: () => void
  /**
   * Where the camera now stands, before the pane it is about to draw — the one call of this
   * contract a FRAME makes, and the only one a strategy may leave out.
   *
   * A strategy that holds a zone answers whether what it draws moved, so the caller knows the
   * shadow maps have to be drawn again. Nothing else implements it: the groups of a whole level
   * are the same wherever one looks from.
   */
  follow?: (camera: Camera | null, cast?: ShadowThrow | null) => boolean
  /**
   * Whether this strategy BUILT a mesh since the question was last asked — read and cleared.
   *
   * A promotion makes a lot mid-drag, outside any rebuild, and a fresh mesh wears the document's
   * own material: a pane that believed the scene already dressed would leave it undressed. Only a
   * strategy that builds outside `rebuild` answers.
   */
  builtAnew?: () => boolean
  /**
   * What the last `follow` walked, for whoever measures the strategy from outside — the studio's
   * counters, a bench, a probe. Only a strategy that holds a spatial index answers.
   */
  stats?: () => GroupingStats
  dispose: () => void
}

export type RuntimeRenderArtifact = {
  readonly key: string
  readonly strategy: 'instance' | 'batch' | 'merge'
  readonly sourceIds: readonly string[]
  readonly signature: string
}

/**
 * Where a shadow falls, and how far down it can travel before it lands.
 *
 * 🛑 What a strategy that hides by the CAMERA's frustum has to be told. `WebGLShadowMap` returns
 * on `object.visible === false` and tests `object.layers` against the VIEW camera, so nothing
 * hidden for the colour pass reaches the shadow pass either — measured, a body just out of frame
 * took its shadow off the ground with it, over 2.0 % of the pixels.
 */
export type ShadowThrow = {
  /**
   * Where a shadow travels, one normalised direction per light with an ORTHOGRAPHIC shadow camera
   * — the directionals. A set lit from two sides throws two ways, and reading only the first hides
   * a caster whose other shadow is on screen.
   *
   * 🛑 The blind spot, written rather than hidden: a SPOT projects through a perspective shadow
   * camera, so it contributes nothing here. A set lit by spots alone answers no direction at all,
   * and a caster just out of frame takes its shadow off the ground with it — the very defect this
   * type exists to prevent. Shadows are the lot after this one.
   */
  along: readonly { x: number; y: number; z: number }[]
  floor: number
  /**
   * How far a shadow can travel before the map that draws it runs out — `fitShadowCamera` bounds
   * every shadow camera to this. Without it a sun near the horizon divides by a vanishing slope
   * and sweeps a box to infinity: every cell passes the test, and the partition quietly stops
   * partitioning, with statistics that read perfectly normal.
   */
  reach: number
}

export type GroupingStats = {
  nodesVisited: number
  cellsReturned: number
  cellsStanding: number
  cells: number
  bytes: number
}

/**
 * The five fields every strategy answers with once it holds sources — written here rather than in
 * each of the four, where they were the same nine lines.
 */
export type HeldSourceFields = Pick<
  InstancedGroups,
  'hangSources' | 'dropSources' | 'refreshSources' | 'holdsSource' | 'dispose'
>

export type HeldOutOfDraw = {
  hold: (meshes: readonly Mesh[]) => void
  holds: (object: Object3D) => boolean
  refresh: (under?: ReadonlySet<Object3D>) => void
  hang: () => void
  drop: () => void
  /** Disposal puts the sources back in the walk: nothing draws for them any more. */
  fields: (clear: () => void) => HeldSourceFields
}

/**
 * The sources of what MOVED, composed against the parents the move has just written. A primitive
 * of a grouped model hangs from no walk, so nothing else ever reaches it.
 * Answers the ids it read: `moved` walks them again, and an `Iterable` may be a generator whose
 * second walk finds nothing — no matrix written, and not a word about it.
 */
export function refreshMovedSources(
  sources: HeldOutOfDraw,
  ids: Iterable<string>,
  objectOf: (id: string) => Object3D | undefined,
): readonly string[] {
  const read = [...ids]
  const parents = new Set<Object3D>()
  for (const id of read) {
    const object = objectOf(id)
    if (object) parents.add(object)
  }
  sources.refresh(parents)
  return read
}

/**
 * The sources of the groups, held OUT of the array three walks.
 *
 * A source keeps its `parent`: everything that reads the tree UPWARD goes on answering as it did
 * — `isDrawn` below, `updateWorldMatrix` when a node moves, and `hangFromParent`, which finds it
 * already under its parent and does nothing. What it leaves is `parent.children`, the one array
 * `updateMatrixWorld`, `projectObject` and every shadow pass walk.
 *
 * Measured on this Mac, 50 000 shadowed sources beside what draws them: 11.07 ms of a render
 * spent in that walk, 0.07 once they are out of it. An invisible container spares `projectObject`
 * alone and lands at 5.63 — half, for the same bookkeeping.
 *
 * 🛑 A reader that walks a parent's children sees nothing of them. The exporter is the one such
 * reader here, and `hangSources` is what it calls first.
 */
export function heldOutOfDraw(): HeldOutOfDraw {
  let held: readonly Mesh[] = []
  let ours = new Set<Object3D>()
  const sourceAncestors = heldSourceAncestors()
  /** Out of the walk is the resting state: a rebuild alone takes its sources out of it. */
  let hung = false

  /** By the parent each one hangs from NOW: a drag carries a source under the pivot mid-gesture. */
  const byParent = (meshes: readonly Mesh[]): Map<Object3D, Mesh[]> => {
    const parents = new Map<Object3D, Mesh[]>()
    for (const mesh of meshes) {
      if (!mesh.parent) continue
      const kept = parents.get(mesh.parent)
      if (kept) kept.push(mesh)
      else parents.set(mesh.parent, [mesh])
    }
    return parents
  }

  /**
   * The array rebuilt in one pass rather than spliced mesh by mesh: a source leaves a list of
   * fifty thousand siblings, and one splice each is quadratic. Filtered first, so a source a
   * gesture already put back is not held twice.
   */
  const walkThem = (yes: boolean): void => {
    if (hung === yes) return
    hung = yes
    for (const [parent, meshes] of byParent(held)) {
      const moving = new Set<Object3D>(meshes)
      const kept = parent.children.filter(child => !moving.has(child))
      parent.children = yes ? [...kept, ...meshes] : kept
    }
  }

  const holds = (object: Object3D): boolean => ours.has(object)

  // Nothing to compose while they are hung: the walk that just ran did it.
  const refresh = (under?: ReadonlySet<Object3D>): void => {
    if (hung) return
    const wanted: Iterable<Mesh> = under ? sourceAncestors.beneath(under) : held
    const updated = under ? new Set<Object3D>() : null
    for (const mesh of wanted) {
      const parent = mesh.parent
      if (!parent) continue
      if (updated && !updated.has(parent)) {
        parent.updateWorldMatrix(true, false)
        updated.add(parent)
      }
      if (mesh.matrixAutoUpdate) mesh.updateMatrix()
      mesh.matrixWorld.multiplyMatrices(parent.matrixWorld, mesh.matrix)
    }
  }

  return {
    // Nothing to move while they are hung: whichever set the rebuild settled on is in the walk
    // already, since a source only ever leaves it here. Otherwise ONE pass over each parent's
    // children — a hang then a drop cost 20 ms of a change of content on 50 000 bodies, and all
    // the second undid was the first.
    hold: meshes => {
      if (hung) {
        held = meshes
        ours = new Set<Object3D>(meshes)
        sourceAncestors.replace(meshes)
        return
      }
      const out = new Set<Object3D>(meshes)
      const back = byParent(held.filter(mesh => !out.has(mesh)))
      const parents = new Set<Object3D>(back.keys())
      for (const mesh of meshes) if (mesh.parent) parents.add(mesh.parent)

      for (const parent of parents) {
        const returning = back.get(parent)
        const known = returning ? new Set<Object3D>(returning) : null
        parent.children = [
          ...parent.children.filter(child => !out.has(child) && !known?.has(child)),
          ...(returning ?? []),
        ]
      }
      held = meshes
      ours = out
      sourceAncestors.replace(meshes)
    },

    holds,

    refresh,

    hang: () => walkThem(true),
    drop: () => walkThem(false),

    fields: clear => ({
      hangSources: () => walkThem(true),
      dropSources: () => walkThem(false),
      refreshSources: refresh,
      holdsSource: holds,
      dispose: () => {
        clear()
        walkThem(true)
      },
    }),
  }
}

/**
 * Takes an object out of the tree for good, held out of the walk or not.
 *
 * `removeFromParent` does nothing at all to a source a group holds out of its parent's children:
 * three splices by index and clears `parent` only when it finds one. A released node would keep
 * its parent and be hung back by the next rebuild, disposed geometry and all.
 */
export function unhang(object: Object3D): void {
  object.removeFromParent()
  object.parent = null
}

export const DRAWN_TRIANGLES = 'drawnTriangles'

export type Grouped = {
  key: string
  ids: string[]
  meshes: Mesh[]
  nodes: SceneNode[]
  material: Material
}

export function sweep(
  nodes: readonly SceneNode[],
  objectOf: (id: string) => Object3D | undefined,
  host: Object3D,
  ownMaterialOf: (mesh: Mesh) => Material | Material[],
  keyOf: (node: SceneNode, mesh: Mesh) => string,
  sources: HeldOutOfDraw,
  excluded?: ReadonlySet<string>,
  minimumSize = WORTH_INSTANCING,
): Grouped[] {
  const parented = new Set<string>()
  for (const node of nodes) if (node.parentId) parented.add(node.parentId)
  const groups = collectGroups(nodes, objectOf, host, ownMaterialOf, keyOf, excluded)
  const { worth, held } = worthyGroups(groups, parented, minimumSize)
  sources.hold(held)
  return worth
}

function collectGroups(
  nodes: readonly SceneNode[],
  objectOf: (id: string) => Object3D | undefined,
  host: Object3D,
  ownMaterialOf: (mesh: Mesh) => Material | Material[],
  keyOf: (node: SceneNode, mesh: Mesh) => string,
  excluded?: ReadonlySet<string>,
): Map<string, Grouped> {
  const groups = new Map<string, Grouped>()
  const take = (node: SceneNode, mesh: Mesh): void => {
    const material = ownMaterialOf(mesh)
    // A group draws ONE material. A mesh wearing an array of them is left to be drawn alone.
    if (Array.isArray(material)) {
      mesh.layers.set(0)
      return
    }

    const key = `${keyOf(node, mesh)}|${node.optimization?.groupId ?? ''}`
    const held = groups.get(key)
    if (held) {
      held.ids.push(node.id)
      held.meshes.push(mesh)
      held.nodes.push(node)
    } else groups.set(key, { key, ids: [node.id], meshes: [mesh], nodes: [node], material })
  }

  for (const node of nodes) {
    const object = objectOf(node.id)
    if (excluded?.has(node.id)) {
      restoreExcluded(object)
      continue
    }
    if (!object || !isDrawn(object, host)) continue
    if (node.type === 'mesh') {
      if (!(object instanceof Mesh)) continue
      take(node, object)
      continue
    }
    if (node.type !== 'model' || !isInstanceable(object)) continue
    for (const mesh of meshesOf(object)) {
      if (isDrawn(mesh, host)) take(node, mesh)
    }
  }
  return groups
}

function restoreExcluded(object: Object3D | undefined): void {
  if (object instanceof Mesh) object.layers.set(0)
  else if (object) for (const mesh of meshesOf(object)) mesh.layers.set(0)
}

function worthyGroups(
  groups: ReadonlyMap<string, Grouped>,
  parented: ReadonlySet<string>,
  minimumSize: number,
): { worth: Grouped[]; held: Mesh[] } {
  const worth: Grouped[] = []
  const held: Mesh[] = []
  for (const group of groups.values()) {
    // Back to the camera's layer: a group that shrank below the floor since the last pass would
    // otherwise stay invisible with nothing drawing it.
    if (group.meshes.length < minimumSize && !group.nodes.some(forcesGrouping)) {
      for (const mesh of group.meshes) mesh.layers.set(0)
      continue
    }
    worth.push(group)
    for (const [at, mesh] of group.meshes.entries()) {
      mesh.layers.set(DRAWN_BY_INSTANCE)
      // Read parentage from the document because the previous pass may have changed the object tree.
      if (!parented.has(group.ids[at] ?? '')) held.push(mesh)
    }
  }
  return { worth, held }
}

/**
 * The spelling of a part of a node, held against the node itself.
 *
 * A rebuild runs on every change of content, and spelling 10 000 nodes again each time cost
 * 53.6 ms against 7.2 held. A node is replaced when it is edited and kept when it is not —
 * `syncNode` already leans on that — so a node still here is still spelled the same way.
 */
export function spellingOf(spell: (node: SceneNode) => string): (node: SceneNode) => string {
  const spelled = new WeakMap<SceneNode, string>()
  return node => cachedOn(spelled, node, () => spell(node))
}

export const shapeAndPaint = (): ((node: SceneNode, mesh: Mesh) => string) => {
  const meshKey = spellingOf(node =>
    node.type === 'mesh' ? stableKey([node.geometry, node.material]) : '',
  )
  return (node, mesh) => {
    if (node.type === 'mesh') return meshKey(node)
    if (node.type === 'model') return modelShapeKey(node, mesh)
    return ''
  }
}

export const flagsOf = (node: SceneNode, mesh: Mesh): number =>
  (mesh.castShadow ? 4 : 0) +
  (mesh.receiveShadow ? 2 : 0) +
  (node.type === 'mesh' && node.negative === true ? 1 : 0)

/**
 * A key held so flags are compared rather than respelled — the sweep composed one string per body
 * per pass, 5 000 on a rebuild of 5 000. Held on the mesh: a model yields one key per primitive,
 * and holding it on the node would merge them.
 */
export function withFlags(
  spell: (node: SceneNode, mesh: Mesh) => string,
): (node: SceneNode, mesh: Mesh) => string {
  const held = new WeakMap<Mesh, { node: SceneNode; flags: number; key: string }>()
  return (node, mesh) => {
    const flags = flagsOf(node, mesh)
    const known = held.get(mesh)
    if (known?.node === node && known.flags === flags) return known.key
    const key = `${spell(node, mesh)}|${flags}`
    held.set(mesh, { node, flags, key })
    return key
  }
}
