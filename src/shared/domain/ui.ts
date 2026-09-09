import { DEFAULT_FONT, type FontRef } from './font'

/**
 * What a game interface IS — the model a `.ui.json` holds, read by the studio, by the runtime
 * and by the MCP alike.
 *
 * 🛑 **Nothing here names HTML, CSS or a Tailwind class.** A `panel` is a component of this
 * engine, and what it looks like on a screen belongs to whatever draws it — the same rule
 * `RenderPort.veil` states for a fade. A style spelt in classes would tie the format to one
 * renderer and make a Pixi or a world-space one impossible without rewriting every document.
 */
export type UiMode = 'screen' | 'world'

export const UI_MODES: readonly UiMode[] = ['screen', 'world']

/**
 * The thirteen, and the list is closed like `ComponentType` and `SceneNode['type']`: the
 * compiler holds it, MCP publishes it, the inspector derives a form from it.
 *
 * How a container ARRANGES its children is said by its type rather than by a field on every
 * element — a `stack` stacks, a `grid` grids, everything else places its children freely. The
 * two ways of spelling one thing is how a format grows a second answer to the same question.
 */
export type UiElementType =
  | 'screen'
  | 'panel'
  | 'stack'
  | 'grid'
  | 'scroll'
  | 'spacer'
  | 'text'
  | 'image'
  | 'button'
  | 'progress'
  | 'slider'
  | 'input'
  | 'checkbox'

export const UI_ELEMENT_TYPES: readonly UiElementType[] = [
  'screen',
  'panel',
  'stack',
  'grid',
  'scroll',
  'spacer',
  'text',
  'image',
  'button',
  'progress',
  'slider',
  'input',
  'checkbox',
]

/**
 * Which types hold children. A `Record` rather than a list of the ones that do: a fourteenth
 * type does not compile until it has answered, where a list would leave it silently childless
 * — `children` emptied on every read, with the type itself reading perfectly well.
 */
export const HOLDS_CHILDREN: Record<UiElementType, boolean> = {
  screen: true,
  panel: true,
  stack: true,
  grid: true,
  scroll: true,
  button: true,
  spacer: false,
  text: false,
  image: false,
  progress: false,
  slider: false,
  input: false,
  checkbox: false,
}

export type UiSize = { width: number; height: number }

/** Where one element landed, in the space the layout was solved against. Absolute, never nested. */
export type UiBox = { x: number; y: number; width: number; height: number }

/**
 * Every element of a document, by id — what a renderer paints and what a pick reads.
 *
 * 🛑 The ONLY geometry of an interface. A renderer poses these boxes; it computes none of its
 * own, which is what lets a second renderer draw the same document the same way.
 */
export type UiBoxes = ReadonlyMap<string, UiBox>

export type UiPoint = { x: number; y: number }

export type UiEdges = { top: number; right: number; bottom: number; left: number }

/**
 * Pixels of the space the layout is solved against, or a share of the parent.
 *
 * 🛑 NOT scaled by `design`: nothing divides by that resolution, and a second renderer that
 * believed otherwise would disagree with `layoutOf` on every fixed size.
 */
type UiLength = { unit: 'px' | 'percent'; value: number }

/**
 * How far an element reaches along one axis.
 *
 * `auto` is what the content asks for — the words of a text, the pixels of an image, the
 * children of a stack. `stretch` fills what the parent leaves, which is what an anchor spread
 * across two sides means elsewhere; spelling it as a SIZE keeps anchoring to one idea.
 */
export type UiSizing = { mode: 'fixed'; length: UiLength } | { mode: 'auto' } | { mode: 'stretch' }

export type UiExtent = { width: UiSizing; height: UiSizing }

/** The nine points of a box. What an element hangs FROM, and the point of itself it hangs BY. */
export type UiAnchor =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'left'
  | 'center'
  | 'right'
  | 'bottomLeft'
  | 'bottom'
  | 'bottomRight'

export const UI_ANCHORS: readonly UiAnchor[] = [
  'topLeft',
  'top',
  'topRight',
  'left',
  'center',
  'right',
  'bottomLeft',
  'bottom',
  'bottomRight',
]

export type UiAlign = 'start' | 'center' | 'end' | 'stretch'

export const UI_ALIGNS: readonly UiAlign[] = ['start', 'center', 'end', 'stretch']

export type UiJustify = 'start' | 'center' | 'end' | 'between' | 'around'

export const UI_JUSTIFIES: readonly UiJustify[] = ['start', 'center', 'end', 'between', 'around']

/**
 * Where an element sits inside its parent. Distinct from what the PARENT does with its
 * children, which its own type says: confusing the two is how a layout gains two owners.
 */
