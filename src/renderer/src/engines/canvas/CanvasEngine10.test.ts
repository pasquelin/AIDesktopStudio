import { bridgeWatchingLogs } from '@/services/fakeBridge'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Point } from '../core/geometry'
import { layerFixture } from './canvas-fixtures'
import { DEFAULT_CANVAS, pixelLayer, textLayer, UNLOCKED, type Layer } from './canvasState'
import type { CanvasTool } from './canvasTool'
import { toDocument } from './viewport'

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import {
  canvasGpu,
  drag,
  mounted,
  nextFrame,
  overlayRecorder,
  PARAGRAPH,
  press,
  release,
  stacked,
  VIEW_1_1,
} from './canvasEngineTest-fixtures'

describe('the pixel history', () => {
  it('reports one patch for one stroke, not one per dab', async () => {
    const { host, patches } = await mounted()

    press(host, 200, 200)
    drag(host, 240, 240)
    drag(host, 280, 280)
    release()

    expect(patches).toHaveLength(1)
  })

  it('reports one for a bucket fill, which is a gesture with no drag', async () => {
    const { engine, host, patches } = await mounted()
    engine.setTool('fill')

    press(host, 200, 200)

    expect(patches).toHaveLength(1)
  })

  it('gives each stroke its own patch', async () => {
    const { host, patches } = await mounted()

    press(host, 200, 200)
    drag(host, 240, 240)
    release()
    press(host, 300, 300)
    drag(host, 340, 340)
    release()

    expect(new Set(patches).size).toBe(2)
  })

  // The layer holds the "after" pixels already; the undo is the first replay there is to do.
  it('paints the tiles back into the layer the patch was recorded on', async () => {
    const { engine, host, patches } = await mounted()
    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    const patchId = patches[0]
    expect(patchId).toBeDefined()
    expect(engine.restorePixels(patchId ?? '', 'before')).toBe(true)
  })

  it('says so rather than pretending when asked for a patch it never recorded', async () => {
    const { engine } = await mounted()

    expect(engine.restorePixels('never-recorded', 'before')).toBe(false)
  })

  it('leaves a layer whose pixels are padlocked untouched', async () => {
    const { host, patches } = await mounted({
      ...DEFAULT_CANVAS,
      layers: [pixelLayer('layer-1', 'Background')].map(layer => ({
        ...layer,
        locked: { pixels: true, position: false, alpha: false },
      })),
    })
    const renders = canvasGpu().renders

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(patches).toEqual([])
    expect(canvasGpu().renders).toBe(renders)
  })
})

/**
 * A layer whose asset is gone lists in the panel and draws nothing. The reconciliation must not
 * fall over for it — one unreadable file must not take the rest of the document down — so the
 * log is the only trace of it there will ever be.
 */
describe('a layer whose picture never arrives', () => {
  it('records the asset that failed, and reconciles the rest of the document', async () => {
    const watched = bridgeWatchingLogs()
    canvasGpu().refuseLoad = true

    const { engine } = await mounted(
      stacked([{ ...pixelLayer('a', 'A'), source: 'asset-gone' }, pixelLayer('b', 'B')]),
    )

    await vi.waitFor(() =>
      expect(watched.report).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'canvas.layer',
          message: expect.stringContaining('asset-gone'),
        }),
      ),
    )
    expect(engine).toBeDefined()
    canvasGpu().refuseLoad = false
  })
})

/** The cursor the engine set. It writes on Pixi's canvas, which `mount` puts inside the host. */
function cursorOf(host: HTMLElement): string {
  return host.querySelector('canvas')?.style.cursor ?? ''
}

function wheel(host: HTMLElement, init: WheelEventInit): void {
  host.dispatchEvent(new WheelEvent('wheel', { cancelable: true, ...init }))
}

function key(type: 'keydown' | 'keyup', init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent(type, init))
}

