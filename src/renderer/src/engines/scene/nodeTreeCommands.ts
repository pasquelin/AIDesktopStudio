import { newId } from '@/helpers/ids'
import { isCsgGraph, type CsgOperation } from '@shared/domain/csg'
import { commandId, type Command } from '../core/history'
import {
  allNegative,
  canCarve,
  carveGraph,
  carvePlan,
  carveScene,
  isCarvable,
  placedIn,
} from '../csg/carve'
import { multi } from './nodeBatchCommands'
import { addNode, removeNode, removeNodes } from './nodeBulkCommands'
import { sweep } from './nodeEditCommands'
import { carvedNode, groupNode, meshNode } from './nodeFactory'
import { leavesPlayerModule } from './playerModule'
import {
  canReparent,
  nodeById,
  rootsOf,
  subtreesOf,
  type CarvedNode,
  type SceneNode,
  type SceneState,
} from './sceneState'

/**
 * Scene edits, reimplemented in TypeScript from `mrdoob/three.js/editor/js/commands/` (MIT).
 * The structure is what was worth taking; the original is untyped JavaScript built on its own
 * `signals` bus.
 *
 * A command captures what it needs to revert **as it is applied**, not as it is built: what an
 * object looked like before is only known once the edit actually runs. Redo re-applies and
 * re-captures, so a command survives being replayed.
 */
export function canMoveNode(
  nodes: readonly SceneNode[],
  id: string,
  parentId: string | null,
): boolean {
  return canReparent(nodes, id, parentId) && !leavesPlayerModule(nodes, id, parentId)
}

/**
 * Hangs a node from another, or from the scene when the parent is `null`.
 *
 * The old parent is captured **as the command runs**, like every other edit here: what a node
 * hung from before is only known once the move actually happens, and a redo has to re-capture.
 *
 * A move that would close the tree on itself, or take a required part out of a player module, is
 * refused rather than applied — see `canMoveNode`.
 */
export function reparentNode(id: string, parentId: string | null): Command<SceneState> {
  let previous: string | null = null
  let moved = false

  return {
    id: `reparent:${id}`,
    apply: state => {
      const node = nodeById(state, id)
      if (!node || node.parentId === parentId || !canMoveNode(state.nodes, id, parentId)) {
        moved = false
        return state
      }

      previous = node.parentId
      moved = true
      return hang(state, id, parentId)
    },
    revert: state => (moved ? hang(state, id, previous) : state),
  }
}

/**
 * Moves a BATCH within the order of a level, and to another level in the same gesture — several
 * rows dragged between two others. They land contiguous, in the order given.
 *
 * 🛑 `index` counts the level once the WHOLE batch has left it, which is what `Tree` reports — so
 * they are lifted together and put back together, NEVER one after the other: a member still in
 * place is counted as a sibling by the next one, and the batch scatters. Measured on a level of
 * five where two members moved to its end: they landed two apart.
 */
export function reorderNodes(
  ids: readonly string[],
  parentId: string | null,
  index: number,
): Command<SceneState> {
  let previous: { id: string; parentId: string | null; at: number }[] | null = null

  return {
    id: commandId('reorder', ids),
    apply: state => {
      const moving = ids
        .map(id => nodeById(state, id))
        .filter(node => node !== null)
        .filter(node => canMoveNode(state.nodes, node.id, parentId))
      if (moving.length === 0) return state

      const placeOf = new Map(state.nodes.map((node, at) => [node.id, at]))
      previous = moving.map(node => ({
        id: node.id,
        parentId: node.parentId,
        at: placeOf.get(node.id) ?? -1,
      }))

      // Each subtree WHOLE, and each node once: a member nested inside another member is already
      // carried by it, and taking it twice would put it in the array twice.
      const taken = new Set<string>()
      const carried: SceneNode[] = []
      for (const node of moving) {
        const own = new Set(subtreesOf(state.nodes, [node.id]).map(one => one.id))
        for (const one of state.nodes) {
          if (!own.has(one.id) || taken.has(one.id)) continue
          taken.add(one.id)
          carried.push(one.id === node.id ? { ...one, parentId } : one)
        }
      }

      const rest = state.nodes.filter(one => !taken.has(one.id))
      const before = rest.filter(one => one.parentId === parentId)[index]
      // Past the last sibling is the end of the level, and the array's end is a place no sibling
      // comes after — the batch having left, nothing of it is stranded there.
      const target = before === undefined ? rest.length : rest.indexOf(before)

      return { ...state, nodes: [...rest.slice(0, target), ...carried, ...rest.slice(target)] }
    },
    // Each back where it was taken from, lowest index first: putting them back in that order
    // rebuilds the array the batch left. A subtree that was SCATTERED comes back gathered — the
    // same tree, since a level is read by `parentId`.
    revert: state =>
      previous === null
        ? state
        : [...previous]
            .sort((one, other) => one.at - other.at)
            .reduce((current, back) => lifted(current, back.id, back.parentId, back.at), state),
  }
}

