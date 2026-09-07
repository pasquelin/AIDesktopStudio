import { describe, expect, it } from 'vitest'
import { SCHEME_OF, type DeclaredPreset } from '@shared/domain/navigationPreset'
import { gestureOf } from './gestures'

const LEFT = { button: 0, altKey: false, shiftKey: false }
const MIDDLE = { button: 1, altKey: false, shiftKey: false }
const RIGHT = { button: 2, altKey: false, shiftKey: false }

/** All five: the rectangle is drawn with the bare left button under every one of them. */
const EVERY: readonly DeclaredPreset[] = ['studio', 'unreal', 'unity', 'blender', 'roblox']
/** The four that pan on the middle button, orbit on Alt+left and close in on Alt+right — every
 * scheme but Blender's, which spends all three of those chords elsewhere. */
const BUT_BLENDER: readonly DeclaredPreset[] = ['studio', 'unreal', 'unity', 'roblox']

const studio = (over = {}) => gestureOf({ ...LEFT, ...over }, SCHEME_OF.studio)

describe('what a button asks the view to do, in the studio', () => {
  it('orbits on alt and the left button, as Unity, Unreal and Maya all do', () => {
    expect(studio({ altKey: true })).toBe('orbit')
  })

  it('pans on the middle button, as Unity, Unreal, Maya and Godot all do', () => {
    expect(studio(MIDDLE)).toBe('pan')
  })

  it('pans on shift, alt and the left button — the trackpad, which has no middle button', () => {
    expect(studio({ altKey: true, shiftKey: true })).toBe('pan')
  })

  it('leaves the bare right button alone, the flight owning it and the menu after it', () => {
    expect(studio(RIGHT)).toBeNull()
  })

  it('closes in on alt and the right button, as Unity does', () => {
    expect(studio({ ...RIGHT, altKey: true })).toBe('dolly')
  })

  /** The gesture the four other applications spend on a rectangle, and the studio now with them. */
  it('leaves a bare left drag free, the rectangle taking it', () => {
    expect(studio()).toBeNull()
  })

  it('leaves it free under the keys that EXTEND a selection, which the rectangle reads', () => {
    expect(studio({ shiftKey: true })).toBeNull()
  })

  /**
   * Swallowed, a press takes `⌥`-click and `⌥⇧`-click on a rail with it — both decided on
   * RELEASE, from a press the picking has to have seen.
   */
  it('names a gesture without claiming the press, the picking deciding on release', () => {
    expect(studio({ altKey: true })).toBe('orbit')
  })
})

describe('what a button asks the view to do, under another application', () => {
  /** The one that orbits on the MIDDLE button, where the other three pan with it. */
  it('orbits on the middle button under Blender, and pans on shift with it', () => {
    expect(gestureOf(MIDDLE, SCHEME_OF.blender)).toBe('orbit')
    expect(gestureOf({ ...MIDDLE, shiftKey: true }, SCHEME_OF.blender)).toBe('pan')
  })

  /** And the middle button pans everywhere else — the reading that separates the two families. */
  it.each(BUT_BLENDER)('pans on the middle button under %s', preset => {
    expect(gestureOf(MIDDLE, SCHEME_OF[preset])).toBe('pan')
  })

  /** Unity and Blender draw a rectangle with it and Unreal dollies: under all five it must reach
   * the picking untouched. */
  it.each(EVERY)('leaves a bare left drag free under %s', preset => {
    expect(gestureOf(LEFT, SCHEME_OF[preset])).toBeNull()
  })

  it.each(BUT_BLENDER)('orbits on alt and the left button under %s', preset => {
    expect(gestureOf({ ...LEFT, altKey: true }, SCHEME_OF[preset])).toBe('orbit')
  })

  it('reads a chord before the bare button it is built on', () => {
    expect(gestureOf({ ...MIDDLE, altKey: true }, SCHEME_OF.unity)).toBe('pan')
  })

  it.each(BUT_BLENDER)('closes in on alt and the right button under %s', preset => {
    expect(gestureOf({ ...RIGHT, altKey: true }, SCHEME_OF[preset])).toBe('dolly')
  })

  /** Read after the orbit it shares a button with, this one would never be reached. */
  it('closes in on ctrl and the middle button under Blender, which orbits on that button', () => {
    expect(gestureOf({ ...MIDDLE, ctrlKey: true }, SCHEME_OF.blender)).toBe('dolly')
    expect(gestureOf(MIDDLE, SCHEME_OF.blender)).toBe('orbit')
  })

  /** Unreal's pan: the right button pressed while the left is already down. */
  it('pans on the right button added to a left one under Unreal, and only then', () => {
    expect(gestureOf({ ...RIGHT, buttons: 1 }, SCHEME_OF.unreal)).toBeNull()
    expect(gestureOf(RIGHT, SCHEME_OF.unreal)).toBeNull()
  })

  /** `buttons` numbers the middle one 4 and the right one 2 — a mask read as a button number
   * would answer for whichever happened to share a bit. */
  it('reads the held button off the mask and not off its number', () => {
    expect(gestureOf({ ...RIGHT, buttons: 4 }, SCHEME_OF.unreal)).toBeNull()
  })
})
