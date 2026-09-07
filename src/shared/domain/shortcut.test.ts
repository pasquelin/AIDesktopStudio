import { describe, expect, it } from 'vitest'
import { bindingOf, commandFor, COMMAND_REGISTRY } from './command'
import { NAVIGATION_PRESETS, SCHEME_OF, type DeclaredPreset } from './navigationPreset'
import {
  acceleratorOf,
  DEFAULT_MOTION,
  isSignature,
  MOTION_IDS,
  reservedByPlatform,
  shortcutLabel,
  signatureOf,
  type KeyChord,
} from './shortcut'

/** No overrides: what the application ships with. */
const shipped = (id: Parameters<typeof bindingOf>[0]): string => bindingOf(id, {}) ?? ''

/**
 * A keypress on a US keyboard, where the character printed on a key and the position it sits at
 * agree. The layouts where they do NOT are the point of this file, and each spells its own `key`.
 */
const event = (code: string, modifiers: Partial<KeyChord> = {}): KeyChord => ({
  code,
  key: '',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
})

/** macOS, where ⌘ is the command key. The other side is covered by `away from macOS` below. */
const MAC = true

const sign = (chord: KeyChord): string => signatureOf(chord, MAC)

describe('signatureOf', () => {
  /**
   * The bug this whole file turns on. On AZERTY the key marked Q sits where a US keyboard puts
   * A, so reading the position signed ⌘Q as `Meta+KeyA` — the canvas's Select All — and the
   * `preventDefault` that followed meant the application could not be quit at all.
   */
  it('names a chord by the character printed on the key, not by its position', () => {
    expect(sign(event('KeyA', { key: 'q', metaKey: true }))).toBe('Meta+KeyQ')
    expect(sign(event('KeyQ', { key: 'a', metaKey: true }))).toBe('Meta+KeyA')
  })

  it('falls back to the position for a key that prints no character it knows', () => {
    expect(sign(event('KeyW'))).toBe('KeyW')
    expect(sign(event('F11'))).toBe('F11')
  })

  /** ⇧ is what a French or German keyboard needs to type a digit at all, so ⌘⇧1 IS the user's ⌘1. */
  it('drops the Shift that merely types a digit, and keeps the one that makes a chord', () => {
    expect(sign(event('Digit1', { key: '1', shiftKey: true, metaKey: true }))).toBe('Meta+Digit1')
    expect(sign(event('KeyA', { key: 'A', shiftKey: true }))).toBe('Shift+KeyA')
    expect(sign(event('Digit1', { key: '!', shiftKey: true }))).toBe('Shift+Digit1')
  })

  it('orders modifiers so the same combination always signs the same', () => {
    expect(sign(event('KeyZ', { metaKey: true, shiftKey: true }))).toBe(
      sign(event('KeyZ', { shiftKey: true, metaKey: true })),
    )
  })

  it('separates a shifted binding from its bare one', () => {
    expect(sign(event('KeyZ', { metaKey: true }))).not.toBe(
      sign(event('KeyZ', { metaKey: true, shiftKey: true })),
    )
  })

  /**
   * The keypad's Enter is its own position, and every binding is spelled `Enter`: the two
   * commands below simply did not answer it. Folded rather than bound twice, so a remap of
   * either one moves both.
   */
  it('reads the keypad Enter as the Enter it shares its meaning with', () => {
    expect(sign(event('NumpadEnter'))).toBe('Enter')
    expect(sign(event('NumpadEnter', { metaKey: true }))).toBe('Meta+Enter')
  })

  it('fires the commands bound to Enter from the keypad', () => {
    expect(commandFor(sign(event('NumpadEnter')), 'canvas', {})).toBe('canvas.cropApply')
  })

  it('follows a remap onto Enter, having no second spelling of its own', () => {
    // A scope with nothing on Enter, so the remap is what puts a command there.
    const moved = { 'scene.translate': 'Enter' }
    expect(commandFor(sign(event('NumpadEnter')), 'scene', moved)).toBe('scene.translate')
    expect(commandFor(sign(event('NumpadEnter')), 'scene', {})).toBeNull()
  })

  /** With the lock off this key is `End`: a command on `Digit1` would fire on a move. */
  it('leaves a keypad digit alone while Num Lock makes it a movement', () => {
    expect(sign(event('Numpad1', { key: 'End' }))).toBe('Numpad1')
  })

  /**
   * And leaves it alone with the lock ON too, where it prints the digit of the main row: Blender
   * puts its numbered views on the pad, and a Mac has no lock to tell the two apart with.
   */
  it('keeps a keypad digit on its own position even once the lock is on', () => {
    expect(sign(event('Numpad1', { key: '1', metaKey: true }))).toBe('Meta+Numpad1')
    expect(sign(event('NumpadDecimal', { key: '.' }))).toBe('NumpadDecimal')
  })
})

