import { newId } from '@/helpers/ids'
import { applySelection, deselect, deselectAll, type SelectionMode } from '@/helpers/selection'
import { type SceneWorld } from '@shared/domain/scene'
import { commandId, type Command } from '../core/history'
import { batch } from './nodeBatchCommands'
import { setTransform } from './nodeEditCommands'
import { bringsSecondPlayer, tearsPlayerApart } from './playerModule'
import { subtreesOf, type NodeMove, type SceneNode, type SceneState } from './sceneState'

/**
 * Scene edits, reimplemented in TypeScript from `mrdoob/three.js/editor/js/commands/` (MIT).
 * The structure is what was worth taking; the original is untyped JavaScript built on its own
 * `signals` bus.
 *
 * A command captures what it needs to revert **as it is applied**, not as it is built: what an
 * object looked like before is only known once the edit actually runs. Redo re-applies and
 * re-captures, so a command survives being replayed.
 */
export function addNode(node: SceneNode): Command<SceneState> {
  return addNodes([node])
}

export function removeNode(id: string): Command<SceneState> {
  let removed: SceneNode | null = null
  let index = -1

  return {
    id: `remove:${id}`,
    // Through `refuses` like its plural twin, never by handing the state back: a refusal pushed
    // as a step is a ⌘Z that does nothing, and a redo stack emptied for an edit that never ran.
    refuses: state => tearsPlayerApart(state.nodes, [id]),
    apply: state => {
      index = state.nodes.findIndex(node => node.id === id)
      if (index < 0) return state
      removed = state.nodes[index] ?? null
      return {
        ...state,
        nodes: state.nodes.filter(node => node.id !== id),
        selectedIds: deselect(state.selectedIds, id),
      }
    },
    revert: state => {
      if (!removed || index < 0) return state
      const nodes = [...state.nodes]
      // Back at its original index: re-appending would silently reorder the outliner.
      nodes.splice(index, 0, removed)
      return { ...state, nodes }
    },
  }
}

/**
 * One shape for every edit of a shared field. What to write may be a function of the node and the
 * scene around it, which only the sweep holds: a command is replayed on redo, so a rule about the
 * scene has to be read at each `apply` rather than frozen into the closure.
 */
export function copiesOf(nodes: readonly SceneNode[], picked: readonly SceneNode[]): SceneNode[] {
  const carried = subtreesOf(
    nodes,
    picked.map(node => node.id),
  )
  const fresh = carried.map(node => ({ node, id: newId() }))
  const renamed = new Map(fresh.map(({ node, id }) => [node.id, id]))

  return fresh.map(({ node, id }) => {
    const instances =
      node.type === 'mesh' && node.instances
        ? node.instances.map(instance => ({ ...instance, sourceId: newId() }))
        : undefined

    return {
      ...node,
      id,
      parentId: node.parentId === null ? null : (renamed.get(node.parentId) ?? node.parentId),
      ...(instances ? { instances } : {}),
    }
  })
}

/**
 * The same copies, with any parent the destination does not hold cut loose.
 *
 * `copiesOf` keeps a parent that falls outside the set, which is what lands a duplicate beside
 * its original. Pasted into another scene, that parent names nothing: the outliner drops a node
 * whose parent is missing while the viewport still draws it, and it becomes unreachable.
 */
export function rootedIn(
  copies: readonly SceneNode[],
  nodes: readonly SceneNode[],
): readonly SceneNode[] {
  const known = new Set([...nodes, ...copies].map(node => node.id))

  return copies.map(copy =>
    copy.parentId !== null && !known.has(copy.parentId) ? { ...copy, parentId: null } : copy,
  )
}

/**
 * Puts copies of the given nodes into the scene, and selects them — what was just made is what
 * the next gesture acts on, in every editor there is.
 */
export function addNodes(copies: readonly SceneNode[]): Command<SceneState> {
  return {
    id: commandId(
      'add',
      copies.map(node => node.id),
    ),
    // 🛑 Here and not at each door: a paste, a ⌘D, a prefab and a template all arrive through
    // this one, and three of them never knew to ask. Which module plays would go back to order.
    refuses: state => copies.length > 0 && bringsSecondPlayer(state.nodes, copies),
    // Nothing to put down clears no selection: an empty add is a no-op, not a deselect.
    apply: state =>
      copies.length === 0
        ? state
        : {
            ...state,
            nodes: [...state.nodes, ...copies],
            selectedIds: copies.map(copy => copy.id),
          },
    revert: state => {
      // A Set rather than a scan per node: a prefab of 200 put down in a scene of 1 000 made ⌘Z
      // walk 200 000 comparisons.
      const added = new Set(copies.map(copy => copy.id))
      return {
        ...state,
        nodes: state.nodes.filter(node => !added.has(node.id)),
        selectedIds: copies.reduce((ids, copy) => deselect(ids, copy.id), state.selectedIds),
      }
    },
  }
}

