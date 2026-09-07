import { sameValues } from '@/helpers/objects'
import {
  withComponent,
  withoutComponent,
  type ComponentType,
  type JsonValue,
} from '@shared/domain/component'
import { newComponent, withComponentField } from '@shared/domain/componentRegistry'
import {
  type GeometryDescriptor,
  type LightDescriptor,
  type MaterialDescriptor,
  type Transform,
} from '@shared/domain/scene'
import { type Command } from '../core/history'
import {
  carriesMaterial,
  hasChildren,
  rotationShows,
  withAxisLock,
  withoutLockedAxes,
  type AxisLock,
  type SceneNode,
  type SceneNodeBase,
  type SceneNodeType,
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
export function editNode(
  label: string,
  id: string,
  changes: NodePatch | ((node: SceneNode, state: SceneState) => NodePatch),
): NodeEdit {
  const wanted = (node: SceneNode, state: SceneState): NodePatch =>
    typeof changes === 'function' ? changes(node, state) : changes

  return sweep(`${label}:${id}`, [
    {
      id,
      edit: (node, state) => ({ ...node, ...wanted(node, state) }),
      /**
       * 🛑 An edit that writes what the node already carries costs a ⌘Z that moves nothing — the
       * defect `refuses` exists for. Measured on the bench pass of 2026-08-25: a client sent one
       * transform three times, then had to undo three times to take one change back.
       */
      refuses: (node, state) =>
        Object.entries(wanted(node, state)).every(([key, value]) =>
          sameValues(value, node[key as keyof SceneNode]),
        ),
    },
  ])
}

/**
 * Where a node stands, how it is turned and how big it is.
 *
 * An angle `rotationShows` refuses is dropped, and the rest of the move written: the value would
 * sit in the document and cost an undo without the screen ever moving. Dropped rather than the
 * whole edit refused — a pivot drag over a mixed selection carries the sprite through space, and
 * *that* shows.
 */
export function setTransform(id: string, next: Transform): NodeEdit {
  return editNode('transform', id, (node, state) => {
    // Held axes first, so a padlock answers the viewport handle as it answers the field: both
    // write through here, and only here can refuse for both.
    const allowed = withoutLockedAxes(state, id, node.transform, next)

    return {
      transform: rotationShows(node, () => hasChildren(state.nodes, id))
        ? allowed
        : { ...allowed, rotation: node.transform.rotation },
    }
  })
}

/**
 * Holds one axis still, or lets it go. Written through `replace` rather than as a command by
 * whoever calls it: a padlock is a way of editing, not an edit, and ⌘Z should not take it back.
 */
export function withAxisHeld(state: SceneState, lock: AxisLock, held: boolean): SceneState {
  return { ...state, lockedAxes: withAxisLock(state.lockedAxes ?? [], lock, held) }
}

export function setNodeVisible(id: string, visible: boolean): NodeEdit {
  return editNode('visible', id, { visible })
}

/**
 * Hangs a node on one of its parent's attachment points, or takes it off — `null` lets it hang
 * from the character itself again.
 */
export function attachNode(id: string, socket: string | null): NodeEdit {
  return editNode('attach', id, socket === null ? { attach: undefined } : { attach: { socket } })
}

export function renameNode(id: string, name: string): NodeEdit {
  return editNode('rename', id, { name })
}

/**
 * Whether the selected nodes throw a shadow, or catch the ones others throw.
 *
 * A light catches nothing, so it is skipped rather than given a flag the renderer would ignore:
 * with a mesh and a light selected together, the inspector hides the row but the command would
 * otherwise still write it into the document and into the history.
 */
export function setGeometry(id: string, geometry: GeometryDescriptor): NodeEdit {
  return editPart('geometry', id, 'mesh', { geometry })
}

export function setMeshMaterial(id: string, material: MaterialDescriptor): NodeEdit {
  return editPart('material', id, 'mesh', { material })
}

/**
 * The material of whatever wears one — a mesh, a text or a solid.
 *
 * Keyed on the FIELD rather than on the type, unlike `editPart`: three node kinds hold the same
 * descriptor, and a command per kind is how the solid came to be paintable nowhere.
 */
export function setNodeMaterial(id: string, material: MaterialDescriptor): NodeEdit {
  return sweep(`material:${id}`, [
    { id, edit: node => (carriesMaterial(node) ? { ...node, material } : null) },
  ])
}

/**
 * Gives an object something to DO while the game runs. Refused when it already carries one of
 * that type — a second `Health` would leave the winner to whichever system read first, and an
 * attach that overwrote the first would throw away what the author typed into it.
 */
export function attachComponent(id: string, type: ComponentType): NodeEdit {
  return editNode('component.add', id, node =>
    (node.components ?? []).some(component => component.type === type)
      ? {}
      : { components: [...(node.components ?? []), newComponent(type)] },
  )
}

/** Refused on an object that has not got one: an empty patch costs no entry in the history. */
export function detachComponent(id: string, type: ComponentType): NodeEdit {
  return editNode('component.remove', id, node =>
    (node.components ?? []).some(component => component.type === type)
      ? { components: withoutComponent(node.components ?? [], type) }
      : {},
  )
}

/**
 * One field of one component. Labelled by the field, so a drag on the speed coalesces into one
 * history entry while a change of axis right after stays a step of its own.
 */
export function setComponentField(
  id: string,
  type: ComponentType,
  key: string,
  value: JsonValue,
): NodeEdit {
  return editNode(`component.${type}.${key}`, id, node => {
    const held = (node.components ?? []).find(component => component.type === type)
    if (!held) return {}

    return {
      components: withComponent(node.components ?? [], withComponentField(held, key, value)),
    }
  })
}

export function setLight(id: string, light: LightDescriptor): NodeEdit {
  return editPart('light', id, 'light', { light })
}

/**
 * Only the fields every node shares: patching a discriminated field would let a light take a
 * geometry, which is exactly what the union exists to forbid.
 */
type NodePatch = Partial<
  Pick<
    SceneNode,
    | 'name'
    | 'visible'
    | 'transform'
    | 'castShadow'
    | 'receiveShadow'
    | 'components'
    | 'attach'
    | 'optimization'
  >
>

/** What one edit writes on one node, and `null` when the node is not its business. */
type NodeWrite = {
  id: string
  edit: (node: SceneNode, state: SceneState) => SceneNode | null
  /** `Command.refuses`. A node the scene no longer holds is never asked, and counts as refusing. */
  refuses?: (node: SceneNode, state: SceneState) => boolean
}

/**
 * An edit that also says what it writes node by node, so several of them fold into ONE pass. A
 * `Command` all the same: nothing holding one has to know it composes. **Built by `sweep` alone**
 * — `batch` keeps the writes and drops the command around them, so one made by hand would be
 * half-applied, and no type says otherwise.
 */
export type NodeEdit = Command<SceneState> & { writes: readonly NodeWrite[] }

/**
 * The discriminated half of one node, replaced. Keyed by `type`: `type` is what forbids a light
 * from holding a geometry, and a node of another kind is left alone rather than given a field its
 * shape has no room for.
 */
export function editPart<T extends SceneNodeType>(
  label: string,
  id: string,
  type: T,
  changes: Partial<Omit<Extract<SceneNode, { type: T }>, keyof SceneNodeBase | 'type'>>,
): NodeEdit {
  return sweep(`${label}:${id}`, [
    { id, edit: node => (node.type === type ? { ...node, ...changes } : null) },
  ])
}

/**
 * ONE pass over the scene however many nodes an edit touches. Through `multi`, `refuses`, `apply`
 * and `revert` each cost a `find` and a `map` of the WHOLE scene per node, and a drag pays them
 * on every image it emits: moving 200 nodes of 40 000 took 76.30 ms an image, against 0.77 here.
 *
 * Two things `composed` did differently, and nothing guards either. The node is captured WHOLE
 * rather than the fields written — safe only because the history is a linear stack. And every
 * write reads the scene as it stood BEFORE the pass, where `composed` fed each part the state the
 * one before it returned: an edit reading a sibling it also writes would read a stale value here.
 */
export function sweep(id: string, writes: readonly NodeWrite[]): NodeEdit {
  const byId = new Map(writes.map(write => [write.id, write]))
  // `composed` refused only when EVERY part did, so one part with no opinion settles it without
  // the scene being walked at all.
  const askable = writes.every(write => write.refuses)
  let previous: ReadonlyMap<string, SceneNode> = new Map()

  return {
    id,
    writes,
    // Asked AS the scene is walked, and the walk ends twice over: at the first node still worth
    // editing, and at the last one asked. Without the second, re-sending the value a single node
    // already carries — an eye clicked back, a drag on a held axis — reads 40 000 rows to say no.
    refuses: state => {
      if (writes.length === 0) return true
      if (!askable) return false

      let asked = 0
      for (const node of state.nodes) {
        const write = byId.get(node.id)
        if (!write) continue
        if (write.refuses?.(node, state) === false) return false

        asked += 1
        if (asked === byId.size) break
      }
      return true
    },
    // The scene is copied only once something is written: an edit meeting nothing it can act on
    // hands back the state itself rather than a fresh array of forty thousand.
    apply: state => {
      const taken = new Map<string, SceneNode>()
      let nodes: SceneNode[] | null = null

      for (let at = 0; at < state.nodes.length; at += 1) {
        const node = state.nodes[at]
        if (!node) continue
        const written = byId.get(node.id)?.edit(node, state)
        if (!written) continue

        nodes ??= [...state.nodes]
        nodes[at] = written
        taken.set(node.id, node)
      }

      previous = taken
      return nodes ? { ...state, nodes } : state
    },
    revert: state =>
      previous.size === 0
        ? state
        : { ...state, nodes: state.nodes.map(node => previous.get(node.id) ?? node) },
  }
}

/** One entry in the history for what the user did in one gesture — see `composed`. */
