import type { ModelQuery, ModelSummary } from '@shared/domain/model'
import { getBridge } from '@/services/bridge'
import { usePages, type Pages } from './usePages'

/**
 * What the FIRST page asks for — what a panel waits on, not what its list will hold.
 *
 * 🛑 Small on purpose: the registry pages the catalogue a hundred records at a time and stops on
 * MATCHES, so a wide ask multiplies round trips. Measured at a hundred — 4,99 s and five listings
 * in series, four of them chasing a quota the capability filter could never fill.
 */
const FIRST_PAGE = 12

/**
 * Pages pulled on their own once the first is drawn, `FIRST_PAGE` apiece.
 *
 * Four, so the whole read costs what the single wide ask cost — measured, one server listing per
 * pull: five either way, same sixty-odd matches. Eight walked the catalogue to offset 600.
 */
const PULLS = 4

/**
 * The catalogue walked page by page, for any surface that lists models.
 *
 * Written once because two things about the registry belong to IT rather than to each surface:
 * an id may legitimately appear in two pages — the walk covers the private listing then the
 * public one — and the width of the first ask is what governs how long the walk takes.
 */
export function useModelPages(
  key: readonly unknown[],
  query: ModelQuery,
  enabled: boolean,
  /**
   * Raised only where the list is DERIVED FROM rather than drawn: which services offer rigging is
   * read off the whole family, and a provider past the ceiling would simply cease to exist.
   */
  pulls: number = PULLS,
): Pages<ModelSummary> {
  return usePages<ModelSummary>(
    key,
    from => getBridge()?.provider.searchModels({ ...query, limit: FIRST_PAGE, ...from }),
    {
      enabled,
      // What the pulls can actually reach, so the ceiling that decides is the one written here.
      fill: { wanted: FIRST_PAGE * (pulls + 1), max: pulls },
      // 🛑 These pages are billed. Left refetchable, a panel re-entered past the app's 30 s
      // staleness replayed EVERY page it held — up to nine listings for one reopening. The
      // freshness that matters is the registry's own ten minutes, in the main process.
      once: true,
      endsOnRepeats: false,
    },
  )
}