/** A French keyboard, where the character printed on a key and its position part company. */
describe('a layout that is not US', () => {
  /**
   * `^` is a dead key and `!` prints a character no US keyboard has bare: neither can be named
   * by what it types, so both stay on their position — which is where the bindings already sit.
   */
  it('names by position the keys whose character it cannot place', () => {
    expect(sign(event('BracketLeft', { key: 'Dead' }))).toBe('BracketLeft')
    expect(commandFor(sign(event('Slash', { key: '!' })), 'scene', {})).toBe('scene.isolate')
  })

  it('reaches the guides through the key marked with a semicolon, wherever it sits', () => {
    const pressed = event('Comma', { key: ';', metaKey: true })

    expect(commandFor(sign(pressed), 'canvas', {})).toBe('canvas.guides')
  })

  /** ⌘ and the key marked Q reaches Quit, and nothing of this studio. */
  it('leaves the platform its own chord', () => {
    expect(commandFor(sign(event('KeyA', { key: 'q', metaKey: true })), 'canvas', {})).toBeNull()
  })
})

describe('away from macOS', () => {
  it('lets Ctrl play the part ⌘ plays, as `CmdOrCtrl` already tells the menu', () => {
    expect(signatureOf(event('KeyZ', { key: 'z', ctrlKey: true }), false)).toBe('Meta+KeyZ')
    expect(commandFor('Meta+KeyZ', 'canvas', {})).toBe('canvas.undo')
  })

  /** Held on macOS, it is a chord of its own; elsewhere Ctrl is the command key. */
  it('keeps ⌘ and Ctrl apart on macOS', () => {
    expect(signatureOf(event('KeyZ', { key: 'z', ctrlKey: true }), MAC)).toBe('Ctrl+KeyZ')
  })

  /**
   * The Windows key names no chord here, and `isSignature` refuses this one spelling on purpose:
   * unspellable, it matches nothing — dropped, Win+Z would have read as the plain `Z`.
   */
  it('leaves the Windows key unable to name a chord', () => {
    const signature = signatureOf(event('KeyZ', { key: 'z', metaKey: true }), false)

    expect(isSignature(signature)).toBe(false)
    expect(commandFor(signature, 'canvas', {})).toBeNull()
  })
})

describe('reservedByPlatform', () => {
  it('names the chords the desktop answers before any window does', () => {
    expect(reservedByPlatform('Meta+KeyQ')).toBe(true)
    expect(reservedByPlatform('Meta+KeyM')).toBe(true)
  })

  /** The platform reserves ⌘, FOR the settings, which is the very thing it opens here. */
  it('leaves ⌘, and ⌘W alone, and says nothing about a chord nobody claims', () => {
    expect(reservedByPlatform('Meta+Comma')).toBe(false)
    expect(reservedByPlatform('Meta+KeyW')).toBe(false)
    expect(reservedByPlatform(shipped('canvas.undo'))).toBe(false)
    expect(reservedByPlatform(null)).toBe(false)
  })
})