describe('the eyedropper', () => {
  it('hands the colour standing under the pointer to the document', async () => {
    canvasGpu().pixels = [0x33, 0x66, 0x99, 255]
    const { host, picks } = await mounted(DEFAULT_CANVAS, 'picker')

    press(host, 40, 50)

    expect(picks).toEqual([0x336699])
  })

  // A buffer shorter than three channels reads as black rather than as a colour made up from
  // whatever the missing ones defaulted to — an opaque white, say, which `?? 255` would give.
  it('reads a channel it was not given as none of it', async () => {
    canvasGpu().pixels = []
    const { host, picks } = await mounted(DEFAULT_CANVAS, 'picker')

    press(host, 40, 50)

    expect(picks).toEqual([0])
  })

  // One pixel, not the layer: extracting a 1024² sprite to read a single colour is a 4 MB
  // allocation and a synchronous read, on every click.
  it('reads a single pixel, where it was pressed', async () => {
    const { host } = await mounted(DEFAULT_CANVAS, 'picker')

    press(host, 40, 50)

    expect(canvasGpu().sampled).toEqual([{ x: 40, y: 50, width: 1, height: 1 }])
  })

  /**
   * At 1:1 unpanned a screen point and a document point are the same number, so every other test
   * here would pass on an eyedropper that never converted at all. Zoomed, they part company: 41
   * screen pixels are 20.5 document ones, and the pixel holding them is 20.
   */
  it('reads the pixel under the pointer, whatever the zoom', async () => {
    const { engine, host } = await mounted(DEFAULT_CANVAS, 'picker')
    engine.setView({ ...VIEW_1_1, snap: false, viewport: { x: 0, y: 0, scale: 2 } })

    press(host, 41, 51)

    expect(canvasGpu().sampled).toEqual([{ x: 20, y: 25, width: 1, height: 1 }])
  })

  /**
   * Rulers off: their bands cover the first 20 px of each axis and take a press before any tool
   * sees it, so a point at or outside the origin is unreachable with them on.
   */
  it.each([
    { where: 'left of', x: -5, y: 50 },
    { where: 'above', x: 40, y: -5 },
    { where: 'right of', x: 1024, y: 50 },
    { where: 'below', x: 40, y: 1024 },
  ])('says nothing about a point $where the document', async ({ x, y }) => {
    const { engine, host, picks } = await mounted(DEFAULT_CANVAS, 'picker')
    engine.setView({ ...VIEW_1_1, snap: false, rulers: false })

    press(host, x, y)

    expect(picks).toEqual([])
    expect(canvasGpu().sampled).toEqual([])
  })

  // The other side of the same guard: pressed from the outside alone, tightening it to `x < 1` or
  // `x >= width - 1` would take the first and last row of the document away without a test noticing.
  it.each([
    { corner: 'first', x: 0, y: 0 },
    { corner: 'last', x: 1023, y: 1023 },
  ])('reads the $corner pixel of the document', async ({ x, y }) => {
    const { engine, host } = await mounted(DEFAULT_CANVAS, 'picker')
    engine.setView({ ...VIEW_1_1, snap: false, rulers: false })

    press(host, x, y)

    expect(canvasGpu().sampled).toEqual([{ x, y, width: 1, height: 1 }])
  })

  it('says nothing when no layer is armed', async () => {
    const { host, picks } = await mounted({ ...DEFAULT_CANVAS, activeLayerId: null }, 'picker')

    press(host, 40, 50)

    expect(picks).toEqual([])
    expect(canvasGpu().sampled).toEqual([])
  })
})

describe('holding space to pan', () => {
  it('arms the hand, and gives the cursor back on the way up', async () => {
    const { host } = await mounted()

    key('keydown', { code: 'Space' })
    expect(cursorOf(host)).toBe('grab')

    key('keyup', { code: 'Space' })
    expect(cursorOf(host)).toBe('')
  })

  // A space typed into a prompt is a space, not a pan.
  it('leaves a space typed into a field alone', async () => {
    const { host } = await mounted()
    const field = document.createElement('input')
    document.body.appendChild(field)
    // Booked rather than removed after the assertion: a failing expect would leave the field in
    // the page for every test after it, which is the kind of residue shuffling makes unreadable.
    onTestFinished(() => field.remove())

    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))

    expect(cursorOf(host)).toBe('')
  })

  it('ignores a key that is not the space bar', async () => {
    const { host } = await mounted()

    key('keydown', { code: 'KeyB' })

    expect(cursorOf(host)).toBe('')
  })

  // Held down, the key repeats. Re-arming on each repeat would take the grabbing cursor off a
  // pan that is still open and put the idle hand back over it.
  it('ignores the repeats of a key already held', async () => {
    const { host } = await mounted()
    key('keydown', { code: 'Space' })
    press(host, 40, 50)

    key('keydown', { code: 'Space', repeat: true })

    expect(cursorOf(host)).toBe('grabbing')
  })

  it('holds the hand through another key coming up', async () => {
    const { host } = await mounted()
    key('keydown', { code: 'Space' })

    key('keyup', { code: 'KeyB' })

    expect(cursorOf(host)).toBe('grab')
  })

  // ⌘Tab while space is held: the key up never arrives, and the hand would stay for good.
  it('gives the cursor back when the window loses focus', async () => {
    const { host } = await mounted()
    key('keydown', { code: 'Space' })

    window.dispatchEvent(new Event('blur'))

    expect(cursorOf(host)).toBe('')
  })

  // The key going up mid-drag ends the hold, not the gesture: the pan runs to the pointer up.
  it('leaves the grabbing cursor alone while a pan is still open', async () => {
    const { host } = await mounted()
    key('keydown', { code: 'Space' })
    press(host, 40, 50)

    key('keyup', { code: 'Space' })

    expect(cursorOf(host)).toBe('grabbing')
  })
})

