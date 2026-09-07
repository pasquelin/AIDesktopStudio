import { isRecord, oneOf, readBoolean, readNumber, readPositive, readString } from '../guards'
import { clamp } from '../numeric'
import { readColor } from './color'
import { readFontRef } from './font'
import {
  AUTO_EXTENT,
  DEFAULT_CHECKBOX,
  DEFAULT_GRID,
  DEFAULT_IMAGE,
  DEFAULT_INPUT,
  DEFAULT_INTERACTION,
  DEFAULT_PLACEMENT,
  DEFAULT_PROGRESS,
  DEFAULT_SCROLL,
  DEFAULT_SLIDER,
  DEFAULT_STACK,
  DEFAULT_STYLE,
  DEFAULT_TEXT,
  DESIGN_RESOLUTION,
  NO_EDGES,
  SCREEN_PLACEMENT,
  UI_ALIGNS,
  UI_ANCHORS,
  UI_CURSORS,
  UI_FITS,
  UI_JUSTIFIES,
  UI_SCROLL_AXES,
  UI_TEXT_ALIGNS,
  UI_SCHEMA_URL,
  UI_VERSION,
  holdsChildren,
  isUiElementType,
  type UiElementType,
  isUiMode,
  type UiAnchor,
  type UiBinding,
  type UiBindingSource,
  type UiCheckbox,
  type UiDocument,
  type UiEdges,
  type UiElement,
  type UiExtent,
  type UiFill,
  type UiFit,
  type UiGrid,
  type UiImage,
  type UiInput,
  type UiInteraction,
  type UiPlacement,
  type UiPoint,
  type UiProgress,
  type UiScreen,
  type UiScroll,
  type UiSize,
  type UiSizing,
  type UiSlider,
  type UiStack,
  type UiState,
  type UiStyle,
  type UiText,
} from './ui'

/**
 * A `.ui.json` read back, keeping what it fully describes and dropping the rest — a project
 * folder is user territory, so a file may be hand-edited or synced back half written. A child
 * that fails to read costs itself, never its parent.
 *
 * 🛑 **A troubled read is SAID, never handed back as an empty screen.** Without the word, a
 * half-synced file opens blank, the author reaches for ⌘S, and the blank overwrites the
 * interface. The version is read before anything else, so « update the studio » and « repair
 * this file » stay two different sentences — the shape `game.json` already keeps.
 *
 * `newId` is handed in rather than imported: `shared/` reaches no helper of the window, and an
 * exported game allots its ids by other means.
 */
export function uiFromPayload(payload: unknown, newId: () => string): UiState {
  if (!isRecord(payload)) return { document: newUiDocument(newId), trouble: 'unreadable' }

  if (typeof payload.version === 'number' && payload.version > UI_VERSION) {
    return { document: newUiDocument(newId), trouble: 'too-new' }
  }

  // Everything hangs off the root, so a file whose root is not a screen is not half right —
  // it is unopenable, and saying so is what stops a save from making that permanent.
  const root = element(payload.root, newId)
  if (root?.type !== 'screen') return { document: newUiDocument(newId), trouble: 'unreadable' }

  return {
    document: {
      version: UI_VERSION,
      mode: isUiMode(payload.mode) ? payload.mode : 'screen',
      design: resolution(payload.design),
      root,
      bindings: bindings(payload.bindings),
    },
    trouble: null,
  }
}

/**
 * What a saved interface holds. The version and the schema pointer are stamped HERE and nowhere
 * else: the window produces the structure the file carries, and the main process only writes the
 * syntax of it — a `$schema` added on the way to disk would be one the window never held.
 */
export function uiPayload(document: UiDocument): UiDocument & { $schema: string } {
  return { $schema: UI_SCHEMA_URL, ...document, version: UI_VERSION }
}

export function newUiDocument(newId: () => string): UiDocument {
  return {
    version: UI_VERSION,
    mode: 'screen',
    design: DESIGN_RESOLUTION,
    root: emptyScreen(newId),
    bindings: [],
  }
}

export function emptyScreen(newId: () => string): UiScreen {
  return {
    id: newId(),
    type: 'screen',
    name: '',
    visible: true,
    enabled: true,
    locked: false,
    place: SCREEN_PLACEMENT,
    style: DEFAULT_STYLE,
    interaction: DEFAULT_INTERACTION,
    children: [],
  }
}

