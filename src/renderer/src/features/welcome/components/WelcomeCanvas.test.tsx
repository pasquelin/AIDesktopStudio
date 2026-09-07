import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WelcomeCanvas } from './WelcomeCanvas'

const constructed = vi.hoisted(() => ({
  options: [] as { reduceMotion: boolean; slide: number }[],
}))

vi.mock('@/engines/welcome/WelcomeBackdrop', () => ({
  WelcomeBackdrop: class {
    constructor(_canvas: HTMLCanvasElement, options: { reduceMotion: boolean; slide: number }) {
      constructed.options.push(options)
    }
    resize() {}
    dispose() {}
    setReduceMotion() {}
    setSlide() {}
  },
}))

vi.mock('@/stores/settings', () => ({
  useSettings: (
    select: (state: { settings: { appearance: { reduceMotion: boolean } } }) => unknown,
  ) => select({ settings: { appearance: { reduceMotion: true } } }),
}))

describe('WelcomeCanvas', () => {
  it('starts the backdrop already reduced when the setting is on', () => {
    constructed.options = []
    const original = globalThis.ResizeObserver
    // The stub only needs the methods the effect calls; jsdom types the full observer.
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver
    render(<WelcomeCanvas slide={2} />)

    expect(constructed.options).toEqual([{ reduceMotion: true, slide: 2 }])
    globalThis.ResizeObserver = original
  })
})
