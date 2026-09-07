/**
 * Keyboard registry, shared by both processes: the settings window will edit these bindings,
 * and the native menu displays some of them.
 *
 * A binding is spelled with a `KeyboardEvent.code` — `KeyA`, `Semicolon` — but that spelling is
 * a NAME, not a position: a keypress is signed by the character PRINTED on the key, resolved
 * back to the code that character occupies on a US keyboard. Every platform and every editor
 * names chords that way, and a French keyboard needs it: ⌘ and the key marked Q must reach the
 * platform's Quit, where reading the position gave `Meta+KeyA` and selected the whole canvas.
 *
 * Position survives where the character cannot serve: flying (`DEFAULT_MOTION`, where `KeyW KeyA
 * KeyS KeyD` IS the shape under the hand, and reads ZQSD on AZERTY), and any key printing a
 * character this file does not know — a dead key, `!`, `ù` — which `codeOf` names by position.
 */
/** Held keys, read every frame while flying — not fired once like a command. */
export type MotionId = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down' | 'boost'

export const MOTION_IDS: readonly MotionId[] = [
  'forward',
  'back',
  'left',
  'right',
  'up',
  'down',
  'boost',
]

export type Signature = string

/**
 * What a signature is built from. Spelled out rather than picked from `KeyboardEvent`, which
 * `shared/` cannot name: it compiles without the DOM lib. A real event satisfies it.
 */
export type KeyChord = {
  code: string
  /** The character the key produces, as `KeyboardEvent.key` spells it. `''` where none is known. */
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/**
 * Codes folded onto the key of the same name on the main keyboard, before a signature is built.
 *
 * Folded at the source rather than by giving a command a second binding: a signature is what the
 * registry, the settings file and the shortcuts screen all compare on, and two spellings of one
 * chord would have to agree in all three — a remap would write one of them and the other would
 * go on answering the old key. Here the second spelling never exists.
 *
 * `NumpadEnter` is a distinct position, and reading it as `Enter` is what makes the keypad's
 * return key answer the two commands bound to that name. It is the ONLY key of the pad that
 * folds: the rest keep their own position, `codeOf` refusing to name them by what they print —
 * Blender's numbered views live there, and a Mac has no lock to take them off the main row's
 * digits with.
 */
const CODE_ALIASES: Record<string, string> = {
  NumpadEnter: 'Enter',
}

/**
 * Where each character sits on a US keyboard. Built once: this is read on every keystroke that
 * is not typed into a field.
 */
const US_CODE_BY_CHARACTER: Record<string, string> = {
  ...Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map(c => [c, `Key${c.toUpperCase()}`])),
  ...Object.fromEntries([...'0123456789'].map(d => [d, `Digit${d}`])),
  ' ': 'Space',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
}

/**
 * Which physical key plays the part ⌘ plays on macOS. Ctrl everywhere else, which is what
 * `CmdOrCtrl` already tells the native menu — the window used to disagree, and every ⌘ command
 * of every space was out of reach by keyboard on Windows and Linux.
 */
function commandHeld(event: KeyChord, isMac: boolean): boolean {
  return isMac ? event.metaKey : event.ctrlKey
}

/**
 * Whether Shift is what TYPED the key rather than part of the chord. AZERTY and QWERTZ put the
 * digits under Shift, so ⌘⇧1 is the user's ⌘1.
 *
 * Digits alone, and only on the digit's own key: a letter under Shift is still that letter,
 * which is what makes ⇧B a chord and not a stray B.
 */
function shiftTypesTheKey(event: KeyChord): boolean {
  return event.shiftKey && event.code === `Digit${event.key}`
}

