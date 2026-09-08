import { afterEach, beforeEach, onTestFinished, vi } from 'vitest'
import type { Point, Size } from '../core/geometry'
import { FALLBACK_COLORS, OVERLAY_TOKENS } from './CanvasEngine'
import type { FaceRegistrar } from './canvasFonts'
import type { CanvasSelection } from './canvasSelection'
import {
  DEFAULT_CANVAS,
  isGroup,
  type CanvasState,
  type DrawnShape,
  type Layer,
  type Rect,
} from './canvasState'
import type { CanvasTool } from './canvasTool'
import { DEFAULT_VIEW, type Viewport } from './viewport'

vi.mock('pixi.js/unsafe-eval', () => ({}))
vi.mock('pixi.js/advanced-blend-modes', () => ({}))
vi.mock('pixi.js', async () => {
  const { pixiDouble } = await import('./canvasEnginePixiTest-fixtures')
  return pixiDouble
})

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import type { Placed } from './canvasEngineState-fixtures'
import { EXTRACTED, gpu } from './canvasEngineState-fixtures'

const { BLEND_BY_MODE, CanvasEngine } = await import('./CanvasEngine')

function canvasGpu() {
  return gpu
}

function extractedBytes() {
  return EXTRACTED
}

function fallbackColors() {
  return FALLBACK_COLORS
}

function overlayTokens() {
  return OVERLAY_TOKENS
}

type Harness = {
  engine: InstanceType<typeof CanvasEngine>
  host: HTMLElement
  viewports: Viewport[]
  /** Every selection the engine carved out, in the order it published them. */
  selections: CanvasSelection[]
  smartPrompts: ({ point: Point } | { box: Rect })[]
  smartCommentPrompts: ({ point: Point } | { box: Rect })[]
  /** Every caption the hand asked for: a layer to edit, or a box to open a fresh one in. */
  captions: ({ layerId: string } | { at: Point; box: Size | null })[]
  /** Every pull of a caption box's grip: the box it reached, and where its corner now sits. */
  boxes: { layerId: string; box: Size; at: Point }[]
  /** Every shape a drag finished on: where its box starts, and what the layer will hold. */
  shapes: { at: Point; drawn: DrawnShape }[]
  /** The frames the engine settled a crop drag on, each of which becomes one history entry. */
  crops: Rect[]
  /** Whether a frame is drawn, reported on every change: what greys the bar's Accept and Cancel. */
  cropFrames: boolean[]
  guides: { calls: string[] }
  /** The ids of the patches the engine reported as one finished gesture each. */
  patches: string[]
  /** The ids whose tiles the engine threw away: their history entry can no longer be replayed. */
  dropped: string[]
  /** `translate:<id>:<x>:<y>` and the two ends of the drag, in the order they arrived. */
  layers: string[]
  /** The families the engine asked the page for, in the order it asked. */
  faces: string[]
  /** Every colour the eyedropper handed back, packed as the document stores one. */
  picks: number[]
  comments: { at: Point; outline?: readonly Point[] }[]
}

const smartCommentPrompts: Harness['smartCommentPrompts'] = []

/**
 * A mounted engine with the brush armed. Explicit since the engine opens on the pointer, which
 * writes nothing: a test that presses to paint has to say which tool it is pressing with, and
 * the ones about another tool arm it themselves.
 */
