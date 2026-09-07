// How a scene is being looked at, and drawn, starts here. Session state, like an image document's
// zoom: never saved with the document, and ⌘Z never touches it — the scene did not change, the
// view did. Declared here rather than beside the renderer that applies them, and for the same
// reason `MESH_ENTRIES` is: the native menu offers a row per value and is built in the main
// process, which cannot import a renderer module.

/** The six sides of the box a set is judged from. */
export type ViewDirection = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'

export const VIEW_DIRECTIONS: readonly ViewDirection[] = [
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
]

/** A toolbar row and a menu row both carry a plain string: this turns one back into a direction. */
export function isViewDirection(value: string): value is ViewDirection {
  return VIEW_DIRECTIONS.some(direction => direction === value)
}

/**
 * What the viewport draws. The order is the order the key cycles through: the three the studio
 * opened with first, then the ones a model is judged by.
 *
 * `solid`, `matcap` and `density` paint every surface with one stand-in material, so what shows
 * is the SHAPE — a matcap reads curvature the way a clay render does, and density says which
 * object of a set carries the triangles. `material` keeps the real materials but drops the
 * scene's own lights, which is how a texture is judged without a light flattering it.
 *
 * `studio` goes one step further and drops the document's ENVIRONMENT too, lighting the subject
 * from three's own prefiltered room: it is the mode that still shows a mesh when the scene it
 * lives in is a night sky with no lamp in it.
 */
export type DisplayMode =
  | 'shaded'
  | 'wireframe'
  | 'both'
  | 'solid'
  | 'material'
  | 'studio'
  | 'matcap'
  | 'density'
  /** Surfaces barely there, so the skeleton inside is what reads. */
  | 'ghost'
  /** No surface at all. What is left is the skeleton, which is drawn outside the scene graph. */
  | 'skeleton'

export const DISPLAY_MODES: readonly DisplayMode[] = [
  'shaded',
  'wireframe',
  'both',
  'solid',
  'material',
  'studio',
  'matcap',
  'density',
  'ghost',
  'skeleton',
]

export function isDisplayMode(value: string): value is DisplayMode {
  return DISPLAY_MODES.some(mode => mode === value)
}

/**
 * How much of a family of aids is drawn. `selected` is what the studio has always done for lights
 * and camera frustums, and stays the default: a directional light draws a line clear across the
 * scene, so three lamps shown at once is a viewport nobody can read.
 */
export type HelperVisibility = 'off' | 'selected' | 'all'

export const HELPER_VISIBILITIES: readonly HelperVisibility[] = ['off', 'selected', 'all']

/**
 * Whether an aid is drawn for this node. Here rather than beside either of its callers: the
 * viewport draws light helpers and camera frustums, `viewportAids` draws boxes and origins, and
 * the two had the same expression written out twice.
 */
export function showsAid(
  visibility: HelperVisibility,
  selected: ReadonlySet<string>,
  id: string,
): boolean {
  return visibility === 'all' || (visibility === 'selected' && selected.has(id))
}

/**
 * How the viewport spends its pixels. It moves `pixelRatio` and nothing about the assets: a
 * texture is never resized, a geometry never simplified.
 */
export type ViewportQuality = 'performance' | 'balanced' | 'high'

export const VIEWPORT_QUALITIES: readonly ViewportQuality[] = ['performance', 'balanced', 'high']

/**
 * The unit lengths are WRITTEN in. One scene unit is one metre and stays one metre — this changes
 * what a field shows and what it reads back, never what the scene holds.
 */
export type DisplayUnit = 'mm' | 'cm' | 'm'

export const DISPLAY_UNITS: readonly DisplayUnit[] = ['mm', 'cm', 'm']

/** How much of a normal is drawn, relative to the object it stands on. */
export const NORMAL_LENGTH = Object.freeze({ min: 0.01, max: 2, step: 0.01 })
