import { describe, expect, it } from 'vitest'
import { inOrder, movedWithin, reconcileOrder } from './order'

const REGISTRY = ['a', 'b', 'c', 'd']
const identity = (id: string): string => id

describe('reconcileOrder', () => {
  it('keeps the stored arrangement rather than the registry one', () => {
    expect(reconcileOrder(['d', 'c', 'b', 'a'], REGISTRY, identity)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('gives the registry order to a reader who has arranged nothing', () => {
    expect(reconcileOrder([], REGISTRY, identity)).toEqual(REGISTRY)
  })

  // The whole subtlety: a newcomer belongs where it was designed to sit, so the reason the
  // registry is ordered survives a reader who arranged the bar before it existed.
  it('puts a newcomer straight after the last earlier neighbour that was kept', () => {
    expect(reconcileOrder(['d', 'b'], REGISTRY, identity)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('rebuilds the missing head ahead of the one entry that was kept', () => {
    expect(reconcileOrder(['d'], REGISTRY, identity)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('appends a newcomer that comes after everything the reader kept', () => {
    expect(reconcileOrder(['a', 'b', 'c'], REGISTRY, identity)).toEqual(REGISTRY)
  })

  // What the home needs: the stored entry wins, so its `visible` and `limit` are not reset by a
  // registry entry carrying the same key.
  it('keeps the stored item, never the registry one, when both carry a key', () => {
    const stored = [{ id: 'b', hidden: true }]
    const registry = [
      { id: 'a', hidden: false },
      { id: 'b', hidden: false },
    ]

    expect(reconcileOrder(stored, registry, item => item.id)).toEqual([
      { id: 'a', hidden: false },
      { id: 'b', hidden: true },
    ])
  })
})

describe('movedWithin', () => {
  it('moves one entry and leaves the others in place', () => {
    expect(movedWithin(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(movedWithin(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })

  it('stops at the ends rather than wrapping, so a line dragged up has arrived', () => {
    expect(movedWithin(['a', 'b', 'c'], 'a', -3)).toEqual(['a', 'b', 'c'])
    expect(movedWithin(['a', 'b', 'c'], 'c', 5)).toEqual(['a', 'b', 'c'])
  })

  // What tells a caller "already at that end" from "it travelled" — the grip banks a step on the
  // answer, and a fresh array would say it moved every time.
  it('hands the same array back when nothing moved, and for an entry it does not hold', () => {
    const ids = ['a', 'b', 'c']

    expect(movedWithin(ids, 'a', -1)).toBe(ids)
    expect(movedWithin(ids, 'gone', 1)).toBe(ids)
  })
})

describe('inOrder', () => {
  it('keeps an entry the order forgot rather than dropping it', () => {
    expect(inOrder([{ id: 'a' }, { id: 'b' }], ['b']).map(one => one.id)).toEqual(['b', 'a'])
  })
})
