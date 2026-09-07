import { hashPayload, hashRoute } from './hashPayload'

/** URL fragment that tells the shared bundle it is rendering a player module. */
export const PLAYER_MODULE_ROUTE = 'player-module'

/**
 * The route a module's window loads, its asset included — ONE window turned towards whichever
 * module was opened, the way the character window is: comparing two is not what this is for.
 */
export function playerModuleRoute(assetId: string): string {
  return hashRoute(PLAYER_MODULE_ROUTE, assetId)
}

export function isPlayerModuleRoute(hash: string): boolean {
  return hash.replace(/^#/, '').startsWith(`${PLAYER_MODULE_ROUTE}/`)
}

/** The asset the fragment names, `null` for a fragment naming none. */
export function playerModuleAssetOf(hash: string): string | null {
  return hashPayload(hash, PLAYER_MODULE_ROUTE)
}