export type UiPlacement = {
  anchor: UiAnchor
  pivot: UiAnchor
  /** From the anchor, in design pixels. Ignored by a parent that arranges its children. */
  offset: UiPoint
  size: UiExtent
  min: UiSize
  /** Zero means unbounded — a max of nothing is not a max of zero. */
  max: UiSize
  /** Width over height, held whatever the rest asks for. Zero means unheld. */
  aspect: number
  margin: UiEdges
  /** Share of what a stack has left over. Zero takes none. */
  grow: number
}

export type UiFill =
  | { kind: 'none' }
  | { kind: 'color'; color: string }
  | { kind: 'image'; assetId: string; fit: UiFit }

export type UiFit = 'contain' | 'cover' | 'fill' | 'none'

export const UI_FITS: readonly UiFit[] = ['contain', 'cover', 'fill', 'none']

type UiBorder = { width: number; color: string; radius: number }

export type UiStyle = {
  background: UiFill
  border: UiBorder
  opacity: number
  padding: UiEdges
}

export type UiTextAlign = 'left' | 'center' | 'right'

export const UI_TEXT_ALIGNS: readonly UiTextAlign[] = ['left', 'center', 'right']

/** `font` is the studio's own reference, so an interface reads the faces a scene already does. */
export type UiText = {
  value: string
  font: FontRef
  size: number
  weight: number
  align: UiTextAlign
  color: string
  wrap: boolean
}

export type UiImage = { assetId: string; fit: UiFit; tint: string }

export type UiStack = {
  direction: 'row' | 'column'
  gap: number
  align: UiAlign
  justify: UiJustify
  wrap: boolean
}

/** Rows follow from the children: a grid one names both ways over-constrains an inventory. */
export type UiGrid = { columns: number; gap: number; align: UiAlign }

export type UiScrollAxis = 'vertical' | 'horizontal' | 'both'

export const UI_SCROLL_AXES: readonly UiScrollAxis[] = ['vertical', 'horizontal', 'both']

export type UiScroll = { axis: UiScrollAxis }

export type UiProgress = { value: number; min: number; max: number; fill: string; track: string }

export type UiSlider = { value: number; min: number; max: number; step: number }

export type UiInput = { value: string; placeholder: string; maxLength: number; secret: boolean }

export type UiCheckbox = { checked: boolean }

export type UiCursor = 'default' | 'pointer' | 'text' | 'notAllowed'

export const UI_CURSORS: readonly UiCursor[] = ['default', 'pointer', 'text', 'notAllowed']

/**
 * What a gesture on this element MEANS. `action` is the name `UiAction` carries, so a script
 * answers a word its author chose rather than an identifier the editor generated.
 */
export type UiInteraction = { action: string; focusable: boolean; cursor: UiCursor }

type UiElementBase = {
  id: string
  name: string
  visible: boolean
  enabled: boolean
  /** Editing only: a locked element is neither picked nor dragged. The runtime ignores it. */
  locked: boolean
  place: UiPlacement
  style: UiStyle
  interaction: UiInteraction
}

type UiChildren = { children: readonly UiElement[] }

export type UiScreen = UiElementBase & { type: 'screen' } & UiChildren

export type UiElement =
  | UiScreen
  | (UiElementBase & { type: 'panel' } & UiChildren)
  | (UiElementBase & { type: 'stack'; stack: UiStack } & UiChildren)
  | (UiElementBase & { type: 'grid'; grid: UiGrid } & UiChildren)
  | (UiElementBase & { type: 'scroll'; scroll: UiScroll } & UiChildren)
  | (UiElementBase & { type: 'spacer' })
  | (UiElementBase & { type: 'text'; text: UiText })
  | (UiElementBase & { type: 'image'; image: UiImage })
  /** Children as well as words: a button wearing an icon is the ordinary case, not an exception. */
  | (UiElementBase & { type: 'button'; text: UiText } & UiChildren)
  | (UiElementBase & { type: 'progress'; progress: UiProgress })
  | (UiElementBase & { type: 'slider'; slider: UiSlider })
  | (UiElementBase & { type: 'input'; input: UiInput })
  | (UiElementBase & { type: 'checkbox'; checkbox: UiCheckbox })

/**
 * Where a bound value comes FROM. Discriminated so a family can be added without touching a
 * document already on somebody's disk.
 *
 * 🛑 Two families, and both work. A `kind` the schema accepts and the runtime refuses is a
 * promise written into user files. Nothing here computes: a source NAMES a value, and a
 * calculation belongs to a script.
 */