/**
 * A brand new element of a type, defaults everywhere.
 *
 * Through the same reader a file goes through rather than a second table of what an element is:
 * a field added to the format would otherwise arrive on read and be missing on create.
 */
export function newUiElement<T extends UiElementType>(
  type: T,
  newId: () => string,
): Extract<UiElement, { type: T }> {
  // `as`: the reader answers the whole union — it is asked what a FILE holds — where the type
  // named here settles which variant. `element` answers null only for something that is not an
  // element at all, which a bare type of the closed list never is.
  return (element({ type }, newId) ?? emptyScreen(newId)) as Extract<UiElement, { type: T }>
}

/**
 * One element, defaults first and the file on top — which IS the migration: a field this build
 * has gained since the document was written arrives with a value instead of `undefined`.
 */
function element(value: unknown, newId: () => string): UiElement | null {
  if (!isRecord(value) || !isUiElementType(value.type)) return null
  const type = value.type
  const base = elementBase(value, newId)
  const kids = holdsChildren(type) ? children(value.children, newId) : []
  return elementVariant(value, type, base, kids)
}

function elementBase(value: Record<string, unknown>, newId: () => string) {
  return {
    // An id the file lost is minted rather than costing the element: what an id keys — a
    // binding, a keyframe, a script's `get` — is broken either way, and a visible element is
    // something to repair where a dropped one is something to notice.
    id: readString(value, 'id', '') || newId(),
    // Nameless by default, never the type: a name is what its AUTHOR called it, and `panel`
    // written here is an English identifier the outliner would then show as a title.
    name: readString(value, 'name', ''),
    visible: readBoolean(value, 'visible', true),
    enabled: readBoolean(value, 'enabled', true),
    locked: readBoolean(value, 'locked', false),
    place: placement(value.place),
    style: style(value.style),
    interaction: interaction(value.interaction),
  }
}

function elementVariant(
  value: Record<string, unknown>,
  type: UiElement['type'],
  base: ReturnType<typeof elementBase>,
  kids: readonly UiElement[],
): UiElement {
  if (type === 'screen') return { ...base, type: 'screen', children: kids }
  if (type === 'stack') {
    return { ...base, type: 'stack', stack: stack(value.stack), children: kids }
  }
  if (type === 'grid') {
    return { ...base, type: 'grid', grid: grid(value.grid), children: kids }
  }
  if (type === 'scroll') {
    return { ...base, type: 'scroll', scroll: scroll(value.scroll), children: kids }
  }
  if (type === 'button') {
    return { ...base, type: 'button', text: text(value.text), children: kids }
  }
  if (type === 'panel') return { ...base, type: 'panel', children: kids }
  return leafElement(value, type, base)
}

function leafElement(
  value: Record<string, unknown>,
  type: UiElement['type'],
  base: ReturnType<typeof elementBase>,
): UiElement {
  if (type === 'text') return { ...base, type: 'text', text: text(value.text) }
  if (type === 'image') return { ...base, type: 'image', image: image(value.image) }
  if (type === 'progress') {
    return { ...base, type: 'progress', progress: progress(value.progress) }
  }
  if (type === 'slider') return { ...base, type: 'slider', slider: slider(value.slider) }
  if (type === 'input') return { ...base, type: 'input', input: input(value.input) }
  if (type === 'checkbox') {
    return { ...base, type: 'checkbox', checkbox: checkbox(value.checkbox) }
  }
  if (type === 'spacer') return { ...base, type: 'spacer' }

  return { ...base, type: 'spacer' }
}

/** What a reader made of a list, dropping what it could not read. Anything but a list is none. */
function kept<T>(value: unknown, read: (one: unknown) => T | null): readonly T[] {
  return Array.isArray(value) ? value.map(read).filter((one): one is T => one !== null) : []
}

const children = (value: unknown, newId: () => string): readonly UiElement[] =>
  kept(value, one => element(one, newId))

