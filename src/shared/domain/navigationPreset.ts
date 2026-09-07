import type { BindingOverrides } from './command'

/**
 * How each 3D application people already know drives its viewport, as data.
 *
 * A preset is a PARTIAL layer: it declares only what its application does differently, and
 * everything it says nothing about falls back to the studio's own. That is what lets AI Desktop Studio
 * keep the commands the others have no equivalent for, whichever preset is chosen.
 *
 * Resolution, in order: the studio's default, then the preset, then what the person remapped —
 * which always wins. See `bindingOf`.
 */
export type NavigationPreset = 'studio' | 'unreal' | 'unity' | 'blender' | 'roblox' | 'custom'

export const NAVIGATION_PRESETS: readonly NavigationPreset[] = [
  'studio',
  'unreal',
  'unity',
  'blender',
  'roblox',
  'custom',
]

/**
 * When the movement keys belong to the camera.
 *
 * `always` is Roblox's, and it is the one that COSTS something: the letters stop being available
 * to the scene's commands, which is precisely why Unity and Unreal gate theirs behind a button.
 */
export type FlyMode = 'anyButton' | 'rightButton' | 'always'

/** Every scheme but one's own, which is composed rather than declared — see `schemeFor`. */
export type DeclaredPreset = Exclude<NavigationPreset, 'custom'>

/** A mouse gesture, spelled as the parts a `PointerEvent` carries. */
export type GestureChord = {
  /** 0 left, 1 middle, 2 right — as `PointerEvent.button` numbers them. */
  button: number
  /**
   * Another button that must already be DOWN. Read off `buttons`, the only field that names a
   * button nobody just pressed — `button` carries the one that changed and nothing else.
   */
  held?: number
  alt?: boolean
  shift?: boolean
  ctrl?: boolean
}

export type NavigationScheme = {
  orbit: readonly GestureChord[]
  pan: readonly GestureChord[]
  /** Read BEFORE the two above: a chord that adds a button or a modifier to one of theirs. */
  dolly: readonly GestureChord[]
  fly: FlyMode
  /** Only what THIS application binds differently. Everything absent keeps the studio's key. */
  bindings: BindingOverrides
}

/**
 * What a flight with nothing held has to move out of its way, whichever scheme asks for it.
 *
 * `scene.display` is the subtle one: its key is the character `z`, which on AZERTY sits where
 * `forward` is read by POSITION — a binding is signed by the character, a motion by the place.
 */
const DISPLACED_BY_A_PERMANENT_FLIGHT: BindingOverrides = {
  'scene.scale': 'KeyT',
  'scene.display': 'KeyK',
  // Shift is BOOST, so a flight reads ⇧A as boost-strafe-left and swallows it whole. Chords are
  // NOT safe under a permanent flight — only the ones `motionFor` refuses are.
  'scene.add': 'Shift+KeyN',
  'scene.quad': 'Shift+KeyU',
  'scene.quadEdges': 'Shift+KeyJ',
}

/** The chords the five schemes are built from, spelled once. */
const ALT_LEFT: readonly GestureChord[] = [{ button: 0, alt: true }]
const ANY_LEFT: readonly GestureChord[] = [{ button: 0 }, { button: 0, alt: true }]
const MIDDLE: readonly GestureChord[] = [{ button: 1 }]
const SHIFT_MIDDLE: readonly GestureChord[] = [{ button: 1, shift: true }]
const ALT_MIDDLE: readonly GestureChord[] = [{ button: 1 }, { button: 1, alt: true }]
const SHIFT_ALT_LEFT: readonly GestureChord[] = [{ button: 0, alt: true, shift: true }]
const ALT_RIGHT: readonly GestureChord[] = [{ button: 2, alt: true }]
const CTRL_MIDDLE: readonly GestureChord[] = [{ button: 1, ctrl: true }]
/** Available to custom schemes; Unreal itself does not call its two-button vertical move a pan. */
const RIGHT_ONTO_LEFT: readonly GestureChord[] = [{ button: 2, held: 0 }]
/** The three verbs every one of them puts on the same three keys — or does not. */
const UNITY_TOOLS: BindingOverrides = {
  'scene.translate': 'KeyW',
  'scene.rotate': 'KeyE',
  'scene.scale': 'KeyR',
}