/** Fixed modifier order, so one combination always produces one signature. */
function chordOf(event: KeyChord, isMac: boolean, code: string): Signature {
  const parts: string[] = []
  // The Windows/Super key names no chord of this studio, and `SIGNATURE_SHAPE` refuses this
  // spelling: it matches nothing, rather than reading as the same chord pressed without it.
  if (!isMac && event.metaKey) parts.push('Super')
  if (isMac && event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && !shiftTypesTheKey(event)) parts.push('Shift')
  if (commandHeld(event, isMac)) parts.push('Meta')
  parts.push(code)
  return parts.join('+')
}

/** The code a keypress is named by: the character it prints, or the position where none is. */
function codeOf(event: KeyChord): string {
  // The keypad is a PLACE, never a character: with the lock on it prints the digit of the main
  // row, and a view bound to `Numpad1` fired `Digit1` — which is to say, on a Mac, never.
  const printed =
    event.key.length === 1 && !event.code.startsWith('Numpad')
      ? US_CODE_BY_CHARACTER[event.key.toLowerCase()]
      : undefined
  return printed ?? CODE_ALIASES[event.code] ?? event.code
}

/** What a keypress is called: what a recorder writes down, and what a tooltip displays. */
export function signatureOf(event: KeyChord, isMac: boolean): Signature {
  return chordOf(event, isMac, codeOf(event))
}

/**
 * Chords the desktop answers before any window does: quitting, hiding, minimising, the
 * screenshot keys. A command bound to one is unreachable AND takes a gesture the user has no
 * other way to make — `Meta` reads as ⌘ on macOS and Ctrl elsewhere, which is where these sit
 * on all three systems.
 *
 * ⌘, is left out so Settings can bind it; ⌘W is left out so `document.close` can.
 */
const PLATFORM_CHORDS: ReadonlySet<Signature> = new Set([
  'Meta+KeyQ',
  'Meta+KeyM',
  'Meta+KeyH',
  'Meta+Space',
  'Meta+Tab',
  'Shift+Meta+Digit3',
  'Shift+Meta+Digit4',
  'Shift+Meta+Digit5',
  'Alt+F4',
])

export function reservedByPlatform(signature: Signature | null): boolean {
  return signature !== null && PLATFORM_CHORDS.has(signature)
}

/**
 * The shape of a whole signature: the modifiers in the one order `signatureOf` writes them,
 * then a `KeyboardEvent.code` — a word, capitalised, of at least two characters.
 *
 * One expression rather than a walk over the parts, and the order is what makes it one: read as
 * a set, `Meta+Ctrl+KeyS` and `Ctrl+Meta+KeyS` would be the same chord under two spellings, and
 * every lookup that decides what a key does is an equality on this string. Written this way a
 * modifier cannot repeat either, which a walk had to rule out on its own.
 *
 * The code is a shape rather than a list of the codes that exist. The two are not the same bet,
 * and the wrong one is expensive in a way the right one is not: a code refused here is a key
 * nobody can bind — `IntlBackslash`, the `<>` of every AZERTY keyboard this studio is aimed at,
 * would have been one — while a code accepted here that no keyboard emits is merely a shortcut
 * that never fires.
 */
const SIGNATURE_SHAPE = /^(Ctrl\+)?(Alt\+)?(Shift\+)?(Meta\+)?[A-Z][A-Za-z0-9]+$/

/**
 * Whether a string is a signature this studio could ever produce.
 *
 * `Signature` is a string, so nothing in the type system stops `'P'` from being written where
 * `'KeyP'` was meant — and sixteen commands were. Typecheck green, lint green, every unit test
 * green: a code is a position and a letter is not one, so the binding simply never fired, and
 * only a test driving a real keyboard caught it.
 *
 * Checked here rather than at each caller: the registry is one user, the recorder on the
 * shortcuts screen is another, and the overrides read off the settings file are a third.
 *
 * A folded code is refused, and that is what makes this more than a shape check. The recorder
 * wrote raw codes before `CODE_ALIASES` existed, so a settings file can hold `NumpadEnter` — a
 * spelling no keypress produces any more. Kept, it would sit on the shortcuts screen naming a
 * key that fires nothing while that same key ran another command. Refused, the schema drops the
 * line and the command goes back to its default, which the keypad does reach.
 */
