import { useCallback, useEffect, useState } from 'react'
import { orElse } from '@shared/promises'
import type { DerivedCacheReport } from '@shared/domain/derivedCache'
import { getBridge } from '@/services/bridge'
import { useReloadKey } from './useReloadKey'

const NOTHING: DerivedCacheReport = { stores: [], bytes: 0, clearedRows: 0 }

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
    void orElse(getBridge()?.project.derivedCache(), NOTHING).then(measured => {
      if (live) setReport(measured)
    })
    return () => {
      live = false
    }
  }, [key])

  const purge = useCallback(() => {
    setPurging(true)
    void orElse(getBridge()?.project.purgeDerivedCache(), NOTHING).then(done => {
      setFreed(done)
      setPurging(false)
      remeasure()
    })
  }, [remeasure])

  return { report, freed, purging, purge }
}
