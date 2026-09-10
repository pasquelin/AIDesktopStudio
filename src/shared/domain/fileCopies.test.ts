import { describe, expect, it } from 'vitest'
import { copyStoreOf, redundantBytesOf, type CopyGroup } from './fileCopies'

const group = (bytes: (number | null)[]): CopyGroup => ({
  hash: 'ab12',
  copies: bytes.map((one, at) => ({
    assetId: `asset_${at}`,
    path: `Images/${at}.png`,
    name: `${at}`,
    bytes: one,
    addedAt: '2026-09-10T10:00:00.000Z',
    store: 'visible',
  })),
})

describe('which store owns a path', () => {
  it('tells the user’s own from the studio’s, and the cache from what travels', () => {
    expect(copyStoreOf('Images/facade.jpg')).toBe('visible')
    expect(copyStoreOf('.resources/img/checker.png')).toBe('internal')
    expect(copyStoreOf('Meshes/.sources/tree.fbx')).toBe('internal')
    expect(copyStoreOf('.index/proxies/a.mp4')).toBe('machine')
  })
})

describe('what a group would give back', () => {
  it('counts every copy but one', () => {
    expect(redundantBytesOf(group([900, 900, 900]))).toBe(1800)
  })

  /**
   * 🛑 Answered as UNKNOWN rather than as a smaller number: a figure computed from the rows that
   * happen to carry a length reads as the whole of what is at stake, and it is not.
   */
  it('answers nothing when a row never recorded its length', () => {
    expect(redundantBytesOf(group([900, null]))).toBeNull()
  })
})
