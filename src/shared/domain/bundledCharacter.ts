import { hostedUrl } from './asset'
import { CHARACTER_LEVELS, type CharacterLevel } from './characterLevel'

/**
 * The character the app ships with, at each density it ships at.
 *
 * One skeleton across all four — the studio's own humanoid roles, which is what lets the shipped
 * clips play on it without a guess, and what a character somebody imports is measured against.
 */
export const BUNDLED_CHARACTER_NAMES: Record<CharacterLevel, string> = {
  low: 'HeroLow',
  medium: 'HeroMedium',
  high: 'HeroHigh',
  ultra: 'HeroUltra',
}

/**
 * Every level the app ships — all four, which is the case a character imported by hand rarely is.
 * Read through `nearestCharacterLevel` like any other character's, never indexed directly.
 */
export const BUNDLED_CHARACTER_LEVELS: readonly CharacterLevel[] = CHARACTER_LEVELS

export function bundledCharacterFile(level: CharacterLevel): string {
  return `${BUNDLED_CHARACTER_NAMES[level]}.glb`
}

/**
 * The host that serves one from beside the app, no project taking part — as `texture` and
 * `animation` already do. Beside the install rather than instead of it: the welcome window opens
 * before any project does, so `installBundledCharacter` has nowhere to put a mesh for it.
 */
export const CHARACTER_HOST = 'character'

/** Where a window reads a shipped character from. */
export function bundledCharacterUrl(level: CharacterLevel): string {
  return hostedUrl(CHARACTER_HOST, bundledCharacterFile(level))
}

/** What one of them lands in the project as: the level it stands for, and the row it now has. */
export type InstalledCharacter = { level: CharacterLevel; assetId: string; path?: string }