/** Deleting a selection is one gesture, so it is one entry in the history. */
export function removeNodes(
  nodes: readonly SceneNode[],
  ids: readonly string[],
): Command<SceneState> {
  // The whole subtree, not the picked rows: a child left behind would hang from a parent the
  // scene no longer holds, and `flattenTree` drops an orphan rather than promoting it.
  const doomed = new Set(subtreesOf(nodes, ids).map(node => node.id))
  let taken: { at: number; node: SceneNode }[] = []

  return {
    id: commandId('remove', ids),
    // What `multi` of one command per node gave for free: `[].every()` is true, so a delete that
    // reaches nothing refused. Without it ⌘Z gains a step that does nothing, and the redo stack
    // is cleared for an edit that never happened.
    // 🛑 A module standing without its body or its eye is a scene whose camera falls back on the
    // sweep — the arbitration the module exists to replace, reintroduced by a plain Delete.
    refuses: state => doomed.size === 0 || tearsPlayerApart(state.nodes, ids),
    // ONE sweep, not one `removeNode` per doomed node — each of those scans the scene twice.
    apply: state => {
      taken = []
      const kept: SceneNode[] = []
      for (let at = 0; at < state.nodes.length; at += 1) {
        const node = state.nodes[at]
        if (!node) continue
        if (doomed.has(node.id)) taken.push({ at, node })
        else kept.push(node)
      }
      if (taken.length === 0) return state

      // `deselectAll` rather than a filter: it hands back the SAME array when nothing was
      // selected, and everything watching the selection re-renders on a fresh one.
      return { ...state, nodes: kept, selectedIds: deselectAll(state.selectedIds, doomed) }
    },
    // Merged rather than spliced back one by one: a `splice` shifts everything after it, so
    // undoing 16 000 rows out of 40 000 cost 33.9 ms — past what an image is worth — against 0.21
    // flat here. `taken` is ascending, which is what lets the two lists merge.
    revert: state => {
      if (taken.length === 0) return state

      const nodes: SceneNode[] = []
      let kept = 0
      const keep = (): void => {
        const node = state.nodes[kept]
        if (node) nodes.push(node)
        kept += 1
      }
      for (const { at, node } of taken) {
        while (nodes.length < at && kept < state.nodes.length) keep()
        nodes.push(node)
      }
      while (kept < state.nodes.length) keep()
      return { ...state, nodes }
    },
  }
}

/** Where a drag left every node it carried. One drag, one entry, however many nodes moved. */
export function moveNodes(moves: readonly NodeMove[]): Command<SceneState> {
  return batch('transform', moves, move => setTransform(move.id, move.transform))
}

/**
 * What lights the scene and what hangs behind it. In the history like any other edit of the
 * document: choosing a sky is a decision about the scene, and ⌘Z has to take it back like the rest.
 *
 * A patch rather than a whole world, so a preset writing five fields and a slider writing one are
 * the same call — and so a field this build does not know is left exactly as the file spelled it.
 */
export function setWorld(patch: Partial<SceneWorld>): Command<SceneState> {
  let previous: SceneWorld | null = null

  return {
    // Named by what moved, so a drag of one slider coalesces with itself and not with the next.
    // Ordered by code point rather than by language: these are field names, not words on screen.
    id: `world:${Object.keys(patch)
      .sort((left, right) => (left < right ? -1 : 1))
      .join(',')}`,
    apply: state => {
      previous = state.world
      return { ...state, world: { ...state.world, ...patch } }
    },
    revert: state => (previous ? { ...state, world: previous } : state),
  }
}

/** Selection stays out of the history: nobody wants ⌘Z to give them back a selection. */
export function setSelection(
  state: SceneState,
  ids: readonly string[],
  mode: SelectionMode = 'replace',
): SceneState {
  return { ...state, selectedIds: applySelection(state.selectedIds, ids, mode) }
}