export const SCHEME_OF: Record<DeclaredPreset, NavigationScheme> = {
  /**
   * The studio's own, and the DEFAULT. Its layer is empty by construction: it IS the fallback
   * every other preset falls back to, so choosing it resets the keys to what the repo declares.
   */
  studio: {
    // The left button draws the marquee, here as under the four others. Its orbit was the one
    // gesture no other application gives it, and it cost the selection every drag.
    orbit: ALT_LEFT,
    pan: [...MIDDLE, ...SHIFT_ALT_LEFT],
    dolly: ALT_RIGHT,
    fly: 'anyButton',
    bindings: {},
  },
  unreal: {
    orbit: ALT_LEFT,
    // Unreal's standard middle drag and Maya-style Alt+middle are the same pan here: `MIDDLE`
    // deliberately accepts modifiers it does not name. LMB+RMB moves vertically in Unreal; the
    // viewport has no vertical-drag gesture, so it must not be mislabeled as a pan.
    pan: MIDDLE,
    dolly: ALT_RIGHT,
    fly: 'rightButton',
    bindings: UNITY_TOOLS,
  },
  unity: {
    orbit: ALT_LEFT,
    pan: ALT_MIDDLE,
    dolly: ALT_RIGHT,
    fly: 'rightButton',
    bindings: UNITY_TOOLS,
  },
  /**
   * The one that orbits on the MIDDLE button, where the other three pan with it. Its transform
   * verbs are already the studio's — `G` `R` `S` came from here — so its layer only moves the
   * walk mode onto the chord Blender gives it.
   */
  blender: {
    orbit: MIDDLE,
    pan: SHIFT_MIDDLE,
    dolly: CTRL_MIDDLE,
    fly: 'anyButton',
    bindings: {
      'scene.navigate': 'Shift+Backquote',
      // The numbered views of the keypad, which is a POSITION of its own — see `codeOf`, which
      // named these by the digit they print until this scheme asked for them.
      'scene.viewFront': 'Numpad1',
      'scene.viewBack': 'Ctrl+Numpad1',
      'scene.viewRight': 'Numpad3',
      'scene.viewLeft': 'Ctrl+Numpad3',
      'scene.viewTop': 'Numpad7',
      'scene.viewBottom': 'Ctrl+Numpad7',
      'scene.viewCamera': 'Numpad0',
      'scene.projection': 'Numpad5',
      'scene.frame': 'NumpadDecimal',
    },
  },
  /**
   * The only one where the letters are the camera's with nothing held — and so the only one that
   * has to MOVE the two commands they would otherwise take. `scene.display` is the subtle one:
   * its key is the character `z`, which on AZERTY sits where `forward` is read by POSITION.
   */
  roblox: {
    orbit: ALT_LEFT,
    pan: MIDDLE,
    dolly: ALT_RIGHT,
    fly: 'always',
    bindings: DISPLACED_BY_A_PERMANENT_FLIGHT,
  },
}

/**
 * The three gestures a person may put where they like, each a NAMED chord rather than a free
 * capture: a choice is a descriptor the settings screen already draws, where recording a chord
 * would be an interface of its own — and one gesture per row is all any of the five presets uses.
 */
export type CustomOrbit = 'leftAlt' | 'left' | 'middle'
export type CustomPan = 'middle' | 'middleShift' | 'leftAltShift'
export type CustomDolly = 'altRight' | 'ctrlMiddle' | 'rightOntoLeft'