/**
 * 🛑 The subtree travels WHOLE: dragging a group past its own children would otherwise leave it
 * BEHIND them in the array, and a parent that trails its children is the one property the rest of
 * the engine reads this array for.
 */
function lifted(state: SceneState, id: string, parentId: string | null, at: number): SceneState {
  const moving = new Set(subtreesOf(state.nodes, [id]).map(one => one.id))
  const rest = state.nodes.filter(one => !moving.has(one.id))
  const carried = state.nodes
    .filter(one => moving.has(one.id))
    .map(one => (one.id === id ? { ...one, parentId } : one))

  return { ...state, nodes: [...rest.slice(0, at), ...carried, ...rest.slice(at)] }
}

/**
 * Puts a group over the selected nodes, and hangs them from it.
 *
 * Only the roots of the selection move: a node whose own parent is selected too is already
 * carried along, and moving it as well would flatten the subtree it was part of.
 *
 * The group lands where the selection already lived when they share a parent, and at the scene
 * when they do not: grouping two children of a group must not lift them out of it.
 */
export function groupNodes(nodes: readonly SceneNode[], id = newId()): Command<SceneState> {
  const roots = rootsOf(nodes)
  const shared = roots.every(node => node.parentId === roots[0]?.parentId)
  const group = { ...groupNode(), id, parentId: shared ? (roots[0]?.parentId ?? null) : null }

  return multi(commandId('group', [group.id]), [
    addNode(group),
    ...roots.map(node => reparentNode(node.id, group.id)),
  ])
}

/**
 * Folds a selection into one solid, and takes the nodes it was cut from out of the scene.
 *
 * The matter is `carvePlan`'s to elect and the ORDER OF THE CLICKS says nothing: the solid stands
 * where the matter stood, wears its material and hangs from its parent, so the cut reads as the
 * wall gaining a window rather than a new object appearing. `matterId` forces the election for
 * the rare case a hand means the other way round; `null` when fewer than two nodes carry a shape.
 */
export function carveNodes(
  picked: readonly SceneNode[],
  operation: CsgOperation,
  all: readonly SceneNode[],
  matterId?: string,
): Command<SceneState> | null {
  if (!canCarve(picked)) return null
  // ONE sweep of the scene for the whole fold: the election and the recipe both walk it, and
  // each used to build its own index.
  const scene = carveScene(picked, all)
  const plan = carvePlan(scene, operation, matterId)
  // A `matterId` naming nothing in the selection: refused rather than quietly elected otherwise.
  if (!plan) return null

  const { matter, tools } = plan
  const solid = carvedNode(carveGraph(matter, tools, scene.byId), {
    // Without the matter's SCALE, which travelled into the base brush — see `carveGraph`, where
    // keeping it here is what sheared a turned tool.
    transform: { ...matter.transform, scale: { x: 1, y: 1, z: 1 } },
    material: matter.material,
    parentId: matter.parentId,
    name: matter.name,
  })

  return multi(commandId('carve', [solid.id]), [
    addNode(solid),
    // Their subtrees with them: a child left hanging from a node the scene no longer holds is
    // dropped by `flattenTree` — invisible in the outliner, still written to the file.
    removeNodes(all, [matter.id, ...tools.map(tool => tool.node.id)]),
  ])
}

/**
 * Marks shapes as tools for the next boolean, or takes the mark off — Roblox's Negate.
 *
 * Nodes carrying no shape are skipped rather than given a flag nothing would read, exactly as
 * `setShadowOn` skips a light.
 */
