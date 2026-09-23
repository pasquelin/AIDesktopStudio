/**
 * The families the app ships beside itself, in the order the window lists them.
 *
 * 🛑 They are NOT placed alike, and that is why the surface iterates this list rather than
 * naming three sections: the character and the working images are copied into the project, a
 * shipped clip is not. The reason for the exception is written where someone would undo it —
 * see `ShippedWindowAnimations` — and the window here refuses to compile without a body per
 * family, which is what keeps a fourth one from arriving unnoticed.
 */
export type ShippedFamily = 'character' | 'textures' | 'animations'

export const SHIPPED_FAMILIES: readonly ShippedFamily[] = ['character', 'textures', 'animations']

/** URL fragment the shared bundle reads to render what the studio ships. */
export const SHIPPED_ROUTE = 'shipped'

export function isShippedRoute(hash: string): boolean {
  return hash.replace(/^#/, '') === SHIPPED_ROUTE
}
