// SPDX-License-Identifier: MIT

import type { GamepadState, InputPort, InputState, Pointer } from '../ports/inputPort'

/**
 * What the port attaches to — a viewport in the studio, the page in an exported game. Pointer
 * capture is optional: it is what brings a release back when the drag left the element.
 */
export type DomInputTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> &
  Partial<Pick<Element, 'setPointerCapture'>>

export type GamepadReader = () => readonly GamepadState[]

/**
 * Both hosts share it — what differs is WHICH element they hand over. Key codes rather than named
 * actions: what binds a key to an action is the author's, and has nowhere to be declared yet.
 */
export function createDomInput(
  target: DomInputTarget,
  gamepads: GamepadReader = readGamepads,
): InputPort {
  const held = new Set<string>()
  const pressed = new Set<string>()
  const released = new Set<string>()
  const pointer: Pointer = { x: 0, y: 0, down: false }

  const onKeyDown = (event: Event): void => {
    const code = keyCode(event)
    // A key held down repeats, and a repeat is not a press: the edge is the first event only.
    if (code === null || held.has(code)) return
    held.add(code)
    pressed.add(code)
  }

  const onKeyUp = (event: Event): void => {
    const code = keyCode(event)
    if (code === null) return
    held.delete(code)
    released.add(code)
  }

  const onPointerMove = (event: Event): void => {
    const at = pointerAt(event)
    if (at === null) return
    pointer.x = at.x
    pointer.y = at.y
  }

  const onPointerDown = (event: Event): void => {
    pointer.down = true
    // Without capture, a drag released outside the element never sends its `pointerup` here and
    // the button stays down for ever.
    const id: unknown = 'pointerId' in event ? event.pointerId : null
    if (typeof id === 'number') target.setPointerCapture?.(id)
  }

  const onPointerUp = (): void => {
    pointer.down = false
  }

  // A window that loses focus never gets the `keyup`, so the key stays held for ever and the
  // player walks into a wall on coming back.
  const onLostFocus = (): void => {
    for (const code of held) released.add(code)
    held.clear()
    pointer.down = false
  }

  // `blur` does not bubble, so a target whose CHILD holds the focus never hears it. `focusout`
  // does bubble, and a null `relatedTarget` is focus leaving everything rather than moving inside.
  const onFocusOut = (event: Event): void => {
    const next: unknown = 'relatedTarget' in event ? event.relatedTarget : null
    if (next === null) onLostFocus()
  }

  const listeners: readonly [string, (event: Event) => void][] = [
    ['keydown', onKeyDown],
    ['keyup', onKeyUp],
    ['pointermove', onPointerMove],
    ['pointerdown', onPointerDown],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerUp],
    ['blur', onLostFocus],
    ['focusout', onFocusOut],
  ]

  for (const [name, listener] of listeners) target.addEventListener(name, listener)

  return {
    state: (): InputState => ({
      held: [...held],
      pressed: [...pressed],
      released: [...released],
      pointer: { ...pointer },
      gamepads: gamepads(),
    }),
    pointer: () => pointer,
    endStep: () => {
      pressed.clear()
      released.clear()
    },
    detach: () => {
      for (const [name, listener] of listeners) target.removeEventListener(name, listener)
    },
  }
}

/** Every connected pad in the shape a map is resolved against — the studio reads it too. */
export function readGamepads(): readonly GamepadState[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return []
  return Array.from(navigator.getGamepads()).flatMap(gamepad =>
    gamepad
      ? [
          {
            id: gamepad.id,
            index: gamepad.index,
            mapping: gamepad.mapping,
            axes: Array.from(gamepad.axes),
            buttons: gamepad.buttons.map(button => button.value),
          },
        ]
      : [],
  )
}

/** Read off the event rather than narrowed by `instanceof`, which answers false across realms. */
function keyCode(event: Event): string | null {
  const code: unknown = 'code' in event ? event.code : null
  return typeof code === 'string' && code.length > 0 ? code : null
}

function pointerAt(event: Event): { x: number; y: number } | null {
  const x: unknown = 'clientX' in event ? event.clientX : null
  const y: unknown = 'clientY' in event ? event.clientY : null
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
}
