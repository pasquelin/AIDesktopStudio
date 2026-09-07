// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GamepadControl } from '@shared/domain/inputMap'
import { GAMEPAD_AXES, GAMEPAD_BUTTONS } from '@game/runtime/inputMaps'

/** Below this a resting stick still drifts and a trigger still reads a few hundredths. */
const PRESSED = 0.6

export type InputCapture = {
  /** Whether a control is being waited on right now — the button says so while it is true. */
  capturing: boolean
  /** Waits for the next key. Answers a `KeyboardEvent.code`; Escape gives up. */
  captureKey: (taken: (code: string) => void) => void
  /**
   * Waits for the next gamepad control pushed past its rest, on any standard controller. A push
   * `accepts` refuses keeps the capture WAITING rather than binding nothing in silence.
   */
  captureGamepadControl: (
    taken: (control: GamepadControl) => void,
    accepts?: (control: GamepadControl) => boolean,
  ) => void
  /** Gives up without binding anything. */
  cancel: () => void
}

const ANY = (): boolean => true

/**
 * 🛑 « Press the key you want » rather than typing `ShiftLeft` into a text field, which is what
 * the expert editor asked for and what nobody knows by heart. The exported game's controls menu
 * has done this since it shipped; this is the same gesture, in the studio.
 */
export function useInputCapture(): InputCapture {
  const [mode, setMode] = useState<'key' | 'gamepad' | null>(null)
  // Held in refs, not in state: the listener is attached once and must see the latest taker.
  const keyTaker = useRef<((code: string) => void) | null>(null)
  const padTaker = useRef<((control: GamepadControl) => void) | null>(null)
  const polling = useRef(0)

  const stop = useCallback((): void => {
    keyTaker.current = null
    padTaker.current = null
    if (polling.current !== 0) cancelAnimationFrame(polling.current)
    polling.current = 0
    setMode(null)
  }, [])

  useEffect(() => {
    if (mode === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      // 🛑 Waiting on a STICK, only Escape is ours: eating every key would swallow ⌘S, and taking
      // one would cancel the capture without binding anything and without a word.
      if (mode === 'gamepad' && event.code !== 'Escape') return
      // The capture eats the key: Space on the armed button would otherwise press it again.
      event.preventDefault()
      const take = keyTaker.current
      stop()
      if (event.code !== 'Escape') take?.(event.code)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [mode, stop])

  const captureKey = useCallback((taken: (code: string) => void): void => {
    keyTaker.current = taken
    setMode('key')
  }, [])

  const captureGamepadControl = useCallback(
    (
      taken: (control: GamepadControl) => void,
      accepts: (control: GamepadControl) => boolean = ANY,
    ): void => {
      padTaker.current = taken
      setMode('gamepad')
      const look = (): void => {
        const pushed = pushedControl(accepts)
        if (pushed === null) {
          polling.current = requestAnimationFrame(look)
          return
        }
        const take = padTaker.current
        stop()
        take?.(pushed)
      }
      polling.current = requestAnimationFrame(look)
    },
    [stop],
  )

  // Escape hatch for a panel closed mid-capture: the frame loop must not outlive the editor.
  useEffect(() => stop, [stop])

  return { capturing: mode !== null, captureKey, captureGamepadControl, cancel: stop }
}

/** The first control of any connected standard controller `accepts` reads in a push, or nothing. */
function pushedControl(accepts: (control: GamepadControl) => boolean): GamepadControl | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null
  for (const gamepad of navigator.getGamepads()) {
    if (!gamepad || gamepad.mapping !== 'standard') continue
    const taken = readingsOf(gamepad).find(accepts)
    if (taken !== undefined) return taken
  }
  return null
}

/**
 * 🛑 What ONE push can be read as, WIDEST first: a stick before either of its axes. An `axis2`
 * action takes `leftStick` and nothing else, so answering `leftStickX` alone bound nothing at
 * all on `move` and `look` — the two the feature exists for.
 */
function readingsOf(gamepad: Gamepad): readonly GamepadControl[] {
  const button = gamepad.buttons.findIndex(one => one.value > PRESSED)
  if (button >= 0) {
    const named = GAMEPAD_BUTTONS[button]
    return named === undefined ? [] : [named]
  }
  const axis = gamepad.axes.findIndex(value => Math.abs(value) > PRESSED)
  const named = GAMEPAD_AXES[axis]
  return named === undefined ? [] : [axis < 2 ? 'leftStick' : 'rightStick', named]
}