describe('defaults', () => {
  it('binds every motion, which is held rather than fired', () => {
    for (const id of MOTION_IDS) expect(DEFAULT_MOTION[id].length).toBeGreaterThan(0)
  })

  it('puts the gizmos on the Blender letters', () => {
    expect(shipped('scene.translate')).toBe('KeyG')
    expect(shipped('scene.rotate')).toBe('KeyR')
    expect(shipped('scene.scale')).toBe('KeyS')
  })

  it('puts flight on the physical ZQSD block with A and E for altitude', () => {
    expect(DEFAULT_MOTION.forward[0]).toBe('KeyW')
    expect(DEFAULT_MOTION.left[0]).toBe('KeyA')
    expect(DEFAULT_MOTION.down[0]).toBe('KeyQ')
    expect(DEFAULT_MOTION.up[0]).toBe('KeyE')
  })

  it('gives the ground plane a second key on the arrows, and altitude none', () => {
    expect(DEFAULT_MOTION.forward).toContain('ArrowUp')
    expect(DEFAULT_MOTION.back).toContain('ArrowDown')
    expect(DEFAULT_MOTION.left).toContain('ArrowLeft')
    expect(DEFAULT_MOTION.right).toContain('ArrowRight')
    // Sorted, so reordering the table stays a cosmetic edit: what is asserted is that these four
    // arrows are bound and no fifth is, altitude having no arrow left to take.
    const arrows = Object.values(DEFAULT_MOTION)
      .flat()
      .filter(code => code.startsWith('Arrow'))
    expect(arrows.toSorted()).toEqual(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'])
  })

  it('overlaps motion and scene commands on exactly one key, which flight modality resolves', () => {
    // KeyS is both "back" and "scale". Flight only answers while the right button is held,
    // so the two never listen at the same time. Documented here so a remap keeps it in mind.
    //
    // Only the scene is checked: motion is flight, flight is the scene, and a timeline command
    // on the same key is resolved by its scope long before either of them is consulted.
    const motion = new Set(Object.values(DEFAULT_MOTION).flat())
    const shared = COMMAND_REGISTRY.filter(
      descriptor => descriptor.scope === 'scene' && motion.has(shipped(descriptor.id)),
    )
    expect(shared.map(descriptor => descriptor.id)).toEqual(['scene.scale'])
  })
})

/** Marks what the caller was asked to name, so a key left unnamed stands out in the output. */
const named = (code: string): string => `<${code}>`

describe('shortcutLabel', () => {
  it('shows the printed letter of a physical key', () => {
    expect(shortcutLabel('KeyG', named, MAC)).toBe('G')
  })

  it('keeps the modifiers in front', () => {
    expect(shortcutLabel('Shift+KeyG', named, MAC)).toBe('⇧G')
  })

  // The bug this replaced: `Delete` and `Space` are words, and read as English ones in French.
  it('has the caller name the keys that are words', () => {
    expect(shortcutLabel('Delete', named, MAC)).toBe('<Delete>')
    expect(shortcutLabel('Meta+Space', named, MAC)).toBe('⌘<Space>')
  })

  it('renders every default binding without leaking a raw code', () => {
    expect(shortcutLabel(shipped('scene.undo'), named, MAC)).toBe('⌘Z')
    expect(shortcutLabel(shipped('scene.redo'), named, MAC)).toBe('⇧⌘Z')
  })
})

/**
 * What Electron takes as the KEY half of an accelerator: a character, a named key, or a function
 * key. A `KeyboardEvent.code` like `Digit0` or `BracketLeft` is none of the three, and Electron
 * refuses the whole binding rather than the key.
 */
const ELECTRON_KEY =
  /^(.|F\d{1,2}|num\d|numdec|numadd|numsub|nummult|numdiv|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|Plus|Capslock|Numlock|PrintScreen)$/

describe('acceleratorOf', () => {
  // The one place a signature and an Electron accelerator meet. The menu wrote these by hand,
  // which is how it kept advertising a key a remapped command no longer answered to.
  it('spells the command key so it works on both platforms', () => {
    expect(acceleratorOf('Meta+KeyN')).toBe('CmdOrCtrl+N')
  })

  it('names the punctuation keys Electron will not take as codes', () => {
    expect(acceleratorOf('Meta+Comma')).toBe('CmdOrCtrl+,')
    expect(acceleratorOf('Meta+Equal')).toBe('CmdOrCtrl+=')
    expect(acceleratorOf('Meta+Semicolon')).toBe('CmdOrCtrl+;')
    expect(acceleratorOf('Meta+Digit0')).toBe('CmdOrCtrl+0')
    expect(acceleratorOf('Alt+Meta+ArrowLeft')).toBe('Alt+CmdOrCtrl+Left')
  })

  /**
   * 🛑 The table was extended one key at a time, and each time the NEXT one waited for somebody to
   * notice: seven bindings spelled a `KeyboardEvent.code` Electron cannot register — ⌘0 and ⌘1 for
   * the zoom among them. The menu drew the key correctly and registered nothing.
   */
  it('spells every binding of the registry in words Electron takes', () => {
    const unspeakable = COMMAND_REGISTRY.flatMap(command => {
      const accelerator = acceleratorOf(command.defaultBinding ?? null)
      const key = accelerator?.split('+').at(-1) ?? ''
      return accelerator && !ELECTRON_KEY.test(key) ? [`${command.id} — ${accelerator}`] : []
    })

    expect(unspeakable).toEqual([])
  })

  /**
   * 🛑 The guard above reads the registry's OWN keys and nothing else, and a preset layer is the
   * other half: Blender's numbered views are the first bindings to live only there, and every one
   * of them spelled a `KeyboardEvent.code` — `Numpad1` — that Electron refuses to register.
   */
  it('spells every key a preset moves, which the registry never carries', () => {
    const unspeakable = NAVIGATION_PRESETS.filter(preset => preset !== 'custom').flatMap(preset =>
      Object.values(SCHEME_OF[preset as DeclaredPreset].bindings).flatMap(binding => {
        const accelerator = acceleratorOf(binding ?? null)
        const key = accelerator?.split('+').at(-1) ?? ''
        return accelerator && !ELECTRON_KEY.test(key) ? [`${preset} — ${accelerator}`] : []
      }),
    )

    expect(unspeakable).toEqual([])
  })

  it('keeps modifier order and passes named keys through', () => {
    expect(acceleratorOf('Ctrl+Meta+KeyF')).toBe('Ctrl+CmdOrCtrl+F')
    expect(acceleratorOf('Home')).toBe('Home')
  })

  // A command may ship with no key at all: listed, searchable, waiting to be given one.
  it('answers nothing for a command that is bound to nothing', () => {
    expect(acceleratorOf(null)).toBeUndefined()
  })
})

describe('shortcutLabel, on the keys that are neither letters nor named', () => {
  it('prints what the key cap prints', () => {
    expect(shortcutLabel('Meta+Equal', named, MAC)).toBe('⌘=')
    expect(shortcutLabel('Meta+Minus', named, MAC)).toBe('⌘−')
    expect(shortcutLabel('Shift+Meta+Semicolon', named, MAC)).toBe('⇧⌘;')
    expect(shortcutLabel('Meta+Comma', named, MAC)).toBe('⌘,')
  })

  it('draws an arrow rather than spelling one', () => {
    expect(shortcutLabel('ArrowUp', named, MAC)).toBe('↑')
  })

  it('drops the `Digit` prefix a number key carries', () => {
    expect(shortcutLabel('Meta+Digit0', named, MAC)).toBe('⌘0')
  })

  /** Windows and Linux have no ⌘ key to draw, so the chord is written the way they write it. */
  it('spells the chord in words away from macOS', () => {
    expect(shortcutLabel('Shift+Meta+KeyZ', named, false)).toBe('Ctrl+Shift+Z')
    expect(shortcutLabel('Alt+KeyD', named, false)).toBe('Alt+D')
  })

  /**
   * Every binding the registry ships is either a glyph or a name the caller supplied. The list
   * used to stop at `Key|Digit|Equal|Minus|Semi`, which is how six word-keys shipped in English.
   */
  it('never leaves a raw code in a shipped binding', () => {
    for (const descriptor of COMMAND_REGISTRY) {
      if (!descriptor.defaultBinding) continue

      // What is left once the caller's names are removed: a glyph or a single printed letter.
      const raw = shortcutLabel(descriptor.defaultBinding, named, MAC).replace(/<[^>]+>/g, '')
      expect(raw, descriptor.id).not.toMatch(/[A-Za-z]{2}/)
    }
  })
})

/**
 * The guard that was missing when sixteen commands shipped bound to `'P'` instead of `'KeyP'`.
 * Typecheck green, lint green, every unit test green — `Signature` is a string, and nothing
 * anywhere read its shape.
 */
describe('whether a string is a signature the studio could produce', () => {
  it('accepts a bare code', () => {
    expect(isSignature('KeyP')).toBe(true)
    expect(isSignature('Digit1')).toBe(true)
    expect(isSignature('Space')).toBe(true)
    expect(isSignature('ArrowUp')).toBe(true)
    expect(isSignature('F5')).toBe(true)
    expect(isSignature('BracketLeft')).toBe(true)
    expect(isSignature('NumpadDecimal')).toBe(true)
  })

  /**
   * A guard written as a list of the codes that exist refuses the ones nobody thought of, and a
   * refused code is a key nobody can bind. `IntlBackslash` is the `<>` key of every AZERTY
   * keyboard — the layout this file's own opening paragraph says the codes are here to serve.
   */
  it('accepts the codes a real keyboard emits, listed or not', () => {
    const emitted = [
      'IntlBackslash',
      'IntlRo',
      'IntlYen',
      'ContextMenu',
      'CapsLock',
      'Insert',
      'PrintScreen',
      'Pause',
      'NumLock',
      'AudioVolumeUp',
      'ShiftLeft',
      'MetaRight',
    ]

    for (const code of emitted) expect(isSignature(code), code).toBe(true)
  })

  it('accepts the modifiers in the order `signatureOf` writes them', () => {
    expect(isSignature('Meta+KeyS')).toBe(true)
    expect(isSignature('Ctrl+Alt+Shift+Meta+KeyS')).toBe(true)
    expect(isSignature('Alt+Meta+Delete')).toBe(true)
  })

  /**
   * The shortcuts screen recorded raw codes before the keypad Enter was folded, so an install
   * upgrading into that change can hold `NumpadEnter` in its settings file. Kept, it would name
   * a key on screen that fires nothing while that key ran another command; refused, the schema
   * drops the line and the command returns to a default the keypad does reach.
   */
  it('refuses a code no keypress spells any more', () => {
    expect(isSignature('NumpadEnter')).toBe(false)
    expect(isSignature('Meta+NumpadEnter')).toBe(false)
    expect(isSignature('Enter')).toBe(true)
  })

  /** The defect itself: a letter is what is printed on a key, never the key's position. */
  it('refuses a letter written where a code was meant', () => {
    expect(isSignature('P')).toBe(false)
    expect(isSignature('Meta+P')).toBe(false)
    expect(isSignature('1')).toBe(false)
    expect(isSignature('[')).toBe(false)
  })

  /**
   * Two spellings of one chord would be two different keys in every lookup, and the lookup that
   * decides what a key does is an equality on this string.
   */
  it('refuses the modifiers out of order, or written twice', () => {
    expect(isSignature('Meta+Ctrl+KeyS')).toBe(false)
    expect(isSignature('Shift+Alt+KeyS')).toBe(false)
    expect(isSignature('Meta+Meta+KeyS')).toBe(false)
  })

  it('refuses a modifier that is not one', () => {
    expect(isSignature('Cmd+KeyS')).toBe(false)
    expect(isSignature('Super+KeyS')).toBe(false)
  })

  /** What is not shaped like a code at all: one character, a glyph, a lowercase word. */
  it('refuses what no `KeyboardEvent.code` looks like', () => {
    expect(isSignature('')).toBe(false)
    expect(isSignature('Meta+')).toBe(false)
    expect(isSignature('keyP')).toBe(false)
    expect(isSignature('KEY P')).toBe(false)
    expect(isSignature(null)).toBe(false)
    expect(isSignature(undefined)).toBe(false)
    expect(isSignature(42)).toBe(false)
  })

  /** Whatever `signatureOf` builds must pass: the two describe the same grammar. */
  it('accepts every signature the studio itself builds', () => {
    const chords = [
      event('KeyS', { metaKey: true }),
      event('Escape', { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }),
      event('ArrowLeft', { altKey: true }),
      event('Slash', { shiftKey: true }),
      event('IntlBackslash', { metaKey: true }),
    ]

    for (const chord of chords) expect(isSignature(sign(chord))).toBe(true)
  })

  /**
   * The sister table of the registry, in this very file, with the same failure mode: `'W'` where
   * `'KeyW'` was meant would hold no direction and say nothing. It is not remappable today,
   * which is exactly why nothing else would ever read it back.
   */
  it('spells every motion the studio publishes as a signature', () => {
    const malformed = Object.entries(DEFAULT_MOTION).flatMap(([id, bound]) =>
      bound.filter(signature => !isSignature(signature)).map(signature => [id, signature]),
    )

    expect(malformed).toEqual([])
  })
})
