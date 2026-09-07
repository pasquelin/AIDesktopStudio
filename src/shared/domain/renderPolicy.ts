import { isRecord } from '../guards'
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
  shadows: boolean
  shadowQuality: ShadowQuality
  /** Side of the square map each casting light allocates, before the quality level caps it. */
  shadowMapSize: number
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
  shadows: true,
  shadowQuality: 'soft',
  shadowMapSize: 2048,
  quality: 'balanced',
  fieldOfView: 60,
  gridSize: 20,
})

/**
 * The values, taken off the larger object a viewport reads: an export carries these and not
 * the twenty settings that only mean something in front of an editor.
 */
export function renderPolicyOf(view: RenderPolicy): RenderPolicy {
  return {
    shadows: view.shadows,
    shadowQuality: view.shadowQuality,
    shadowMapSize: view.shadowMapSize,
    quality: view.quality,
    fieldOfView: view.fieldOfView,
    gridSize: view.gridSize,
  }
}

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const oneOf = <T extends string>(value: unknown, held: readonly T[], fallback: T): T =>
  held.includes(value as T) ? (value as T) : fallback

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
    shadows: typeof value.shadows === 'boolean' ? value.shadows : DEFAULT_RENDER_POLICY.shadows,
    shadowQuality: oneOf<ShadowQuality>(
      value.shadowQuality,
      SHADOW_QUALITIES,
      DEFAULT_RENDER_POLICY.shadowQuality,
    ),
    shadowMapSize: finite(value.shadowMapSize, DEFAULT_RENDER_POLICY.shadowMapSize),
    quality: oneOf<ViewportQuality>(
      value.quality,
      VIEWPORT_QUALITIES,
      DEFAULT_RENDER_POLICY.quality,
    ),
    fieldOfView: finite(value.fieldOfView, DEFAULT_RENDER_POLICY.fieldOfView),
    gridSize: finite(value.gridSize, DEFAULT_RENDER_POLICY.gridSize),
  }
}
