import type { GestureChord, NavigationScheme } from '@shared/domain/navigationPreset'

/**
 * Which navigation gesture a button starts, under the scheme in force.
 *
 * `null` leaves the event to whoever else wants it — a bare left button draws the marquee, and a
 * bare right one flies the camera and raises the menu after it.
 */
export type Gesture = 'orbit' | 'pan' | 'dolly'

/** The parts of a `PointerEvent` a chord is read from, so a test never builds a real one. */
export type GestureButton = {
  button: number
  altKey: boolean
  shiftKey: boolean
  ctrlKey?: boolean
  /** The bitmask of what is DOWN, which is the only reading a two-button chord can be read from. */
  buttons?: number
}

const MASK_OF: Readonly<Record<number, number>> = { 0: 1, 1: 4, 2: 2 }

/** The bit `buttons` sets for a button `button` numbers: middle is 4 there, right is 2. */
export function maskOf(button: number): number {
  return MASK_OF[button] ?? 0
}

/**
 * A chord answers on the modifiers it DECLARES and ignores the rest — which is what lets a bare
 * `{ button: 0 }` answer under the keys that extend a selection. The three are read narrowest
 * first, so a chord that adds a button or a modifier to another's wins over it.
 */
function matches(chord: GestureChord, event: GestureButton): boolean {
  if (chord.button !== event.button) return false
  if (chord.held !== undefined && ((event.buttons ?? 0) & maskOf(chord.held)) === 0) return false
  if (chord.alt !== undefined && chord.alt !== event.altKey) return false
  if (chord.shift !== undefined && chord.shift !== event.shiftKey) return false
  return chord.ctrl === undefined || chord.ctrl === (event.ctrlKey ?? false)
}

export function gestureOf(event: GestureButton, scheme: NavigationScheme): Gesture | null {
  // Dolly first: every chord it holds ADDS a button or a modifier to one the other two answer
  // on, so read after them it would never be reached — Blender's ⌃middle is orbit's own button.
  if (scheme.dolly.some(chord => matches(chord, event))) return 'dolly'
  if (scheme.pan.some(chord => matches(chord, event))) return 'pan'
  return scheme.orbit.some(chord => matches(chord, event)) ? 'orbit' : null
}