export type UiBindingSource =
  | { kind: 'component'; entity: string; component: string; field: string }
  /** A value the running game holds — what `game.scene.keep(key, value)` writes. */
  | { kind: 'game'; path: string }

export type UiBinding = {
  element: string
  property: string
  source: UiBindingSource
  fallback: string | number | boolean | null
}

/**
 * 1. Bounded high when read: a file written by a later build answers `too-new` rather than
 * opening as if it were this one, since the next save would then flatten what it did not know.
 */
export const UI_VERSION = 1

/**
 * What a `.ui.json` names in its `$schema`, so an editor validates and completes one without
 * knowing this studio. Here rather than beside the Zod schema that generates the file: the file
 * layer stamps this on every write, and it must not pull a validator in to do so.
 */
export const UI_SCHEMA_URL = `https://www.aidesktopstudio.com/schema/ui-${UI_VERSION}.schema.json`

/**
 * Why a file did not open, told apart because the two need different words on screen: one says
 * « update the studio », the other « this file is damaged ». The same pair `game.json` keeps.
 */
export type UiTrouble = 'unreadable' | 'too-new'

/** What a read answers with. A troubled read still carries a document — an empty one. */
export type UiState = { document: UiDocument; trouble: UiTrouble | null }

/**
 * An interface, whole. The document's own id and title live in the studio envelope the file
 * layer stamps — carrying them here too would be a second answer free to disagree with the
 * folder, which is the defect `DocumentDescriptor` was moved out of the file name to close.
 */
export type UiDocument = {
  version: number
  mode: UiMode
  /**
   * The resolution the author draws at. A layout is solved against whatever viewport it is
   * handed and the anchors absorb the difference, so this is the editor's canvas and what a
   * preset names — never a factor anything divides by.
   */
  design: UiSize
  root: UiScreen
  bindings: readonly UiBinding[]
}

export const DESIGN_RESOLUTION: UiSize = { width: 1920, height: 1080 }

export const NO_EDGES: UiEdges = { top: 0, right: 0, bottom: 0, left: 0 }

export const AUTO_EXTENT: UiExtent = { width: { mode: 'auto' }, height: { mode: 'auto' } }

export const DEFAULT_PLACEMENT: UiPlacement = {
  anchor: 'topLeft',
  pivot: 'topLeft',
  offset: { x: 0, y: 0 },
  size: AUTO_EXTENT,
  min: { width: 0, height: 0 },
  max: { width: 0, height: 0 },
  aspect: 0,
  margin: NO_EDGES,
  grow: 0,
}

export const DEFAULT_STYLE: UiStyle = {
  background: { kind: 'none' },
  border: { width: 0, color: '#000000', radius: 0 },
  opacity: 1,
  padding: NO_EDGES,
}

export const DEFAULT_INTERACTION: UiInteraction = {
  action: '',
  focusable: false,
  cursor: 'default',
}

export const DEFAULT_TEXT: UiText = {
  value: '',
  font: DEFAULT_FONT,
  size: 16,
  weight: 400,
  align: 'left',
  color: '#ffffff',
  wrap: true,
}

export const DEFAULT_IMAGE: UiImage = { assetId: '', fit: 'contain', tint: '#ffffff' }

export const DEFAULT_STACK: UiStack = {
  direction: 'column',
  gap: 8,
  align: 'start',
  justify: 'start',
  wrap: false,
}

export const DEFAULT_GRID: UiGrid = { columns: 4, gap: 8, align: 'start' }

export const DEFAULT_SCROLL: UiScroll = { axis: 'vertical' }

export const DEFAULT_PROGRESS: UiProgress = {
  value: 1,
  min: 0,
  max: 1,
  fill: '#4aa3ff',
  track: '#2a2a2a',
}

export const DEFAULT_SLIDER: UiSlider = { value: 0, min: 0, max: 1, step: 0.01 }

export const DEFAULT_INPUT: UiInput = {
  value: '',
  placeholder: '',
  maxLength: 0,
  secret: false,
}

export const DEFAULT_CHECKBOX: UiCheckbox = { checked: false }

/** A screen fills whatever it is shown on, which is what makes the design resolution a REFERENCE. */
export const SCREEN_PLACEMENT: UiPlacement = {
  ...DEFAULT_PLACEMENT,
  size: { width: { mode: 'stretch' }, height: { mode: 'stretch' } },
}

export function isUiMode(value: unknown): value is UiMode {
  return UI_MODES.some(mode => mode === value)
}

export function isUiElementType(value: unknown): value is UiElementType {
  return UI_ELEMENT_TYPES.some(type => type === value)
}

export function holdsChildren(type: UiElementType): boolean {
  return HOLDS_CHILDREN[type]
}
