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
