import type { CharacterExtras } from '@shared/domain/character'
import type { Rig } from '@shared/domain/rig'
import { EMPTY_CHARACTER, type CharacterState } from '@/engines/character/characterState'
import { createDocumentStore } from './documentStore'

/**
 * The character the skeleton window is editing, with its own history.
 *
 * Keyed by ASSET id and not by document id: this window edits a FILE, and the studio has no
 * document for a character. `createDocumentStore` is generic over that key — it reads no
 * document anywhere — so ⌘Z, gesture coalescing and the modified mark come for free.
 */
const store = createDocumentStore<CharacterState>(EMPTY_CHARACTER)

export const characterStore = store
export const useCharacters = store.use
export const characterOf = store.stateOf
export const isCharacterDirty = store.isDirty

/**
 * What the window read off the file, installed before anything is edited.
 *
 * `ensure` would be wrong here: reopening the same character has to show the FILE again, not
 * whatever a previous session left in memory — the file is the document.
 */
export function seedCharacter(assetId: string, rig: Rig | null, extras: CharacterExtras): void {
  store.use.getState().replace(assetId, {
    ...EMPTY_CHARACTER,
    assetId,
    rig,
    sockets: extras.sockets ?? [],
    motions: extras.motions ?? [],
    ...(extras.dress && { dress: extras.dress }),
  })
  const seeded = store.use.getState()
  store.use.getState().markSaved(assetId, store.markOf(seeded, assetId))
}
