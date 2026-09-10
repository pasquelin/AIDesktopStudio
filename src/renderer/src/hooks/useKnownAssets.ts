import { useCallback } from 'react'
import type { Asset } from '@shared/domain/asset'
import { byCodeUnit } from '@shared/text'
import { getBridge } from '@/services/bridge'
import { askOnce, NO_ASSETS, useCatalogueAssets } from './useCatalogueAssets'

/**
 * The rows behind ids a document already holds, asked BY ID.
 *
 * The one query that reaches a DURABLE INTERNAL resource: every other narrows to what the explorer
 * shows, and a computed channel deliberately is not among them (§6.7). Without it, a slot filled by
 * one reads « missing » — its value naming a row no list carries — and its pixels cannot be opened.
 *
 * What it is NOT is a second way to browse: it answers only ids the caller already holds.
 */
export function useKnownAssets(ids: readonly string[]): readonly Asset[] {
  // The ids as one string, so the question keeps its identity across renders that rebuild the list.
  // By code unit rather than by a collator: these are ids the studio minted, not text a person
  // reads, and this only exists to give the question a stable identity across renders.
  const key = [...new Set(ids)].sort(byCodeUnit).join()
  const ask = useCallback(() => {
    const bridge = getBridge()
    if (key === '' || !bridge) return Promise.resolve(NO_ASSETS)
    // Through `askOnce`, like every other catalogue hook: several material tabs replay this on
    // each write to the catalogue, and each replay is a synchronous SQLite pause every window pays.
    return askOnce(`ids:${key}`, () => bridge.assets.search({ ids: key.split(',') }))
  }, [key])

  return useCatalogueAssets(ask)
}
