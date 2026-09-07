import { hostedUrl } from './asset'
import { nameOf, parentOf, pathIn } from './folder'
import { stemOf } from './fileName'

/**
 * An animation the app ships with: one folder under `resources/animations`, named after the
 * animation, holding the clip and — when someone has drawn one — a `thumb.png` beside it.
 *
 * A folder rather than a loose file so a thumbnail has somewhere to live, and so the NAME comes
 * from the folder rather than from inside the clip: a Tripo rig calls its only clip `NlaTrack`
 * and Uthana's carries no name at all, so what the file spells must never reach the screen.
 */
export type BundledAnimation = {
  /** The folder's name, which is what the studio shows and what a block is labelled with. */
  name: string
  /** Whether the folder holds a `thumb.png`. No path: the window reads both over the scheme. */
  thumbnail: boolean
}

/**
 * How a still is taken of a clip: where to stop inside it, what makes one frame worth showing
 * over another, and where the eye stands.
 *
 * 🛑 DATA of the clip, and not a reading of its file name. The renderer decided all of this by
 * matching the name it was handed — a sixteen-entry table, `/jump/i`, `/idle/i` — and the name it
 * is handed for an imported clip is the stem of whatever file a person dropped: `Idle_Combat.fbx`
 * was scored on its head and shoulders, `Walk_v2.fbx` on nothing in particular.
 *
 * Nothing here is the ordinary answer, and it means « take the best-scoring sample »: an imported
 * clip is described by nobody, and guessing from its name is what this exists to stop.
 */
export type AnimationPoster = {
  /**
   * Where in the clip to stop, as a fraction of it.
   *
   * 🛑 Every shipped clip settles it, and that is what makes the scoring below UNREACHABLE for
   * them: a described clip is never sampled. What the sampling is for is a clip nobody has
   * described, and it is scored on the legs — see `STEP_JOINTS`, in the renderer.
   */
  at?: number
  /** Where the eye stands, when the ordinary three-quarter view says nothing about this clip. */
  camera?: readonly [number, number, number]
  /** Whether the body is turned back square to the camera — what a side turn is drawn as. */
  square?: boolean
}

/**
 * What is known about the stills of the clips the app SHIPS with, by folder name.
 *
 * 🛑 Keyed by a folder the app owns, never by an imported file's stem: an animation someone
 * dropped in wears whatever name its author gave it, and answers here by accident or not at all.
 */
export const BUNDLED_ANIMATION_POSTERS: Readonly<Record<string, AnimationPoster>> = {
  Idle: { at: 0.5 },
  IdleBreathing: { at: 0.85 },
  IdleBriefcase: { at: 0.25 },
  IdleHappy: { at: 0.3 },
  IdleSad: { at: 0.45 },
  IdleShift: { at: 0.3 },
  Jump: { at: 0.39 },
  RunningJump: { at: 0.39 },
  StrafeLeft: { at: 0.25 },
  StrafeRight: { at: 0.65 },
  TurnAround: { at: 0.55 },
  TurnLeft: { at: 0.29, square: true, camera: [0, 7, 24] },
  TurnRight: { at: 0.5, square: true, camera: [0, 7, 24] },
  Walk: { at: 0.75 },
  WalkStart: { at: 0.45 },
  WalkStop: { at: 0.45 },
}

/** The clip files an animation folder may hold, lowercase and with their dot. */
export const ANIMATION_EXTENSIONS: readonly string[] = ['.glb', '.gltf', '.fbx', '.bvh']

/** The still a folder may hold beside its clip, under this name and no other. */
export const ANIMATION_THUMBNAIL = 'thumb.png'

/**
 * What the studio calls the clip it writes inside such a folder.
 *
 * The folder carries the name, so the file inside needs none — and a shipped folder proves it:
 * `bundledAnimationFile` takes whichever file wears a known extension, never a spelling. What
 * this fixes is the other direction: a path ending in `animation.<ext>` is one the STUDIO laid
 * out, which is how a rename knows whether a folder is its own to carry along.
 */
export const ANIMATION_CLIP_STEM = 'animation'

/**
 * The host that serves what ships beside the app rather than what a project owns — the animations
 * are common to every project, and no catalogue has ever heard of them.
 */
export const ANIMATION_HOST = 'animation'

/** Where the window reads a shipped clip from. The folder is named; which file is inside is not. */
export function bundledAnimationUrl(name: string): string {
  return hostedUrl(ANIMATION_HOST, name)
}

/**
 * Whether this clip path is one the studio laid out in a folder of its own — `<name>/animation.glb`.
 *
 * Read rather than assumed, because an animation imported BEFORE the studio wrote folders sits
 * flat beside its neighbours, and its parent is then the animations folder itself. Carrying THAT
 * along on a rename would rename the user's own folder.
 */
export function isOwnAnimationFolder(clipPath: string): boolean {
  return parentOf(clipPath) !== null && stemOf(nameOf(clipPath)) === ANIMATION_CLIP_STEM
}

/** Where the still of that clip lives — beside it, under the one name a folder may hold. */
export function animationPosterPathOf(clipPath: string): string | null {
  const folder = parentOf(clipPath)
  return folder === null ? null : pathIn(folder, ANIMATION_THUMBNAIL)
}
