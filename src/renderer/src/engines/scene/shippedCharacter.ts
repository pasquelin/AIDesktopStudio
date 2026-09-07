/**
 * Which asset the shipped character became in the open project, and therefore what a player
 * module is born wearing.
 *
 * Module state rather than a store, for the reason `checkerTextures` holds its own: the factories
 * that make nodes are synchronous — they run inside a command, between two entries of the history
 * — and copying a mesh into a project is not. What waits for the copy, and remembers which project
 * it was for, is `projectInstalls`.
 */
import { DEFAULT_CHARACTER_LEVEL } from '@shared/domain/characterLevel'
import { getBridge } from '@/services/bridge'

let assetId: string | null = null
let assetPath: string | null = null

/**
 * The shipped character put into the open project, and its id remembered — which is what lets
 * `playerModuleNodes` stay synchronous at the moment a module is actually made.
 *
 * Answers whether it landed and never rejects: `projectInstalls` reads that to know whether the
 * next mount has to ask again. A project that cannot be written to is the one case a module still
 * comes out as boxes, and the main process is where that failure is logged.
 */
export async function installShippedCharacter(isCurrent: () => boolean): Promise<boolean> {
  try {
    const installed = await getBridge()?.assets.installBundledCharacter(DEFAULT_CHARACTER_LEVEL)
    if (isCurrent()) {
      assetId = installed?.assetId ?? null
      assetPath = installed?.path ?? null
    }
    return true
  } catch {
    if (isCurrent()) forgetShippedCharacter()
    return false
  }
}

export function rememberShippedCharacter(id: string | null, path: string | null = null): void {
  assetId = id
  assetPath = path
}

export function forgetShippedCharacter(): void {
  assetId = null
  assetPath = null
}

/**
 * The character a module wears, or `null` while none has landed — which is what makes the figure
 * of boxes a FALLBACK rather than dead code: a module is never born bodiless.
 */
export function shippedCharacterAssetId(): string | null {
  return assetId
}

export function shippedCharacterPath(id: string): string | null {
  return id === assetId ? assetPath : null
}
