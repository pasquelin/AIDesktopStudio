import { describe, expect, it } from 'vitest'
import { coalesced, orElse } from './promises'

describe('orElse', () => {
  it('answers what the promise settled on', async () => {
    await expect(orElse(Promise.resolve('landed'), 'fallback')).resolves.toBe('landed')
  })

  it('answers the fallback where the promise refused', async () => {
    await expect(orElse(Promise.reject(new Error('refused')), 'fallback')).resolves.toBe('fallback')
  })

  it('answers the fallback where there was no promise at all', async () => {
    await expect(orElse(undefined, 'fallback')).resolves.toBe('fallback')
  })

  // The value a caller means to keep is often falsy — `null` from a catalogue that holds nothing,
  // `0` from a count. Answering the fallback for those would be a different function.
  it('keeps a falsy value the promise settled on rather than falling back', async () => {
    await expect(orElse(Promise.resolve(null), 'fallback')).resolves.toBeNull()
    await expect(orElse(Promise.resolve(0), 7)).resolves.toBe(0)
  })
})

describe('coalesced', () => {
  /**
   * The reason it exists: one turn asks the window what is in front twice on the same tick — to
   * describe the studio, and to weigh an action search — and each ask is an IPC round trip plus a
   * rebuild on the window's UI thread.
   */
  it('runs once for every caller that asks while the flight is up', async () => {
    let runs = 0
    const read = coalesced(async () => {
      runs += 1
      return 'in front'
    })

    await expect(Promise.all([read(), read(), read()])).resolves.toEqual([
      'in front',
      'in front',
      'in front',
    ])
    expect(runs).toBe(1)
  })

  // Nothing is cached: what is in front changes, so an ask after the flight settles is a new one.
  it('runs again once the flight has settled', async () => {
    let runs = 0
    const read = coalesced(async () => {
      runs += 1
      return runs
    })

    await read()
    await expect(read()).resolves.toBe(2)
  })

  // A refusal is not held either: the caller after it asks the window again rather than inheriting
  // the failure of a flight it never saw.
  it('lets the next caller ask again after a refusal', async () => {
    let runs = 0
    const read = coalesced(async () => {
      runs += 1
      if (runs === 1) throw new Error('no window answered')
      return 'in front'
    })

    await expect(read()).rejects.toThrow('no window answered')
    await expect(read()).resolves.toBe('in front')
  })
})