function placement(value: unknown): UiPlacement {
  if (!isRecord(value)) return DEFAULT_PLACEMENT

  return {
    anchor: anchor(value.anchor, DEFAULT_PLACEMENT.anchor),
    pivot: anchor(value.pivot, DEFAULT_PLACEMENT.pivot),
    offset: point(value.offset),
    size: extent(value.size),
    min: size(value.min, { width: 0, height: 0 }),
    max: size(value.max, { width: 0, height: 0 }),
    aspect: readPositive(value, 'aspect', 0),
    margin: edges(value.margin),
    grow: readPositive(value, 'grow', 0),
  }
}

const anchor = (value: unknown, fallback: UiAnchor): UiAnchor => oneOf(UI_ANCHORS, value, fallback)

function point(value: unknown): UiPoint {
  if (!isRecord(value)) return { x: 0, y: 0 }
  return { x: readNumber(value, 'x', 0), y: readNumber(value, 'y', 0) }
}

function size(value: unknown, fallback: UiSize): UiSize {
  if (!isRecord(value)) return fallback
  return {
    width: readPositive(value, 'width', fallback.width),
    height: readPositive(value, 'height', fallback.height),
  }
}

/**
 * The design resolution, held to at least one pixel each way rather than merely to a positive
 * number: every scale a renderer computes divides by it, and a zero makes them all `Infinity`.
 */
function resolution(value: unknown): UiSize {
  const read = size(value, DESIGN_RESOLUTION)
  return { width: Math.max(1, read.width), height: Math.max(1, read.height) }
}

function edges(value: unknown): UiEdges {
  if (!isRecord(value)) return NO_EDGES
  return {
    top: readNumber(value, 'top', 0),
    right: readNumber(value, 'right', 0),
    bottom: readNumber(value, 'bottom', 0),
    left: readNumber(value, 'left', 0),
  }
}

function extent(value: unknown): UiExtent {
  if (!isRecord(value)) return AUTO_EXTENT
  return { width: sizing(value.width), height: sizing(value.height) }
}

function sizing(value: unknown): UiSizing {
  if (!isRecord(value)) return { mode: 'auto' }
  if (value.mode === 'stretch') return { mode: 'stretch' }
  if (value.mode !== 'fixed' || !isRecord(value.length)) return { mode: 'auto' }

  return {
    mode: 'fixed',
    length: {
      unit: value.length.unit === 'percent' ? 'percent' : 'px',
      value: readNumber(value.length, 'value', 0),
    },
  }
}

function style(value: unknown): UiStyle {
  if (!isRecord(value)) return DEFAULT_STYLE

  const border = isRecord(value.border) ? value.border : {}
  return {
    background: fill(value.background),
    border: {
      width: readPositive(border, 'width', DEFAULT_STYLE.border.width),
      color: readColor(border, 'color', DEFAULT_STYLE.border.color),
      radius: readPositive(border, 'radius', DEFAULT_STYLE.border.radius),
    },
    opacity: clamp(readNumber(value, 'opacity', 1), 0, 1),
    padding: edges(value.padding),
  }
}

function fill(value: unknown): UiFill {
  if (!isRecord(value)) return { kind: 'none' }
  if (value.kind === 'color') return { kind: 'color', color: readColor(value, 'color', '#000000') }
  if (value.kind !== 'image') return { kind: 'none' }

  return { kind: 'image', assetId: readString(value, 'assetId', ''), fit: fit(value.fit) }
}

const fit = (value: unknown): UiFit => oneOf(UI_FITS, value, 'contain')

function interaction(value: unknown): UiInteraction {
  if (!isRecord(value)) return DEFAULT_INTERACTION
  return {
    action: readString(value, 'action', ''),
    focusable: readBoolean(value, 'focusable', false),
    cursor: oneOf(UI_CURSORS, value.cursor, 'default'),
  }
}

function text(value: unknown): UiText {
  if (!isRecord(value)) return DEFAULT_TEXT
  return {
    value: readString(value, 'value', ''),
    font: readFontRef(value.font),
    size: Math.max(1, readPositive(value, 'size', DEFAULT_TEXT.size)),
    weight: readPositive(value, 'weight', DEFAULT_TEXT.weight),
    align: oneOf(UI_TEXT_ALIGNS, value.align, 'left'),
    color: readColor(value, 'color', DEFAULT_TEXT.color),
    wrap: readBoolean(value, 'wrap', true),
  }
}

