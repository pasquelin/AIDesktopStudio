/**
 * What a scene document opens on. Shared because the choice crosses the boundary twice: the
 * window that names a document answers with one, and the main process serves its thumbnail.
 *
 * A template is CODE, never a file to fetch: each one is a `SceneState` built by
 * `engines/scene/sceneTemplates`, so a studio with no network opens every one of them.
 */
export type SceneTemplateId =
  | 'empty'
  | 'basic'
  | 'photoStudio'
  | 'cinematic'
  | 'archvis'
  | 'postProcessing'
  | 'firstPerson'
  | 'thirdPerson'
  | 'topDown'
  | 'car'
  | 'plane'

/**
 * Which shelf a template belongs to. The character ones differ by what the camera is FOR, not by
 * what the scene holds; the machine ones by what the player IS; the staged ones by how the set is
 * LIT and framed. The picker draws no heading any more — the shelf is what ORDERS its line, and
 * the four staged sets sit at the end because a person reaches for a start before a look.
 */
export type SceneTemplateGroup = 'general' | 'character' | 'machine' | 'staging'

export const SCENE_TEMPLATE_GROUPS: readonly SceneTemplateGroup[] = [
  'general',
  'character',
  'machine',
  'staging',
]

/** Ordered, and the order is what the window draws: `Record` makes a new id a compile error. */
export const TEMPLATES_BY_GROUP: Record<SceneTemplateGroup, readonly SceneTemplateId[]> = {
  general: ['empty', 'basic'],
  character: ['firstPerson', 'thirdPerson', 'topDown'],
  machine: ['car', 'plane'],
  staging: ['photoStudio', 'cinematic', 'archvis', 'postProcessing'],
}

export const SCENE_TEMPLATE_IDS: readonly SceneTemplateId[] = SCENE_TEMPLATE_GROUPS.flatMap(
  group => TEMPLATES_BY_GROUP[group],
)

/**
 * What a new scene takes when nobody picks — lit, floored and framed. `empty` would open on a
 * document one has to furnish before seeing anything, which is a first launch nobody asks for.
 */
export const DEFAULT_SCENE_TEMPLATE: SceneTemplateId = 'basic'

export function isSceneTemplateId(value: unknown): value is SceneTemplateId {
  return SCENE_TEMPLATE_IDS.some(id => id === value)
}

/**
 * The host that serves the still drawn of each template — shipped beside the app under
 * `resources/templates`, like the animations are, and common to every project.
 *
 * Nothing DRAWS one today: the picker became a line of glyphs when eleven framed squares cost the
 * form the height its folder picker needed. The host stays because the resolver behind it does.
 */
export const TEMPLATE_HOST = 'template'
