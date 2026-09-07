// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InputSettings } from './InputSettings'

function gamepad(id: string, index: number): Gamepad {
  // The component reads only discovery fields; constructing browser-owned buttons adds no signal.
  return { id, index, connected: true } as Gamepad
}

afterEach(() => vi.restoreAllMocks())

describe('input devices in settings', () => {
  it('lists the keyboard, mouse and every connected gamepad', () => {
    const getGamepads = vi.fn(() => [gamepad('Wireless Controller', 0), null])
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads })

    render(<InputSettings />)

    expect(screen.getByText('Clavier')).toBeInTheDocument()
    expect(screen.getByText('Souris')).toBeInTheDocument()
    expect(screen.getByText('Wireless Controller')).toBeInTheDocument()
  })

  /**
   * 🛑 An empty list is what a plugged-in gamepad looks like until a button is pressed — the
   * browser hides it. Without this line the normal state reads as a breakage.
   */
  it('says a gamepad is only seen after a first press when none is listed', () => {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] })

    render(<InputSettings />)

    expect(screen.getByText(/premier appui/)).toBeInTheDocument()
  })

  it('says where the game’s own keys are set, which is never this page', () => {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] })

    render(<InputSettings />)

    expect(screen.getByText('Les commandes du jeu')).toBeInTheDocument()
    expect(screen.getByText(/Explorateur/)).toBeInTheDocument()
  })

  it('refreshes the list when a gamepad connects', () => {
    const getGamepads = vi
      .fn<() => (Gamepad | null)[]>()
      .mockReturnValueOnce([])
      .mockReturnValue([gamepad('Arcade Stick', 1)])
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads })
    render(<InputSettings />)

    fireEvent(window, new Event('gamepadconnected'))

    expect(screen.getByText('Arcade Stick')).toBeInTheDocument()
  })

  // 🛑 Listed and inert otherwise: every reader answers zero for a mapping it cannot name, so a
  // controller shown here did nothing and said nothing.
  it('says a controller it cannot read is one it cannot read', () => {
    Object.defineProperty(window.navigator, 'getGamepads', {
      value: () => [{ index: 0, id: 'Odd Pad', connected: true, mapping: '' }],
      configurable: true,
    })

    render(<InputSettings />)

    expect(screen.getByText(/disposition standard/)).toBeVisible()
  })
})
