import { describe, expect, it } from 'vitest'
import { chunk, withItemAt } from './collections'

describe('chunk', () => {
  it('cuts a list into runs of at most the given size, in order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('leaves a list that already fits in one batch', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]])
  })

  it('gives no batch at all for an empty list', () => {
    // Callers send one request per batch: an empty batch would ask the API for nothing.
    expect(chunk([], 10)).toEqual([])
  })

  it('cuts exactly on the boundary without trailing an empty batch', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('refuses a size that would never finish', () => {
    expect(() => chunk([1], 0)).toThrow()
  })
})

describe('withItemAt', () => {
  it('replaces the item the row answers for, leaving its neighbours alone', () => {
    expect(withItemAt(['a', 'b', 'c'], 1, 'B')).toEqual(['a', 'B', 'c'])
  })

  it('drops the item when the row answers null', () => {
    expect(withItemAt(['a', 'b', 'c'], 1, null)).toEqual(['a', 'c'])
  })

  it('leaves the list untouched, so a store sees a new array', () => {
    const items = ['a', 'b']
    expect(withItemAt(items, 0, 'A')).not.toBe(items)
    expect(items).toEqual(['a', 'b'])
  })
})