async function mounted(
  state: CanvasState = DEFAULT_CANVAS,
  tool: CanvasTool = 'brush',
  addFace?: FaceRegistrar,
): Promise<Harness> {
  const host = document.body.appendChild(document.createElement('div'))
  const viewports: Viewport[] = []
  const selections: CanvasSelection[] = []
  const smartPrompts: Harness['smartPrompts'] = []
  const captions: Harness['captions'] = []
  const boxes: Harness['boxes'] = []
  const shapes: { at: Point; drawn: DrawnShape }[] = []
  const crops: Rect[] = []
  const cropFrames: boolean[] = []
  const calls: string[] = []
  const patches: string[] = []
  const dropped: string[] = []
  const layers: string[] = []
  const faces: string[] = []
  const picks: number[] = []
  const comments: Harness['comments'] = []
  const harness: Harness = {
    engine: new CanvasEngine({
      onPick: color => picks.push(color),
      onPixels: patchId => patches.push(patchId),
      onPixelsDropped: patchId => dropped.push(patchId),
      onViewport: viewport => viewports.push(viewport),
      onSelection: selection => selections.push(selection),
      onSmartSelect: prompt => smartPrompts.push(prompt),
      onSmartComment: prompt => smartCommentPrompts.push(prompt),
      onComment: (at, outline) => comments.push({ at, ...(outline ? { outline } : {}) }),
      onText: asked => captions.push(asked),
      onTextBox: (layerId, box, at) => boxes.push({ layerId, box, at }),
      onShape: (at, drawn) => shapes.push({ at, drawn }),
      onCrop: rect => crops.push(rect),
      onCropFrame: framed => cropFrames.push(framed),
      onHost: () => undefined,
      guides: {
        add: (axis, position) => {
          calls.push(`add:${axis}:${Math.round(position)}`)
          return 'guide-1'
        },
        move: (id, position) => calls.push(`move:${id}:${Math.round(position)}`),
        remove: id => calls.push(`remove:${id}`),
        beginDrag: () => calls.push('begin'),
        endDrag: () => calls.push('end'),
      },
      layers: {
        transform: (id, next) =>
          layers.push(
            `transform:${id}:${next.scaleX.toFixed(2)}:${next.scaleY.toFixed(2)}:${next.rotation.toFixed(2)}`,
          ),
        translate: (id, x, y) => layers.push(`translate:${id}:${Math.round(x)}:${Math.round(y)}`),
        beginDrag: () => layers.push('begin'),
        endDrag: () => layers.push('end'),
      },
      addFace: addFace ?? (async family => void faces.push(family)),
    }),
    host,
    viewports,
    selections,
    smartPrompts,
    smartCommentPrompts,
    captions,
    boxes,
    shapes,
    crops,
    cropFrames,
    guides: { calls },
    patches,
    dropped,
    layers,
    faces,
    picks,
    comments,
  }
  await finishMount(harness, state, tool)
  return harness
}

async function finishMount(harness: Harness, state: CanvasState, tool: CanvasTool): Promise<void> {
  mountedEngines.push(harness.engine)
  harness.engine.setView(DEFAULT_VIEW)
  harness.engine.setTool(tool)
  harness.engine.apply(state)
  await harness.engine.mount(harness.host)
  await nextFrame()
  harness.engine.setView({ ...VIEW_1_1, snap: false })
  harness.viewports.length = 0
}

/** 1:1 and unpanned, so a screen coordinate in a test is a document coordinate. */
const VIEW_1_1 = { ...DEFAULT_VIEW, viewport: { x: 0, y: 0, scale: 1 } }

/** Saved pixels, as they now cross: bytes, never base64 — see `LayerPixels`. */
const SAVED = Uint8Array.from([65, 66, 67])

/** A box, which makes a caption a PARAGRAPH — the kind a drag opens, and the only kind with one. */
const PARAGRAPH: Size = { width: 480, height: 120 }

const nextFrame = (): Promise<void> =>
  new Promise(resolve => requestAnimationFrame(() => resolve()))

/** A picture is loaded without being awaited: nothing is drawn until the queue has drained. */
const flushMicrotasks = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function press(host: HTMLElement, x: number, y: number, button = 0): void {
  host.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, button }))
}

/**
 * The event the browser actually sends for a second click. NOT `pointerdown` with `detail: 2`,
 * which no browser emits — measured in Electron: `pointerdown` carries `detail: 0` every time,
 * and a test hand-building one asserts a branch the app can never reach.
 */
function doubleClick(host: HTMLElement, x: number, y: number): void {
  host.dispatchEvent(new MouseEvent('dblclick', { clientX: x, clientY: y, detail: 2 }))
}

/**
 * What the overlay put on screen, in order: the rectangles it filled — the grips — the circles
 * it traced — the brush ring — and the corners its dashed outlines pass through. The overlay paints
 * only when its canvas hands out a 2D context, and `testSetup` denies one to the whole renderer,
 * so lending it a recorder for the length of one test is the only outlet this chrome has.
 */
function overlayRecorder(): { fills: number[][]; rings: number[][]; corners: number[][] } {
  const fills: number[][] = []
  const rings: number[][] = []
  const corners: number[][] = []
  const corner = (x: number, y: number): void => {
    corners.push([x, y])
  }
  const ignore = (): void => {}
  const context = {
    save: ignore,
    restore: ignore,
    setTransform: ignore,
    clearRect: ignore,
    beginPath: ignore,
    moveTo: corner,
    lineTo: corner,
    stroke: ignore,
    strokeRect: ignore,
    fillText: ignore,
    setLineDash: ignore,
    arc: (x: number, y: number, radius: number): void => {
      rings.push([x, y, radius])
    },
    fillRect: (x: number, y: number, width: number, height: number): void => {
      fills.push([x, y, width, height])
    },
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
  }

  const previous = HTMLCanvasElement.prototype.getContext
  // Same cast as `testSetup` makes to deny it: the overloads of `getContext` cannot be
  // satisfied by one function, and the overlay asks for its context in its constructor.
  HTMLCanvasElement.prototype.getContext = (() =>
    context) as unknown as HTMLCanvasElement['getContext']
  onTestFinished(() => {
    HTMLCanvasElement.prototype.getContext = previous
  })

  return { fills, rings, corners }
}