describe('the wheel', () => {
  // A trackpad sends a pinch as a wheel with `ctrlKey`, which is also how ⌘/Ctrl + wheel arrives.
  it.each([
    { how: 'ctrl', ctrlKey: true, metaKey: false },
    { how: 'meta', ctrlKey: false, metaKey: true },
  ])('zooms with $how held, around the pointer', async ({ ctrlKey, metaKey }) => {
    const { host, viewports } = await mounted()

    wheel(host, { clientX: 200, clientY: 100, deltaY: -100, ctrlKey, metaKey })
    await nextFrame()

    // Falling back to the identity rather than asserting non-null: a wheel that published nothing
    // fails the scale below instead of throwing something unreadable.
    const next = viewports.at(-1) ?? { x: 0, y: 0, scale: 1 }
    expect(next.scale).toBeGreaterThan(1)
    // Whatever sat under the pointer is still under it — scaling without an anchor drags the
    // document away from the cursor, which is the regression this line exists for.
    const under = toDocument(next, { x: 200, y: 100 })
    expect(under.x).toBeCloseTo(200)
    expect(under.y).toBeCloseTo(100)
  })

  // Bare, it scrolls as it does in Figma: the document moves under a still pointer rather than
  // jumping a zoom step per notch.
  it('scrolls the document on its own', async () => {
    const { host, viewports } = await mounted()

    wheel(host, { deltaX: 30, deltaY: 40 })
    await nextFrame()

    expect(viewports.at(-1)).toMatchObject({ x: -30, y: -40, scale: 1 })
  })
})

/**
 * What the engine hands the overlay for the move tool. Nothing else exposes it: the grips are
 * chrome, they touch neither the document nor anything the engine publishes.
 */
describe('the grips offered on the armed layer', () => {
  /** Rulers and guides off, or their own bands and lines would answer instead of the grips. */
  const BARE = { ...VIEW_1_1, rulers: false, guides: false, snap: false }

  async function chromeOf(tool: CanvasTool, layer: Layer): Promise<number[][]> {
    const { fills } = overlayRecorder()
    const harness = await mounted(stacked([layer]), tool)

    // Twice: the first drains the frames mounting already booked, with the rulers still on.
    harness.engine.setView(BARE)
    await nextFrame()
    fills.length = 0
    harness.engine.setView(BARE)
    await nextFrame()

    return fills
  }

  // Eight, since the rotation moved out to a zone beyond each corner: a ninth square floating
  // above the box was indistinguishable from the eight that resize it.
  it('draws the eight of them while the move tool holds a free layer', async () => {
    expect(await chromeOf('move', layerFixture())).toHaveLength(8)
  })

  it('draws none of them once another tool is armed', async () => {
    expect(await chromeOf('brush', layerFixture())).toHaveLength(0)
  })

  it('draws none of them on a layer pinned in place', async () => {
    const pinned = layerFixture({ locked: { ...UNLOCKED, position: true } })

    expect(await chromeOf('move', pinned)).toHaveLength(0)
  })

  /**
   * The text tool shows them too, and on the caption's OWN box: nothing knew what a caption
   * occupied, so the grips were drawn on the frame of the whole document — a box the size of the
   * picture, whatever the words were, and no way to tell where the next click would type.
   */
  it('draws them on the box of a caption while the text tool is armed', async () => {
    const grips = await chromeOf('text', textLayer('t', 'Bonjour', { x: 10, y: 20 }, PARAGRAPH))

    const near = (at: Point): boolean =>
      grips.some(([x = -1, y = -1]) => Math.abs(x - at.x) <= 5 && Math.abs(y - at.y) <= 5)

    expect(grips).toHaveLength(8)
    // The north-west grip sits on the caption's corner, not on the document's, and the
    // south-east one on the far corner of the BOX — well inside a 1024² document.
    expect(near({ x: 10, y: 20 })).toBe(true)
    expect(near({ x: 10 + PARAGRAPH.width, y: 20 + PARAGRAPH.height })).toBe(true)
  })

  it('draws none over a layer that holds no caption, since none has a box', async () => {
    expect(await chromeOf('text', layerFixture())).toHaveLength(0)
  })
})

/**
 * The ring under the hand, which says what the next dab will cover before it covers it. Same
 * split as the grips: the engine decides its radius, the overlay puts it on screen.
 */
