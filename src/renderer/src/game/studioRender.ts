import { clamp } from '@shared/numeric'
import { copyTransform, sameCameraView, sameTransform } from '@shared/domain/transform'
import type { CameraView, EntityPlacement, RenderPort } from '@game/ports/renderPort'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { SceneNode, SceneState } from '@/engines/scene/sceneState'
import type { RuntimePerformance } from '@shared/domain/gameRuntime'

/**
 * The one thing a running game asks of the viewport. Narrowed to it rather than taking the whole
 * engine: a test then drives this without a WebGL context, and nothing here can reach for the
 * rest of a 4 300-line class by accident.
 */
export type SceneDraw = Pick<
  SceneRenderer,
  'apply' | 'placeView' | 'releaseView' | 'viewPlacement'
> & {
  applyRuntimeTransforms?: SceneRenderer['applyRuntimeTransforms']
  runtimePerformance?: () => Omit<RuntimePerformance, 'cpuFrameMs' | 'compilationMs'>
}

function updateShadow(
  placements: readonly EntityPlacement[],
  byId: ReadonlyMap<string, SceneNode>,
  bakedById: ReadonlyMap<string, string>,
  shadow: Map<string, SceneNode>,
): SceneNode[] | null {
  let changed: SceneNode[] | null = null
  for (const placement of placements) {
    const bakedId = bakedById.get(placement.entity)
    const node = byId.get(bakedId ?? placement.entity)
    if (!node) continue
    const bakedChanged = bakedId ? updateBakedShadow(placement, bakedId, node, shadow) : null
    if (bakedChanged !== null) {
      const shown = shadow.get(bakedId ?? placement.entity)
      if (bakedChanged && shown) (changed ??= []).push(shown)
      continue
    }
    const shown = shadow.get(placement.entity) ?? node
    if (sameTransform(shown.transform, placement.transform)) continue
    const moved = { ...node, transform: copyTransform(placement.transform) }
    shadow.set(placement.entity, moved)
    ;(changed ??= []).push(moved)
  }
  return changed
}

function updateBakedShadow(
  placement: EntityPlacement,
  bakedId: string,
  node: SceneNode,
  shadow: Map<string, SceneNode>,
): boolean | null {
  if (node.type !== 'mesh' || !node.instances) return null
  const shown = shadow.get(bakedId) ?? node
  if (shown.type !== 'mesh' || !shown.instances) return null
  const instance = shown.instances.find(one => one.sourceId === placement.entity)
  if (!instance || sameTransform(instance.transform, placement.transform)) return false
  shadow.set(bakedId, {
    ...shown,
    instances: shown.instances.map(one =>
      one.sourceId === placement.entity
        ? { ...one, transform: copyTransform(placement.transform) }
        : one,
    ),
  })
  return true
}

/**
 * What draws a running game inside the studio: the scene the editor already has, redrawn from a
 * SHADOW state the document knows nothing about.
 *
 * Supported mesh/model poses take the incremental renderer path. A changed document or an
 * unsupported batch keeps full apply. The renderer still finalizes animation, aids and shadows;
 * this does not make all frame work proportional to the number of moved nodes.
 *
 * 🛑 It never writes to the store. That is the whole of why STOP restores nothing: one `apply` of
 * the untouched edit state puts the viewport back where it was.
 */
export function createStudioRender(
  renderer: SceneDraw,
  editState: () => SceneState,
  /** Told how far the picture is veiled, for a host that has something to veil it with. */
  onVeil: (amount: number) => void = () => {},
): RenderPort {
  const shadow = new Map<string, SceneNode>()
  const watched: CameraView = { position: NOWHERE, target: NOWHERE }
  let byId = new Map<string, SceneNode>()
  let bakedById = new Map<string, string>()
  let source: SceneState | null = null
  let veiled = 0

  return {
    place: (placements: readonly EntityPlacement[]) => {
      const state = editState()
      let changed = false
      const rebased = state !== source

      if (state !== source) {
        // 🛑 The document changed under a running game — a click on a node is one, the selection
        // being part of the state — and the viewport has just applied it OVER what the game had
        // drawn. The shadow is rebuilt on the new nodes, keeping where the game had put them, and
        // repainted at once: without that a PAUSED game snaps back to the authored pose and stays
        // there, since nothing moves to trigger a redraw.
        source = state
        byId = new Map(state.nodes.map(node => [node.id, node]))
        bakedById = new Map(
          state.nodes.flatMap(node =>
            node.type === 'mesh' && node.instances
              ? node.instances.map(instance => [instance.sourceId, node.id])
              : [],
          ),
        )
        for (const [id, held] of shadow) {
          const fresh = byId.get(id)
          if (fresh) shadow.set(id, { ...fresh, transform: held.transform })
          else shadow.delete(id)
        }
        changed = shadow.size > 0
      }

      const updates = updateShadow(placements, byId, bakedById, shadow)

      // Nothing rebuilt while nothing moves: a paused game, or one whose systems are all idle,
      // costs the comparison above and not one allocation.
      if (changed || updates) {
        if (!rebased && updates && renderer.applyRuntimeTransforms?.(updates)) return
        renderer.apply({ ...state, nodes: state.nodes.map(node => shadow.get(node.id) ?? node) })
      }
    },

    // Nothing means `orbit`: the scene is flown by hand, and a camera written every frame would
    // fight whoever is dragging it. A view that has not MOVED is dropped too — `placeView` asks
    // for a frame, so a character standing still would repaint the viewport sixty times a second.
    view: (wanted: CameraView | null) => {
      if (!wanted || sameCameraView(watched, wanted)) return
      watched.position = { ...wanted.position }
      watched.target = { ...wanted.target }
      watched.fieldOfView = wanted.fieldOfView
      renderer.placeView(wanted)
    },

    /**
     * 🛑 Written on the SESSION rather than into the document: a veil is how a game is being
     * watched at this instant, and one written into the scene would put an undo entry per frame
     * of a fade — the very reason the playhead is not in the document either.
     */
    veil: amount => {
      const wanted = clamp(amount, 0, 1)
      if (wanted === veiled) return
      veiled = wanted
      onVeil(wanted)
    },
  }
}

/** Off the scene, so the first view a game asks for is never mistaken for the one already held. */
const NOWHERE = { x: Number.NaN, y: Number.NaN, z: Number.NaN }
