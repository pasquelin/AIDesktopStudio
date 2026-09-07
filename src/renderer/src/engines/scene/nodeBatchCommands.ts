import { changedFields } from '@/helpers/objects'
import {
  isVector3,
  type GeometryDescriptor,
  type LightDescriptor,
  type MaterialDescriptor,
} from '@shared/domain/scene'
import { isRecord } from '@shared/guards'
import { commandId, composed, type Command } from '../core/history'
import {
  editNode,
  setGeometry,
  setLight,
  setNodeMaterial,
  sweep,
  type NodeEdit,
} from './nodeEditCommands'
import { withField, type FieldValue } from './propertyFields'
import {
  canCastShadow,
  canReceiveShadow,
  carriesMaterial,
  type OptimizationSettings,
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
export function multi(id: string, commands: Command<SceneState>[]): Command<SceneState> {
  return composed(id, commands)
}

/**
 * The same edit run over a selection, as one entry in the history: three nodes nudged together
 * must cost one ⌘Z, not three. A node the edit does not apply to answers `null` and is skipped.
 *
 * The id names the nodes rather than the count, so a gesture that keeps editing the same
 * selection keeps coalescing — and a selection of one produces the very id the single-node
 * command would have, which is what leaves the common case untouched.
 *
 * A `NodeEdit` and not a `Command`, so the whole selection is held to ONE sweep by the compiler:
 * an edit that writes somewhere other than a node — a lens keyed onto a track — has to compose
 * itself under `multi`, and say so where it is written.
 */
export function batch<T extends { id: string }>(
  label: string,
  targets: readonly T[],
  make: (target: T) => NodeEdit | null,
): Command<SceneState> {
  return sweep(
    commandId(
      label,
      targets.map(target => target.id),
    ),
    targets.flatMap(target => make(target)?.writes ?? []),
  )
}

export function setNodesOptimization(
  nodes: readonly SceneNode[],
  optimization: OptimizationSettings | undefined,
): Command<SceneState> {
  return batch('optimization', nodes, node => editNode('optimization', node.id, { optimization }))
}

type ShadowPatch = Partial<Pick<SceneNode, 'castShadow' | 'receiveShadow'>>

function refusesShadow(node: SceneNode, changes: ShadowPatch): boolean {
  if (changes.receiveShadow !== undefined && !canReceiveShadow(node)) return true
  return changes.castShadow !== undefined && !canCastShadow(node)
}

export function setShadowOn(
  nodes: readonly SceneNode[],
  changes: ShadowPatch,
): Command<SceneState> {
  return batch('shadow', nodes, node =>
    refusesShadow(node, changes) ? null : editNode('shadow', node.id, changes),
  )
}

/**
 * A geometry parameter typed into the inspector, written onto every selected mesh built from the
 * same primitive. A box has no radius, and `withField` writes by computed key without checking —
 * so a node of another kind is left alone rather than silently given a field it never had.
 */
export function setGeometryOn(
  nodes: readonly SceneNode[],
  anchor: GeometryDescriptor,
  name: string,
  value: FieldValue,
): Command<SceneState> {
  return batch('geometry', nodes, node =>
    node.type === 'mesh' && node.geometry.kind === anchor.kind
      ? setGeometry(
          node.id,
          withField(node.geometry, name, spread(anchor, node.geometry, name, value)),
        )
      : null,
  )
}

/** The same, for a light. Kinds differ in what they even have to set. */
export function setLightOn(
  nodes: readonly SceneNode[],
  anchor: LightDescriptor,
  name: string,
  value: FieldValue,
): Command<SceneState> {
  return batch('light', nodes, node =>
    node.type === 'light' && node.light.kind === anchor.kind
      ? setLight(node.id, withField(node.light, name, spread(anchor, node.light, name, value)))
      : null,
  )
}

/**
 * The value to write on one node of a selection. A vector field reports all three axes though the
 * user moved one, so only the axes that differ from the anchor's are carried — otherwise nudging
 * the X of a spot's target would drop every other spot's Y and Z onto the anchor's.
 */
function spread(anchor: object, target: object, name: string, value: FieldValue): FieldValue {
  if (!isVector3(value)) return value

  const before = readField(anchor, name)
  const here = readField(target, name)
  if (!isVector3(before) || !isVector3(here)) return value
  return { ...here, ...changedFields(before, value) }
}

function readField(descriptor: object, name: string): unknown {
  return isRecord(descriptor) ? descriptor[name] : undefined
}

/**
 * Material fields onto every selected mesh. Only what the inspector moved is carried: the whole
 * descriptor would take the anchor's texture slots with it, onto meshes that never showed them.
 *
 * Keeps the bare shape beside `setMeshMaterial`, and that is a decision: only ONE engine
 * publishes this name, so nothing can auto-import the wrong one. A domain is added the day a
 * second claims the word — never for symmetry with a neighbour that needed it.
 */
export function setMaterialOn(
  nodes: readonly SceneNode[],
  changes: Partial<MaterialDescriptor>,
): Command<SceneState> {
  return batch('material', nodes, node => {
    // A text and a solid are lit exactly as a mesh is, and wear the same descriptor — so one
    // section of the inspector serves the three, and none has to know the others exist.
    if (!carriesMaterial(node)) return null
    return setNodeMaterial(node.id, { ...node.material, ...changes })
  })
}

/**
 * A rail rewritten. The three gestures a rail offers — move a point, add one, drop one — all
 * land here, because each of them is the same node holding another list of points.
 */
