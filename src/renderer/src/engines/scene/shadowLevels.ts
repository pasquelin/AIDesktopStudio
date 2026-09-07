/**
 * Four words for the two shadow preferences the studio already had.
 *
 * A LEVEL is not a stored field, and that is the point: `shadows`, `shadowQuality` and
 * `shadowMapSize` are what the settings hold, the preferences screen edits all three, and a
 * fourth field naming a level would be a second source of truth that drifts the moment somebody
 * touches one of the three. The level is READ BACK from them instead, and reads `null` — shown as
 * « custom » — for a combination no level names.
 */
import type { RenderPolicy } from '@shared/domain/renderPolicy'
import { shadowMapSizeFor } from './viewportQuality'

export type ShadowLevel = 'off' | 'fast' | 'standard' | 'high'

export const SHADOW_LEVELS: readonly ShadowLevel[] = ['off', 'fast', 'standard', 'high']

/** The four an export carries too — the lens apart, this IS a render policy. */
export type ShadowPreference = Omit<RenderPolicy, 'fieldOfView' | 'gridSize'>

/** What a level writes. The quality is the person's own and is deliberately left where it is. */
type LevelPatch = Omit<ShadowPreference, 'quality'>

const LEVELS: Record<ShadowLevel, LevelPatch> = {
  off: { shadows: false, shadowQuality: 'soft', shadowMapSize: 2048 },
  fast: { shadows: true, shadowQuality: 'hard', shadowMapSize: 512 },
  standard: { shadows: true, shadowQuality: 'soft', shadowMapSize: 2048 },
  high: { shadows: true, shadowQuality: 'soft', shadowMapSize: 4096 },
}

export function shadowPreferenceFor(level: ShadowLevel): LevelPatch {
  return LEVELS[level]
}

/**
 * The level a setting reads as, or nothing.
 *
 * Read off what was CHOSEN, never through the quality cap: capped, `standard` and `high` collapse
 * to one size at the default quality and « High » becomes a button that unpresses itself. What
 * the cap does is said out loud instead — see `shadowsCapped`.
 *
 * Shadows off answers `off` whatever the other two say: with nothing drawn, a map size is not a
 * difference anybody can see, and reporting « custom » there would ask a reader to reconcile two
 * numbers that no longer matter.
 */
export function shadowLevelOf(held: ShadowPreference): ShadowLevel | null {
  if (!held.shadows) return 'off'

  return (
    DRAWN_LEVELS.find(
      level =>
        LEVELS[level].shadowQuality === held.shadowQuality &&
        LEVELS[level].shadowMapSize === held.shadowMapSize,
    ) ?? null
  )
}

/**
 * Whether the viewport quality is holding the shadows below what was asked for. Shown rather than
 * folded into the level: a reader is entitled to know that the two settings are pulling apart.
 */
export function shadowsCapped(held: ShadowPreference): boolean {
  return held.shadows && shadowMapSizeFor(held.quality, held.shadowMapSize) < held.shadowMapSize
}

/** The three that actually draw. `off` is answered above, whatever the other two fields say. */
const DRAWN_LEVELS: readonly ShadowLevel[] = ['fast', 'standard', 'high']
