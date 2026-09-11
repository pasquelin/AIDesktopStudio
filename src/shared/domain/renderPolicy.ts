import { isRecord, oneOf, readBoolean, readNumber } from '../guards'
import { RENDER_ENGINES, type RenderEngine } from './renderEngine'
import { SHADOW_QUALITIES, type ShadowQuality } from './scene'
import { VIEWPORT_QUALITIES, type ViewportQuality } from './sceneViewport'

/**
 * What one image COSTS, read by BOTH engines that draw the same scene — the editor's viewport and
 * an exported game.
 *
 * Carried by an export so a game shows what its author saw. The two decided it apart until now,
 * and nothing compared them: the editor drew every shadow at a size its quality level capped,
 * while an exported game drew none at all and paid the screen's whole pixel ratio.
 */
export type RenderPolicy = {
  /**
   * Which engine draws the frame. Read once, when a viewport builds its renderer: there is no
   * switching a mounted one, the whole scene living inside a GPU context that cannot be handed
   * over. A machine with no WebGPU adapter falls back to `gl` and says so — see `renderDriver`.
   */
  engine: RenderEngine
  shadows: boolean
  shadowQuality: ShadowQuality
  /** Side of the square map each casting light allocates, before the quality level caps it. */
  shadowMapSize: number
  /**
   * Whether a sun's shadow is split into cascades — one map per depth band of the view rather
   * than one map over the whole set. What an open world needs and a single set never does: the
   * one map a directional light owns is stretched over the whole frustum, so a distance that
   * doubles halves the texels a shadow near the camera gets.
   *
   * OFF by default, and it is not a taste: cascades replace the sun with three lights of their
   * own and patch every material that receives them, so a scene that was fine without them must
   * not inherit them — see `csm.ts`.
   */
  csm: boolean
  /** How finely the frame is drawn — it moves `pixelRatio` and caps the shadow maps. */
  quality: ViewportQuality
  /** Vertical field of view, in degrees. The editor reads it off the same setting. */
  fieldOfView: number
  /**
   * Extent of the editor's ground grid, in metres — and the floor under every shadow frustum, so
   * a game frames a small set exactly as the editor does. A game draws no grid.
   */
  gridSize: number
}

/**
 * How far either engine sees, and therefore how far it draws.
 *
 * 🛑 ONE value, because the two disagreed: the viewport clipped at 1 000 and an exported game at
 * 2 000, so the same camera position showed two different amounts of world. Scatter pruning reads
 * a camera's `far`, which made the ELAGAGE differ too — see `updateScatterVisibility`.
 */
export const VIEW_DISTANCE = 1_000

/**
 * How far a scatter layer is drawn — a property of the SEMIS, never of the lens.
 *
 * 🛑 It was read off `camera.far`, which made the pruning it feeds incapable of hiding anything:
 * a cell further than the far plane is already clipped, so the pass hid what was invisible and
 * nothing else. Written apart, it is the one value to lower for a forest to cost less, and the
 * only reason to lower it is what a forest costs — the picture is what it changes.
 */
export const SCATTER_DISTANCE = VIEW_DISTANCE

/**
 * What an export written before this existed means, and what a game plays under when nobody said.
 * The viewport's own defaults, so the two sides open on the same picture.
 */
export const DEFAULT_RENDER_POLICY: RenderPolicy = Object.freeze({
  engine: 'gl',
  shadows: true,
  shadowQuality: 'soft',
  shadowMapSize: 2048,
  csm: false,
  quality: 'balanced',
  fieldOfView: 60,
  gridSize: 20,
})

/**
 * The values, taken off the larger object a viewport reads: an export carries these and not
 * the twenty settings that only mean something in front of an editor.
 *
 * `engine` is a PARAMETER because it stopped being a preference the day a scene started carrying
 * its own: an export names the one its document holds. Spread over the result instead, a third
 * caller would forget to — see `SceneWorld.engine`.
 */
export function renderPolicyOf(
  view: RenderPolicy,
  engine: RenderEngine = view.engine,
): RenderPolicy {
  return {
    engine,
    shadows: view.shadows,
    shadowQuality: view.shadowQuality,
    shadowMapSize: view.shadowMapSize,
    csm: view.csm,
    quality: view.quality,
    fieldOfView: view.fieldOfView,
    gridSize: view.gridSize,
  }
}

/**
 * A policy read off a manifest, member by member.
 *
 * 🛑 Not a cast: a game's manifest is a JSON file on disk, and one carrying `render: {}` — or a
 * size somebody typed as a word — gave `NaN` for the shadow maps and the pixel ratio, which draws
 * nothing and says nothing. What does not read keeps the default the export was written under.
 */
export function readRenderPolicy(value: unknown): RenderPolicy {
  if (!isRecord(value)) return { ...DEFAULT_RENDER_POLICY }
  return {
    engine: oneOf(RENDER_ENGINES, value.engine, DEFAULT_RENDER_POLICY.engine),
    shadows: readBoolean(value, 'shadows', DEFAULT_RENDER_POLICY.shadows),
    shadowQuality: oneOf(
      SHADOW_QUALITIES,
      value.shadowQuality,
      DEFAULT_RENDER_POLICY.shadowQuality,
    ),
    shadowMapSize: readNumber(value, 'shadowMapSize', DEFAULT_RENDER_POLICY.shadowMapSize),
    csm: readBoolean(value, 'csm', DEFAULT_RENDER_POLICY.csm),
    quality: oneOf(VIEWPORT_QUALITIES, value.quality, DEFAULT_RENDER_POLICY.quality),
    fieldOfView: readNumber(value, 'fieldOfView', DEFAULT_RENDER_POLICY.fieldOfView),
    gridSize: readNumber(value, 'gridSize', DEFAULT_RENDER_POLICY.gridSize),
  }
}
