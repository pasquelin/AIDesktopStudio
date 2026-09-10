import { describe, expect, it } from 'vitest'
import {
  DERIVED_STORES,
  DERIVED_STORE_FOLDERS,
  KEPT_MACHINE_FOLDERS,
  derivedBytesOf,
} from './derivedCache'
import { MACHINE_FOLDERS } from './project'

/**
 * 🛑 The forcing function. Without it the purgeable list is a second, hand-kept copy of the
 * machine folders, and a cache added later either never gets freed or — worse — gets freed
 * without anyone having asked whether losing it costs anything.
 */
describe('what a purge may throw away', () => {
  it('decides for every machine folder, either freed or kept with a reason', () => {
    const freed = DERIVED_STORES.map(store => DERIVED_STORE_FOLDERS[store])
    const decided = [...freed, ...Object.keys(KEPT_MACHINE_FOLDERS)]

    expect([...MACHINE_FOLDERS].sort()).toEqual(decided.sort())
  })

  it('gives a reason for every folder it keeps', () => {
    expect(Object.values(KEPT_MACHINE_FOLDERS).filter(why => why.length < 8)).toEqual([])
  })

  it('totals what the stores hold', () => {
    expect(
      derivedBytesOf([
        { store: 'proxies', files: 2, bytes: 300 },
        { store: 'peaks', files: 1, bytes: 40 },
      ]),
    ).toBe(340)
  })
})