export const CUSTOM_ORBITS: readonly CustomOrbit[] = ['leftAlt', 'left', 'middle']
export const CUSTOM_PANS: readonly CustomPan[] = ['middle', 'middleShift', 'leftAltShift']
export const CUSTOM_DOLLIES: readonly CustomDolly[] = ['altRight', 'ctrlMiddle', 'rightOntoLeft']
export const FLY_MODES: readonly FlyMode[] = ['anyButton', 'rightButton', 'always']

const ORBIT_CHORD: Record<CustomOrbit, readonly GestureChord[]> = {
  leftAlt: ALT_LEFT,
  left: ANY_LEFT,
  middle: MIDDLE,
}

const PAN_CHORD: Record<CustomPan, readonly GestureChord[]> = {
  middle: MIDDLE,
  middleShift: SHIFT_MIDDLE,
  leftAltShift: SHIFT_ALT_LEFT,
}

const DOLLY_CHORD: Record<CustomDolly, readonly GestureChord[]> = {
  altRight: ALT_RIGHT,
  ctrlMiddle: CTRL_MIDDLE,
  rightOntoLeft: RIGHT_ONTO_LEFT,
}

/** What a person's own scheme is made of. Their KEYS need nothing here: `shortcuts.overrides` is
 * already the layer above every preset, so it is custom whichever one is chosen. */
export type CustomNavigation = {
  orbit: CustomOrbit
  pan: CustomPan
  dolly: CustomDolly
  fly: FlyMode
}

/**
 * The three choices read off the settings branch they live in. Typed by SHAPE and not by
 * `Settings['three']`: that module imports this one, and naming it would close the loop.
 */
export function customFrom(three: {
  navigationCustomOrbit: CustomOrbit
  navigationCustomPan: CustomPan
  navigationCustomDolly: CustomDolly
  navigationCustomFly: FlyMode
}): CustomNavigation {
  return {
    orbit: three.navigationCustomOrbit,
    pan: three.navigationCustomPan,
    dolly: three.navigationCustomDolly,
    fly: three.navigationCustomFly,
  }
}

function sameChord(one: GestureChord, other: GestureChord): boolean {
  return (
    one.button === other.button &&
    (one.alt ?? false) === (other.alt ?? false) &&
    (one.shift ?? false) === (other.shift ?? false) &&
    (one.ctrl ?? false) === (other.ctrl ?? false)
  )
}

/** What a pan keeps once the orbit has taken what they share — Blender's chord where nothing. */
function panApartFrom(
  pan: readonly GestureChord[],
  orbit: readonly GestureChord[],
): readonly GestureChord[] {
  const kept = pan.filter(chord => !orbit.some(other => sameChord(chord, other)))
  return kept.length > 0 ? kept : SHIFT_MIDDLE
}

/**
 * The scheme in force. `custom` is composed from what the person chose; every other preset is
 * the table declared above, and neither carries bindings for `custom` — see `CustomNavigation`.
 */
export function schemeFor(preset: NavigationPreset, custom: CustomNavigation): NavigationScheme {
  if (preset !== 'custom') return SCHEME_OF[preset]

  return {
    orbit: ORBIT_CHORD[custom.orbit],
    // Orbit wins a chord both name, and the pan falls back rather than emptying: naming the
    // middle button for both is two clicks from the default, and it took panning away in silence.
    pan: panApartFrom(PAN_CHORD[custom.pan], ORBIT_CHORD[custom.orbit]),
    // Kept whole where the pan is pared down: a dolly is read BEFORE both, so a chord it shares
    // with either is one it wins rather than one that empties it.
    dolly: DOLLY_CHORD[custom.dolly],
    fly: custom.fly,
    // The cost of `always` follows the MODE, not the application that asked for it: a scheme of
    // one's own that hands the letters to the camera swallows the same commands.
    bindings: custom.fly === 'always' ? DISPLACED_BY_A_PERMANENT_FLIGHT : {},
  }
}
