import type { GlbSkinPatch } from '@/engines/scene/glbSkin'

/** What the weights of one mesh are, once the engine has worked them out. */
export type CharacterSkinning = GlbSkinPatch['skins']

/**
 * What the engine weighed each character's meshes against its skeleton, kept where ⌘S can reach
 * it: the tab holds the engine, and the save runs from `documentIo` — outside it.
 *
 * A plain map rather than a store, for the reason `sceneEngines` is one: nothing renders from it,
 * and these are megabytes of typed arrays. The tab that weighed them forgets them as it goes.
 */
const weighed = new Map<string, CharacterSkinning>()

export function noteCharacterSkins(assetId: string, skins: CharacterSkinning): void {
  weighed.set(assetId, skins)
}

export function forgetCharacterSkins(assetId: string): void {
  weighed.delete(assetId)
}

/** Empty for a character whose meshes carry their own skin — every rig fitted elsewhere. */
export function characterSkinsOf(assetId: string): CharacterSkinning {
  return weighed.get(assetId) ?? []
}
