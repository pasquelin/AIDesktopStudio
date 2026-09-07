// SPDX-License-Identifier: MIT

/** Where the pointer is, in the client pixels the event reported, and whether it is held down. */
export type Pointer = { x: number; y: number; down: boolean }

/** A controller snapshot, normalised so the runtime does not depend on the DOM Gamepad object. */
export type GamepadState = {
  id: string
  index: number
  mapping: string
  axes: readonly number[]
  buttons: readonly number[]
}

/**
 * Everything one step needs to know, in ONE value.
 *
 * Grouped deliberately. Measured on 2026-08-26: a call across the script bridge costs 1,34 µs
 * against 0,150 ms for a thousand of the same operations done inside the machine — the bridge is
 * worth nine times the calculation. A port answering one key at a time would pay it per key.
 */
export type InputState = {
  /** Key codes held, spelt as `KeyboardEvent.code` does — `KeyW`, `Space`. */
  held: readonly string[]
  /** What went down, and what came up, since the previous step closed. */
  pressed: readonly string[]
  released: readonly string[]
  pointer: Pointer
  /** Connected controllers at this step. Absent keeps old hosts and replay fixtures compatible. */
  gamepads?: readonly GamepadState[]
}

export type InputPort = {
  state: () => InputState
  /**
   * Where the pointer is RIGHT NOW, for what is read once a frame rather than once a step. Live,
   * and rewritten in place: copy it to keep it. `state` allocates five objects, three of them key
   * lists the look never reads.
   */
  pointer: () => Pointer
  /**
   * Closes the step: `pressed` and `released` answer for what happened since the last call. The
   * runtime calls it, never a script.
   */
  endStep: () => void
  /** Lets go of whatever the host attached this to. */
  detach: () => void
}
