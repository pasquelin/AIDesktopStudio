// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useInputCapture } from './useInputCapture'

afterEach(() => vi.restoreAllMocks())

describe('binding a control by pressing it', () => {
  it('takes the next key and stops waiting', () => {
    const taken = vi.fn()
    const { result } = renderHook(() => useInputCapture())

    act(() => result.current.captureKey(taken))
    expect(result.current.capturing).toBe(true)

    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' })))

    expect(taken).toHaveBeenCalledWith('KeyJ')
    expect(result.current.capturing).toBe(false)
  })

  /** 🛑 Escape gives up: without it, a capture armed by accident binds the next key typed. */
  it('binds nothing on Escape', () => {
    const taken = vi.fn()
    const { result } = renderHook(() => useInputCapture())

    act(() => result.current.captureKey(taken))
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })))

    expect(taken).not.toHaveBeenCalled()
    expect(result.current.capturing).toBe(false)
  })

  it('binds nothing at all while nothing is armed', () => {
    const taken = vi.fn()
    const { result } = renderHook(() => useInputCapture())

    act(() => result.current.captureKey(taken))
    act(() => result.current.cancel())
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' })))

    expect(taken).not.toHaveBeenCalled()
  })

  it('takes the gamepad control pushed past its rest, and ignores a drifting stick', async () => {
    const pad = (leftX: number, south: number): Gamepad =>
      ({
        mapping: 'standard',
        axes: [leftX, 0, 0, 0],
        buttons: [{ value: south }, ...new Array(16).fill({ value: 0 })],
      }) as unknown as Gamepad
    const getGamepads = vi
      .fn<() => (Gamepad | null)[]>()
      .mockReturnValueOnce([pad(0.1, 0)])
      .mockReturnValue([pad(0.1, 1)])
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads })
    const taken = vi.fn()
    const { result } = renderHook(() => useInputCapture())

    act(() => result.current.captureGamepadControl(taken))
    await vi.waitFor(() => expect(taken).toHaveBeenCalledWith('south'))
    // Waited for too: the taker is called from inside the frame, and React commits after it.
    await vi.waitFor(() => expect(result.current.capturing).toBe(false))
  })

  /**
   * 🛑 An `axis2` action takes `leftStick` and refuses `leftStickX`, so answering the axis alone
   * bound nothing at all on `move` and `look` — the two the capture exists for.
   */
  it('reads a pushed stick as the whole stick when a single axis is refused', async () => {
    const pad = {
      mapping: 'standard',
      axes: [0, 0, 0.9, 0],
      buttons: new Array(17).fill({ value: 0 }),
    } as unknown as Gamepad
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: vi.fn<() => (Gamepad | null)[]>().mockReturnValue([pad]),
    })
    const taken = vi.fn()
    const { result } = renderHook(() => useInputCapture())

    act(() => result.current.captureGamepadControl(taken, control => control === 'rightStick'))
    await vi.waitFor(() => expect(taken).toHaveBeenCalledWith('rightStick'))
  })

  it('keeps waiting rather than binding a control the action refuses', async () => {
    const pad = {
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: [{ value: 1 }, ...new Array(16).fill({ value: 0 })],
    } as unknown as Gamepad
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: vi.fn<() => (Gamepad | null)[]>().mockReturnValue([pad]),
    })
    const taken = vi.fn()
    const { result } = renderHook(() => useInputCapture())

    act(() => result.current.captureGamepadControl(taken, control => control === 'leftStick'))
    await new Promise(resolve => setTimeout(resolve, 40))

    expect(taken).not.toHaveBeenCalled()
    expect(result.current.capturing).toBe(true)
    act(() => result.current.cancel())
  })

  /** 🛑 A keystroke used to stop a stick capture dead, binding nothing and saying nothing. */
  it('lets a key through while a gamepad control is waited on, and keeps Escape', () => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: vi.fn<() => (Gamepad | null)[]>().mockReturnValue([]),
    })
    const taken = vi.fn()
    const { result } = renderHook(() => useInputCapture())

    act(() => result.current.captureGamepadControl(taken))
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' })))

    expect(result.current.capturing).toBe(true)

    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })))

    expect(result.current.capturing).toBe(false)
    expect(taken).not.toHaveBeenCalled()
  })
})