/** How many tree mutations happen from here on, read when the assertion needs it. */
function mutationsCounted(): () => number {
  const before = gpu.mutations
  return () => gpu.mutations - before
}

/** A document made of exactly these layers, the bottom one armed. */
function stacked(layers: Layer[]): CanvasState {
  return { ...DEFAULT_CANVAS, layers, activeLayerId: firstPaintable(layers) }
}

/** The id a document opens armed on: a group swallows every stroke, so it is never one. */
function firstPaintable(layers: readonly Layer[]): string | null {
  for (const layer of layers) {
    if (!isGroup(layer)) return layer.id
    const inner = firstPaintable(layer.children)
    if (inner) return inner
  }
  return null
}

/** The container the engine built for a group, found by the label it puts on it. */
function groupContainer(id: string): Placed | undefined {
  return gpu.containers.find(container => container.label === id)
}

/** A harness whose page refuses every face, which is what a missing or unreadable file is. */
function mountedWithoutFace(): Promise<Harness> {
  return mounted(DEFAULT_CANVAS, 'brush', () => Promise.reject(new Error('no such file')))
}

/**
 * Every engine a test mounted. They listen on `window` for `pointerup` and `keydown`, so one left
 * alive answers the next test's keys as well: a crop frame placed here and never applied was
 * being cropped by the ⏎ of the test after it.
 */
const mountedEngines: InstanceType<typeof CanvasEngine>[] = []

afterEach(() => {
  for (const engine of mountedEngines) engine.dispose()
  mountedEngines.length = 0
})

beforeEach(() => {
  smartCommentPrompts.length = 0
  gpu.renders = 0
  gpu.masked = 0
  gpu.texturesCreated = 0
  gpu.texturesDestroyed = 0
  gpu.mutations = 0
  gpu.init = {}
  gpu.sprites = []
  gpu.containers = []
  gpu.painted = []
  gpu.stamps = []
  gpu.loaded = []
  gpu.extracted = []
  gpu.sampled = []
  gpu.pixels = [0, 0, 0, 0]
  gpu.resizes = 0
  gpu.textures = []
})

function silentOptions(): ConstructorParameters<typeof CanvasEngine>[0] {
  const nothing = (): void => undefined
  return {
    addFace: () => Promise.resolve(),
    onPick: nothing,
    onPixels: nothing,
    onPixelsDropped: nothing,
    onViewport: nothing,
    onSelection: nothing,
    onSmartSelect: nothing,
    onSmartComment: nothing,
    onComment: nothing,
    onCropFrame: nothing,
    onHost: nothing,
    onText: nothing,
    onTextBox: nothing,
    onShape: nothing,
    onCrop: nothing,
    guides: { add: () => '', move: nothing, remove: nothing, beginDrag: nothing, endDrag: nothing },
    layers: { translate: nothing, transform: nothing, beginDrag: nothing, endDrag: nothing },
  }
}

function drag(host: HTMLElement, x: number, y: number, shiftKey = false): void {
  host.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, shiftKey }))
}

function release(x = 400, y = 400): void {
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y }))
}

const cursorOn = (host: HTMLElement): string => {
  // Found by what it is, not by where it sits: the overlay marks itself unclickable, so the
  // other canvas is Pixi's. Taking the first would ride on the order `mount` happens to append
  // them in, and every assertion of an *absent* cursor would pass on the wrong element.
  const canvases = [...host.querySelectorAll('canvas')]
  const pixi = canvases.filter(canvas => canvas.style.pointerEvents !== 'none')
  const only = pixi.length === 1 ? pixi[0] : undefined
  return only ? only.style.cursor : `expected one paintable canvas, found ${pixi.length}`
}

export {
  BLEND_BY_MODE,
  CanvasEngine,
  canvasGpu,
  cursorOn,
  doubleClick,
  drag,
  extractedBytes,
  fallbackColors,
  flushMicrotasks,
  groupContainer,
  mounted,
  mountedWithoutFace,
  mutationsCounted,
  nextFrame,
  overlayRecorder,
  overlayTokens,
  PARAGRAPH,
  press,
  release,
  SAVED,
  silentOptions,
  stacked,
  VIEW_1_1,
}
export type { Placed }
