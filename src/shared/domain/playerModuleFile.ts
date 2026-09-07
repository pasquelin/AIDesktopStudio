/**
 * A module is filed with `.player` at the END OF ITS NAME and `.gltf` as its extension.
 *
 * 🛑 Split in two because the asset backend refuses an extension holding a second dot — measured:
 * `safeExtension` takes `/^\.[a-z0-9]{1,8}$/`, and `.player.gltf` fell back to `.glb`, which
 * mislabelled the text as a binary AND made `isPlayerModulePath` answer false for ever.
 */
export const PLAYER_MODULE_SEGMENT = '.player'

export const PLAYER_MODULE_FORMAT = '.gltf'

/** What a filed module's path ends with, the two put back together. */
export const PLAYER_MODULE_EXTENSION = `${PLAYER_MODULE_SEGMENT}${PLAYER_MODULE_FORMAT}`

/** Whether a file is a module rather than a mesh — what tells the two double-clicks apart. */
export function isPlayerModulePath(path: string): boolean {
  return path.toLowerCase().endsWith(PLAYER_MODULE_EXTENSION)
}
