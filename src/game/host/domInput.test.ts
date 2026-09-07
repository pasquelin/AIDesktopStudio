// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from 'vitest'
import { createDomInput } from './domInput'
import type { InputPort } from '../ports/inputPort'

describe('keyboard and pointer read off the page', () => {
  let target: HTMLElement
  let input: InputPort

  beforeEach(() => {
    target = document.createElement('div')
    input = createDomInput(target)
  })

  const key = (type: string, code: string): void => {
    target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: false }))
  }

  it('holds a key down, and hands the press to ONE step', () => {
    key('keydown', 'KeyW')

    expect(input.state().held).toEqual(['KeyW'])
    expect(input.state().pressed).toEqual(['KeyW'])

    input.endStep()
    expect(input.state().held).toEqual(['KeyW'])
    expect(input.state().pressed).toEqual([])
  })

  it('takes a key repeating for the same press, not a second one', () => {
    key('keydown', 'KeyW')
    input.endStep()
    key('keydown', 'KeyW')

    expect(input.state().pressed).toEqual([])
  })

  it('lets go of a key that came up, and says it came up', () => {
    key('keydown', 'Space')
    input.endStep()
    key('keyup', 'Space')

    expect(input.state().held).toEqual([])
    expect(input.state().released).toEqual(['Space'])
  })

  /** Losing focus never sends the `keyup`: the player would walk into a wall on coming back. */
  it('drops everything held when focus goes', () => {
    key('keydown', 'KeyW')
    target.dispatchEvent(new MouseEvent('pointerdown'))
    input.endStep()
    target.dispatchEvent(new Event('blur'))

    expect(input.state().held).toEqual([])
    expect(input.state().released).toEqual(['KeyW'])
    expect(input.state().pointer.down).toBe(false)
  })

  /** `blur` does not bubble: a target whose child holds the focus would never hear it. */
  it('drops everything when focus leaves the page from a child', () => {
    key('keydown', 'KeyW')
    target.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))

    expect(input.state().held).toEqual([])
  })

  it('keeps what is held while the focus only moves inside', () => {
    key('keydown', 'KeyW')
    const elsewhere = document.createElement('button')
    target.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere }))

    expect(input.state().held).toEqual(['KeyW'])
  })

  it('follows the pointer and its button', () => {
    target.dispatchEvent(new MouseEvent('pointermove', { clientX: 12, clientY: 34 }))
    target.dispatchEvent(new MouseEvent('pointerdown'))

    expect(input.state().pointer).toEqual({ x: 12, y: 34, down: true })

    target.dispatchEvent(new MouseEvent('pointerup'))
    expect(input.state().pointer.down).toBe(false)
  })

  /** A gesture the system takes over — a scroll, a call — never sends its `pointerup`. */
  it('lets the button up when the gesture is taken away', () => {
    target.dispatchEvent(new MouseEvent('pointerdown'))
    target.dispatchEvent(new MouseEvent('pointercancel'))

    expect(input.state().pointer.down).toBe(false)
  })

  it('hears nothing more once it has let go of the page', () => {
    input.detach()
    key('keydown', 'KeyW')

    expect(input.state().held).toEqual([])
  })

  it('reads standard gamepad axes and analog buttons with the keyboard state', () => {
    input = createDomInput(target, () => [
      {
        id: 'DualSense',
        index: 0,
        mapping: 'standard',
        axes: [0, -1],
        buttons: [0, 0.8],
      },
    ])

    expect(input.state().gamepads).toEqual([
      {
        id: 'DualSense',
        index: 0,
        mapping: 'standard',
        axes: [0, -1],
        buttons: [0, 0.8],
      },
    ])
  })
})
