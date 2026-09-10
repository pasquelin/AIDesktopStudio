/**
 * What the app ships beside itself, as a surface has to know it.
 *
 * Three families, and they are not placed the same way — which is the whole reason this file
 * exists rather than a list of files somewhere in a component.
 */
export type ShippedFamily = 'character' | 'textures' | 'animations'

export const SHIPPED_FAMILIES: readonly ShippedFamily[] = ['character', 'textures', 'animations']

/**
 * Whether putting a family into the open project MEANS anything.
 *
 * `install` copies the bytes in, and the reason is written where the copy is made: a document
 * holds an asset id and is written as glTF, so what it points at has to be a file another
 * application can open — an exported scene would otherwise be bare.
 *
 * 🛑 `reachable` is the opposite decision, taken on a measurement rather than on caution: a
 * shipped clip is already offered wherever a clip is chosen (`ClipSource` `bundled`), and the
 * game export files it into the bundle on its own (`shippedClipNames`). Copying one into the
 * project would be a second copy of the same bytes with nothing to buy — which is exactly what
 * G-P refuses.
 */
export type ShippedPlacement = 'install' | 'reachable'

export const SHIPPED_PLACEMENT: Record<ShippedFamily, ShippedPlacement> = {
  character: 'install',
  textures: 'install',
  animations: 'reachable',
}

/** URL fragment the shared bundle reads to render what the studio ships. */
export const SHIPPED_ROUTE = 'shipped'

export function isShippedRoute(hash: string): boolean {
  return hash.replace(/^#/, '') === SHIPPED_ROUTE
}