export function isSignature(value: unknown): value is Signature {
  if (typeof value !== 'string' || !SIGNATURE_SHAPE.test(value)) return false
  return CODE_ALIASES[value.split('+').at(-1) ?? ''] === undefined
}

/**
 * The chords the platform also runs on any highlighted text, editable or not.
 *
 * A command bound to one of them steps aside while something is selected: the copy the user
 * meant is the text they just highlighted, and taking it would leave them no way to get it.
 */
const TEXT_CHORDS: ReadonlySet<Signature> = new Set([
  'Meta+KeyC',
  'Meta+KeyX',
  'Ctrl+KeyC',
  'Ctrl+KeyX',
])

export function copiesText(signature: Signature): boolean {
  return TEXT_CHORDS.has(signature)
}

/**
 * Whether the caret would have a use for the key: writing it, erasing with it, or moving through
 * the words. That is anything a bare key carries, and anything Shift or Alt do — both produce a
 * character on a Mac.
 *
 * Blind spot: `Ctrl` reads as safe, and on macOS it is not — `⌃A`, `⌃E`, `⌃K` and `⌃D` are the
 * caret set every AppKit field implements. No binding carries a bare `Ctrl` today, and answering
 * differently per platform would take a signature the platform is passed to.
 *
 * Asked by the native menu, which must not reserve such a key with the system: see `keyOf` in
 * `main/menu/template.ts`.
 */
export function typesText(signature: Signature | null): boolean {
  if (!signature) return false
  const modifiers = signature.split('+').slice(0, -1)
  return !modifiers.includes('Ctrl') && !modifiers.includes('Meta')
}

const MODIFIER_GLYPHS: Record<string, string> = {
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Meta: '⌘',
}

/**
 * How the other two desktops write the same chord: words joined by `+`, and `Meta` reading as
 * the Ctrl it IS there. Drawing ⌘ on Windows named a key that keyboard does not have.
 */
const MODIFIER_WORDS: Record<string, string> = {
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'Ctrl',
}

/** Those desktops put the command key first: `Ctrl+Shift+Z`, never `Shift+Ctrl+Z`. */
const WORD_ORDER = ['Meta', 'Ctrl', 'Alt', 'Shift']

/**
 * Turns a signature into what a tooltip shows — the display counterpart of `signatureOf`.
 * `KeyG` is the NAME of a key, and what the user is looking for is the letter printed on it.
 *
 * `keyName` names the keys that are words rather than glyphs. It is asked for rather than
 * looked up here because `shared/` has no runtime dependency and so cannot translate: `Space`
 * and `Delete` read as themselves in English, and had been reading as themselves in French too.
 */
export function shortcutLabel(
  signature: Signature | null,
  keyName: (code: NamedKey) => string,
  isMac: boolean,
): string {
  // A command may be bound to nothing: listed and searchable, waiting for a key. Its tooltip
  // simply shows no shortcut rather than an empty pair of brackets.
  if (!signature) return ''

  const parts = signature.split('+')
  const code = parts.at(-1) ?? ''
  const spelling = isMac ? MODIFIER_GLYPHS : MODIFIER_WORDS
  const held = parts.slice(0, -1)
  if (!isMac) held.sort((a, b) => WORD_ORDER.indexOf(a) - WORD_ORDER.indexOf(b))
  const modifiers = held.map(part => spelling[part] ?? part)
  return [...modifiers, keyGlyph(code, keyName)].join(isMac ? '' : '+')
}

/**
 * A code is a position, and what is printed on that key is what the user is looking for. The
 * bindings that are neither letters nor named keys — the zoom's `=` and `-`, the guides' `;` —
 * would otherwise read `⌘Equal` in a tooltip and in the shortcuts screen.
 *
 * Arrows are glyphs and not words: they are what the key wears, in every language.
 */
