// SPDX-License-Identifier: MIT
import { useEffect } from 'react'
import type { InputMap } from '@shared/domain/inputMap'
import { inputMapPreset } from '@shared/domain/inputPresets'
import { readGamepads } from '@game/host/domInput'
import { createInputActions, type InputActions } from '@game/runtime/inputActions'
import {
  onInputMapsChanged,
  projectInputMaps,
  withoutDuplicateInputMapIds,
} from '@/engines/code/projectInputMaps'
import { useProject } from '@/stores/project'
import { useReloadKey } from './useReloadKey'
import { useSettings } from '@/stores/settings'

export type GamepadNavigationState = {
  next: boolean
  previous: boolean
  confirm: boolean
  back: boolean
}

const RESTING: GamepadNavigationState = {
  next: false,
  previous: false,
  confirm: false,
  back: false,
}

/** Where a pushed stick starts counting as a direction, well past any dead zone. */
const PUSHED = 0.5

const STUDIO = 'studio'
const ACTIVE: readonly string[] = [STUDIO]
const NO_KEYS: readonly string[] = []

const FOCUSABLE = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function freshlyPressed(
  current: GamepadNavigationState,
  previous: GamepadNavigationState,
  key: keyof GamepadNavigationState,
): boolean {
  return current[key] && !previous[key]
}

function focusBy(offset: number): void {
  const controls = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible)
  if (controls.length === 0) return
  const current = controls.indexOf(
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body,
  )
  const next = current < 0 ? 0 : (current + offset + controls.length) % controls.length
  controls[next]?.focus()
}

function isVisible(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false
  let current: HTMLElement | null = element
  while (current) {
    const style = getComputedStyle(current)
    if (
      current.hidden ||
      current.inert ||
      current.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden'
    )
      return false
    current = current.parentElement
  }
  return true
}

export function applyGamepadNavigation(
  current: GamepadNavigationState,
  previous: GamepadNavigationState,
): void {
  if (freshlyPressed(current, previous, 'next')) focusBy(1)
  if (freshlyPressed(current, previous, 'previous')) focusBy(-1)
  if (freshlyPressed(current, previous, 'confirm') && document.activeElement instanceof HTMLElement)
    document.activeElement.click()
  if (freshlyPressed(current, previous, 'back') && document.activeElement instanceof HTMLElement)
    document.activeElement.blur()
}

/**
 * 🛑 Read through the RESOLVED `studio` map, never off raw button indices. `useGamepadNavigation`
 * used to test `buttons[0]`, `[12]`–`[15]` and `axes[0..1]` in place, so the `studio` preset —
 * offered in « New control map » beside the four others — could be rebound and saved with nothing
 * whatsoever changing. The stick and the d-pad both answer, as they always did.
 */
export function navigationState(actions: InputActions): GamepadNavigationState {
  const navigate = actions.axis2('navigate')
  return {
    next: actions.button('next') || navigate.x > PUSHED || navigate.y > PUSHED,
    previous: actions.button('previous') || navigate.x < -PUSHED || navigate.y < -PUSHED,
    confirm: actions.button('confirm'),
    back: actions.button('back'),
  }
}

/** The project's own `studio` context if it wrote one, the preset otherwise. */
export async function studioInputMaps(): Promise<readonly InputMap[]> {
  const written = withoutDuplicateInputMapIds(await projectInputMaps())
  return [written.find(one => one.map.id === STUDIO)?.map ?? inputMapPreset(STUDIO)]
}

export function useGamepadNavigation(): void {
  const enabled = useSettings(state => state.settings.input.gamepadNavigation)
  const path = useProject(state => state.project?.path)
  const [written, again] = useReloadKey()

  useEffect(() => onInputMapsChanged(again), [again])

  useEffect(() => {
    if (!enabled || typeof navigator.getGamepads !== 'function') return
    let frame = 0
    let stopped = false

    // Named and `await`ed rather than a `.then`: the maps are read from disk ONCE, before the
    // frame loop starts, and the same array is handed over every frame — `inputActions` holds
    // its selection by identity, and a fresh array each frame would redo it sixty times a second.
    const start = async (): Promise<void> => {
      const maps = await studioInputMaps()
      if (stopped) return
      const actions = createInputActions()
      let previous = RESTING
      frame = requestAnimationFrame(function poll() {
        actions.sample(maps, ACTIVE, { held: NO_KEYS, gamepads: readGamepads() })
        const current = navigationState(actions)
        applyGamepadNavigation(current, previous)
        previous = current
        frame = requestAnimationFrame(poll)
      })
    }
    void start()

    return () => {
      stopped = true
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [enabled, path, written])
}
