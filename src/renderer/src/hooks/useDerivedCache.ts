import { useCallback, useEffect, useState } from 'react'
import { orElse } from '@shared/promises'
import { NO_DERIVED_CACHE, type DerivedCacheReport } from '@shared/domain/derivedCache'
import { getBridge } from '@/services/bridge'
import { useReloadKey } from './useReloadKey'

export type DerivedCacheState = {
  /** What the rebuildable stores hold, or `null` while the first measurement is out. */
  report: DerivedCacheReport | null
  /** What the last purge of this session actually gave back. `null` until one has run. */
  freed: DerivedCacheReport | null
  purging: boolean
  purge: () => void
}

/**
 * What the rebuildable stores weigh, and the one command that frees them.
 *
 * `freed` is kept apart from `report` because they answer different questions: one is what is
 * there now, the other is what a gesture the person made actually gave back. Folded into one,
 * the surface would either forget what it just did or claim the disk still holds it.
 */
export function useDerivedCache(): DerivedCacheState {
  const [report, setReport] = useState<DerivedCacheReport | null>(null)
  const [freed, setFreed] = useState<DerivedCacheReport | null>(null)
  const [purging, setPurging] = useState(false)
  const [key, remeasure] = useReloadKey()

  useEffect(() => {
    let live = true

    const measure = async (): Promise<void> => {
      const measured = await orElse(getBridge()?.project.derivedCache(), NO_DERIVED_CACHE)
      if (live) setReport(measured)
    }

    void measure()

    return () => {
      live = false
    }
  }, [key])

  const purge = useCallback(() => {
    const free = async (): Promise<void> => {
      setPurging(true)
      setFreed(await orElse(getBridge()?.project.purgeDerivedCache(), NO_DERIVED_CACHE))
      setPurging(false)
      remeasure()
    }

    void free()
  }, [remeasure])

  return { report, freed, purging, purge }
}
