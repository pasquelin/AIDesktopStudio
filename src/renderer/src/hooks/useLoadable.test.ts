import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLoadable } from './useLoadable'

describe('useLoadable', () => {
  it('hands back the url it is given', () => {
    const { result } = renderHook(() => useLoadable('https://cdn/one.png'))

    expect(result.current.src).toBe('https://cdn/one.png')
  })

  /**
   * A still is served over `ai-desktop-studio://`, whose resolver reads a catalogue that refuses while a
   * project closes — under a scroll, that is a whole grid at once. One such refusal used to cost
   * every tile it hit its picture for as long as it stayed mounted.
   */
  it('asks again once before giving up', () => {
    const { result } = renderHook(() => useLoadable('ai-desktop-studio://poster/asset_1'))

    act(() => result.current.onError())

    expect(result.current.src).toBe('ai-desktop-studio://poster/asset_1')
    // What makes the browser ask at all: the same `src` re-rendered fetches nothing.
    expect(result.current.attempt).toBe(1)
  })

  it('gives up on a still that failed twice', () => {
    const { result } = renderHook(() => useLoadable('ai-desktop-studio://poster/asset_1'))

    act(() => result.current.onError())
    act(() => result.current.onError())

    expect(result.current.src).toBeUndefined()
  })

  /**
   * A signed URL that has expired answers the same 403 however often it is asked. Retried like a
   * still, a grid of them would double every request to learn what the first already said.
   */
  it('drops a url nobody here serves at its first failure', () => {
    const { result } = renderHook(() => useLoadable('https://cdn/expired.png'))

    act(() => result.current.onError())

    expect(result.current.src).toBeUndefined()
  })

  // A new url is a new picture: neither the failure of the old one nor what it spent condemns it.
  it('takes a fresh url after a failure, with an attempt of its own', () => {
    const { result, rerender } = renderHook(({ url }) => useLoadable(url), {
      initialProps: { url: 'https://cdn/expired.png' },
    })
    act(() => result.current.onError())

    rerender({ url: 'https://cdn/other.png' })

    expect(result.current.src).toBe('https://cdn/other.png')
    expect(result.current.attempt).toBe(0)
  })

  it('has nothing to show without a url', () => {
    const { result } = renderHook(() => useLoadable())

    expect(result.current.src).toBeUndefined()
  })
})