export function setNodesNegative(
  picked: readonly SceneNode[],
  negative: boolean,
): Command<SceneState> {
  // Not `batch`: the flag lives on the carvable half of a node, which no shared patch reaches.
  const marked = [...new Set(picked.filter(isCarvable).map(node => node.id))]

  return sweep(
    commandId('negate', marked),
    marked.map(id => ({
      id,
      edit: (node: SceneNode) => (isCarvable(node) ? { ...node, negative } : null),
    })),
  )
}

/**
 * The same, decided from what is already marked — one button doing both, since a toolbar button
 * has no room to say which of the two it means. A selection wholly marked comes back unmarked;
 * anything else is marked, so a half-marked selection finishes the job rather than undoing it.
 */
export function negateNodes(picked: readonly SceneNode[]): Command<SceneState> {
  return setNodesNegative(picked, !allNegative(picked))
}

/**
 * Undoes a fold: the solid goes, and the brushes it was cut from come back as meshes — each with
 * the shape, the placement AND the material it wore before. What comes back is what the GRAPH
 * kept, which is the whole point of ADR-25: a mesh alone could not be taken apart again.
 */
export function separateNode(node: CarvedNode): Command<SceneState> {
  return multi(commandId('separate', [node.id]), [
    ...brushesOf(node).map(brush => addNode(brush)),
    removeNode(node.id),
  ])
}

/**
 * The same fold, run the OTHER WAY — one gesture to repair a cut that came out inverted, with no
 * undo and nothing to understand. The brushes come back exactly as `separateNode` gives them and
 * are folded again with the first TOOL for matter; the roles swap through the marks, so
 * `carvePlan` stays the one place that reads them. `null` for a solid of a single brush.
 */
export function invertCarve(
  node: CarvedNode,
  all: readonly SceneNode[],
): Command<SceneState> | null {
  const brushes = brushesOf(node)
  const [was, next] = brushes
  if (!was || !next) return null

  const swapped = brushes.map(brush =>
    brush === was ? withNegative(brush, true) : brush === next ? withNegative(brush, false) : brush,
  )
  const scene = all.filter(one => one.id !== node.id).concat(swapped)
  const folded = carveNodes(swapped, node.carved.steps[0]?.operation ?? 'subtract', scene, next.id)
  if (!folded) return null

  return multi(commandId('invertCarve', [node.id]), [
    ...swapped.map(brush => addNode(brush)),
    removeNode(node.id),
    folded,
  ])
}

function withNegative(node: SceneNode, negative: boolean): SceneNode {
  return isCarvable(node) ? { ...node, negative } : node
}

/**
 * The shapes a solid was cut from, standing where the cut had them. A brush that was SUBTRACTED
 * comes back MARKED, so folding the same selection again gives the same solid whichever button is
 * pressed — DERIVED from the verb, not restored: a plain Percer with no marks hands its tool back
 * red, and an `intersect` fold hands back nothing marked at all.
 */
function brushesOf(node: CarvedNode): SceneNode[] {
  const parts = [
    { part: node.carved.base, negative: false },
    ...node.carved.steps.map(step => ({
      part: step.part,
      negative: step.operation === 'subtract',
    })),
  ]

  return parts.map(({ part, negative }) => {
    // In the solid's frame, so a brush lands back where the cut had it standing.
    const transform = placedIn(node.transform, part.transform)
    const born = { material: part.material, parentId: node.parentId, name: part.name, negative }

    // A brush that carried a RECIPE comes back a solid, not a mesh: separating once must not
    // flatten the cuts already made inside it.
    return isCsgGraph(part.geometry)
      ? carvedNode(part.geometry, { ...born, transform })
      : { ...meshNode(part.geometry, born), transform }
  })
}

function hang(state: SceneState, id: string, parentId: string | null): SceneState {
  return {
    ...state,
    nodes: state.nodes.map(node => (node.id === id ? { ...node, parentId } : node)),
  }
}

/**
 * Copies of the given nodes, with fresh ids and their parents rewritten to point at the copies.
 *
 * A subtree is duplicated whole: copying a group has to copy what hangs from it, and a child
 * whose `parentId` still named the original would end up shared between the two — moving one
 * would move the other's child. What falls outside the set keeps its parent, which is what puts
 * a copy beside its original rather than at the root.
 */
