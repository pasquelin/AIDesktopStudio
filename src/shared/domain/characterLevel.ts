/**
 * How dense a character's mesh is, as a PREFERENCE rather than a requirement.
 *
 * The app ships its own at four densities; a character somebody imports is usually one file and
 * one density. Asking for a level therefore never means demanding it — `nearestCharacterLevel`
 * answers what that character actually has, and a character with a single level has it for every
 * ask. Nothing may be left unresolved because a level is missing.
 */
export type CharacterLevel = 'low' | 'medium' | 'high' | 'ultra'

/** Lightest first, which is the order the distance below is measured along. */
export const CHARACTER_LEVELS: readonly CharacterLevel[] = ['low', 'medium', 'high', 'ultra']

/**
 * What a character is placed at while nothing asks for anything else — the middle of the shipped
 * four, which is a working density rather than either extreme.
 */
export const DEFAULT_CHARACTER_LEVEL: CharacterLevel = 'medium'

/**
 * The level a character HAS that sits closest to the one wanted, or `null` when it has none.
 *
 * 🛑 A TIE goes to the lighter one: two levels equally far from what was asked are not equally
 * cheap, and a frame budget is the thing that breaks. `null` is the empty list alone — every
 * other case answers something, which is the whole point of asking this rather than indexing.
 */
export function nearestCharacterLevel(
  wanted: CharacterLevel,
  available: readonly CharacterLevel[],
): CharacterLevel | null {
  const distanceOf = (level: CharacterLevel): number =>
    Math.abs(CHARACTER_LEVELS.indexOf(level) - CHARACTER_LEVELS.indexOf(wanted))

  let best: CharacterLevel | null = null
  for (const level of CHARACTER_LEVELS) {
    // Strictly closer, so walking lightest first leaves a tie with the lighter one.
    if (available.includes(level) && (best === null || distanceOf(level) < distanceOf(best))) {
      best = level
    }
  }

  return best
}