function image(value: unknown): UiImage {
  if (!isRecord(value)) return DEFAULT_IMAGE
  return {
    assetId: readString(value, 'assetId', ''),
    fit: fit(value.fit),
    tint: readColor(value, 'tint', DEFAULT_IMAGE.tint),
  }
}

function stack(value: unknown): UiStack {
  if (!isRecord(value)) return DEFAULT_STACK
  return {
    direction: value.direction === 'row' ? 'row' : 'column',
    gap: readPositive(value, 'gap', DEFAULT_STACK.gap),
    align: oneOf(UI_ALIGNS, value.align, DEFAULT_STACK.align),
    justify: oneOf(UI_JUSTIFIES, value.justify, DEFAULT_STACK.justify),
    wrap: readBoolean(value, 'wrap', false),
  }
}

function grid(value: unknown): UiGrid {
  if (!isRecord(value)) return DEFAULT_GRID
  return {
    // At least one: a grid of no columns lays nothing out and reads as an empty document.
    columns: Math.max(1, Math.round(readNumber(value, 'columns', DEFAULT_GRID.columns))),
    gap: readPositive(value, 'gap', DEFAULT_GRID.gap),
    align: oneOf(UI_ALIGNS, value.align, DEFAULT_GRID.align),
  }
}

function scroll(value: unknown): UiScroll {
  if (!isRecord(value)) return DEFAULT_SCROLL
  return { axis: oneOf(UI_SCROLL_AXES, value.axis, 'vertical') }
}

function progress(value: unknown): UiProgress {
  if (!isRecord(value)) return DEFAULT_PROGRESS
  return {
    value: readNumber(value, 'value', DEFAULT_PROGRESS.value),
    min: readNumber(value, 'min', DEFAULT_PROGRESS.min),
    max: readNumber(value, 'max', DEFAULT_PROGRESS.max),
    fill: readColor(value, 'fill', DEFAULT_PROGRESS.fill),
    track: readColor(value, 'track', DEFAULT_PROGRESS.track),
  }
}

/** A `step` of zero is legal and means a continuous slider — not a value to floor away. */
function slider(value: unknown): UiSlider {
  if (!isRecord(value)) return DEFAULT_SLIDER
  return {
    value: readNumber(value, 'value', DEFAULT_SLIDER.value),
    min: readNumber(value, 'min', DEFAULT_SLIDER.min),
    max: readNumber(value, 'max', DEFAULT_SLIDER.max),
    step: readPositive(value, 'step', DEFAULT_SLIDER.step),
  }
}

function input(value: unknown): UiInput {
  if (!isRecord(value)) return DEFAULT_INPUT
  return {
    value: readString(value, 'value', ''),
    placeholder: readString(value, 'placeholder', ''),
    maxLength: readPositive(value, 'maxLength', 0),
    secret: readBoolean(value, 'secret', false),
  }
}

function checkbox(value: unknown): UiCheckbox {
  if (!isRecord(value)) return DEFAULT_CHECKBOX
  return { checked: readBoolean(value, 'checked', false) }
}

const bindings = (value: unknown): readonly UiBinding[] => kept(value, binding)

/**
 * A binding, or nothing. Dropped rather than defaulted: a source whose `kind` this build does
 * not know cannot be guessed at, and one silently rewritten to another family would show a
 * number nobody asked for.
 */
function binding(value: unknown): UiBinding | null {
  if (!isRecord(value)) return null

  const element = readString(value, 'element', '')
  const property = readString(value, 'property', '')
  const from = source(value.source)
  if (!element || !property || !from) return null

  return { element, property, source: from, fallback: fallbackOf(value.fallback) }
}

function source(value: unknown): UiBindingSource | null {
  if (!isRecord(value)) return null

  if (value.kind === 'component') {
    const entity = readString(value, 'entity', '')
    const component = readString(value, 'component', '')
    const field = readString(value, 'field', '')
    return entity && component && field ? { kind: 'component', entity, component, field } : null
  }
  if (value.kind !== 'game') return null

  const path = readString(value, 'path', '')
  return path ? { kind: 'game', path } : null
}

function fallbackOf(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