const KEY_GLYPHS: Record<string, string> = {
  Equal: '=',
  Minus: '−',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  // The key under Escape. Its legend differs by layout — `²` on a French one — and the code is
  // what the binding matches on either way.
  Backquote: '`',
  // Held as a bare code by `DEFAULT_MOTION`, never as the `Shift` segment of a signature, so the
  // modifier glyphs never see it — without this the flight hint reads `ShiftLeft`.
  ShiftLeft: '⇧',
  ShiftRight: '⇧',
  BracketLeft: '[',
  BracketRight: ']',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

/** The keys whose name is a word, and so differs between languages. */
export type NamedKey =
  | 'Space'
  | 'Enter'
  | 'Escape'
  | 'Delete'
  | 'Backspace'
  | 'Tab'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'

export const NAMED_KEYS: readonly NamedKey[] = [
  'Space',
  'Enter',
  'Escape',
  'Delete',
  'Backspace',
  'Tab',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]

function isNamedKey(code: string): code is NamedKey {
  return NAMED_KEYS.some(candidate => candidate === code)
}

function keyGlyph(code: string, keyName: (code: NamedKey) => string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (isNamedKey(code)) return keyName(code)

  // A key nothing above claims — remapping accepts any code — reads as the code itself, which
  // is still closer to what the user pressed than nothing at all.
  return KEY_GLYPHS[code] ?? code
}

/**
 * Every key a direction answers to, as a BARE code: motion is matched on `event.code` and never
 * through `signatureOf`, boost being Shift itself. The arrows are a second key for the four of
 * the ground plane, altitude keeping the two letters an arrow could only take from it.
 */
export const DEFAULT_MOTION: Record<MotionId, readonly Signature[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  down: ['KeyQ'],
  up: ['KeyE'],
  boost: ['ShiftLeft'],
}

/**
 * A signature as Electron spells an accelerator. The one place the two vocabularies meet: the
 * native menu used to write `CmdOrCtrl+N` by hand, which is how a remapped command kept showing
 * the key it no longer answered to.
 *
 * `CmdOrCtrl` rather than `Cmd`: `Meta` is the command key on macOS and the Windows key
 * elsewhere, where Ctrl is what people actually press.
 */
const ACCELERATOR_MODIFIERS: Record<string, string> = {
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'CmdOrCtrl',
}

/**
 * Keys Electron names differently from `event.code`. Anything else passes through — which is why
 * `acceleratorsAreRegistrable` sweeps the whole registry: seven bindings passed through as codes
 * Electron cannot register, ⌘0 and ⌘1 among them, and only the menu was mute about it.
 */
const ACCELERATOR_KEYS: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Equal: '=',
  Minus: '-',
  Slash: '/',
  Backslash: '\\',
  Space: 'Space',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Escape: 'Esc',
  Enter: 'Return',
  Home: 'Home',
  End: 'End',
  // The keypad, which Electron spells its own way: `Numpad1` is not a key it knows, and a row
  // built with one logs « Invalid accelerator » and shows no shortcut at all.
  Numpad0: 'num0',
  Numpad1: 'num1',
  Numpad2: 'num2',
  Numpad3: 'num3',
  Numpad4: 'num4',
  Numpad5: 'num5',
  Numpad6: 'num6',
  Numpad7: 'num7',
  Numpad8: 'num8',
  Numpad9: 'num9',
  NumpadDecimal: 'numdec',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
}

export function acceleratorOf(signature: Signature | null): string | undefined {
  if (!signature) return undefined

  const parts = signature.split('+')
  const code = parts.at(-1) ?? ''
  const modifiers = parts.slice(0, -1).map(part => ACCELERATOR_MODIFIERS[part] ?? part)

  const key =
    ACCELERATOR_KEYS[code] ??
    (code.startsWith('Key') || code.startsWith('Digit') ? code.replace(/^Key|^Digit/, '') : code)
  return [...modifiers, key].join('+')
}
