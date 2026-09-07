import { describe, expect, it } from 'vitest'
import { DEFAULT_BRUSH } from './brush'
import { RULER_SIZE } from './CanvasOverlay'
import {
  DEFAULT_CANVAS,
  IDENTITY,
  pixelLayer,
  UNLOCKED,
  type CanvasState,
  type Rect,
  type Transform,
} from './canvasState'
import { DEFAULT_VIEW, type Viewport } from './viewport'

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import type { Placed } from './canvasEngineTest-fixtures'
import { canvasGpu, mounted, nextFrame, press, VIEW_1_1 } from './canvasEngineTest-fixtures'

describe('the layer transform', () => {
  /** One layer, with the transform under test, and the sprite the engine built for it. */
  async function placed(transform: Partial<Transform>): Promise<Placed> {
    const layer = {
      ...pixelLayer('layer-1', 'Background'),
      transform: { ...IDENTITY, ...transform },
    }
    // A test may place twice, and each mount builds its own sprites.
    canvasGpu().sprites = []
    await mounted({ ...DEFAULT_CANVAS, layers: [layer], activeLayerId: layer.id })

    const sprite = canvasGpu().sprites[0]
    if (!sprite) throw new Error('the engine built no sprite for the layer')
    return sprite
  }

  it('turns, scales and skews the sprite the way the state says', async () => {
    const sprite = await placed({ rotation: Math.PI / 2, scaleX: 2, scaleY: 3, skewX: 0.1 })

    expect(sprite.rotation).toBe(Math.PI / 2)
    expect(sprite.scale).toMatchObject({ x: 2, y: 3 })
    expect(sprite.skew).toMatchObject({ x: 0.1, y: 0 })
  })

  // The origin is a fraction of the box, so a resize does not move the pivot.
  it('pivots on the fraction of the box the origin names', async () => {
    const sprite = await placed({ originX: 0.5, originY: 0.25 })

    expect(sprite.pivot).toMatchObject({ x: 512, y: 256 })
  })

  /**
   * A pivot displaces the sprite by itself. Without the compensation, moving the origin of an
   * otherwise untouched layer would slide it across the document — which the type forbids.
   */
  it('leaves an untransformed layer where the state put it, whatever its origin', async () => {
    const centred = await placed({ x: 10, y: 20, originX: 0.5, originY: 0.5 })
    expect(centred.position.x - centred.pivot.x).toBe(10)
    expect(centred.position.y - centred.pivot.y).toBe(20)

    const cornered = await placed({ x: 10, y: 20, originX: 0, originY: 0 })
    expect(cornered.position).toMatchObject({ x: 10, y: 20 })
  })
})

describe('the ruler bands', () => {
  it('lays a guide down from the top band', async () => {
    const { host, guides } = await mounted()
    press(host, 120, RULER_SIZE - 5)

    expect(guides.calls).toEqual(['begin', 'add:y:15'])
  })

  it('lays a vertical one from the left band', async () => {
    const { host, guides } = await mounted()
    press(host, RULER_SIZE - 5, 120)

    expect(guides.calls[1]).toMatch(/^add:x:/)
  })

  // The corner square is inert chrome. Falling through to the tool meant a brush dab there, and
  // a whole layer flooded with the bucket.
  it('starts nothing at all in the corner where the two bands meet', async () => {
    const { host, guides } = await mounted()
    const renders = canvasGpu().renders
    press(host, 4, 4)

    expect(guides.calls).toEqual([])
    // The bucket used to flood the whole layer from here, and the brush used to leave a dab.
    expect(canvasGpu().renders).toBe(renders)
  })

  it('throws a guide away when it is dropped back on the chrome', async () => {
    const { host, guides } = await mounted()
    press(host, 120, 5)
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 8, clientY: 8 }))

    expect(guides.calls).toEqual(['begin', 'add:y:5', 'remove:guide-1', 'end'])
  })

  it('sticks a new guide to the frame edge it was dropped near', async () => {
    const { engine, host, guides } = await mounted()
    engine.setView(VIEW_1_1)
    press(host, 120, 5)

    expect(guides.calls).toEqual(['begin', 'add:y:0'])
  })

  it('keeps it when it is dropped on the canvas', async () => {
    const { host, guides } = await mounted()
    press(host, 120, 5)
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 200 }))

    expect(guides.calls).toEqual(['begin', 'add:y:5', 'end'])
  })

  // A middle-button pan can land mid-drag: a guide gesture left open would make the next drag of
  // that guide re-create it rather than move it.
  it('closes an open guide drag when a pan takes the pointer', async () => {
    const { host, guides } = await mounted()
    press(host, 120, 5)
    press(host, 200, 200, 1)

    expect(guides.calls).toEqual(['begin', 'add:y:5', 'end'])
  })
})

describe('the view', () => {
  it('publishes a pan once a frame rather than once per pointer move', async () => {
    const { host, viewports } = await mounted()
    press(host, 200, 200, 1)
    for (const x of [210, 220, 230]) {
      host.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 200 }))
    }

    expect(viewports).toEqual([])
    await nextFrame()
    expect(viewports).toHaveLength(1)
  })

  /**
   * `setView` ignores the viewport it published itself, which comes back one React commit late.
   * It must not ignore a command that lands in the same window — ⌘0 during a trackpad glide.
   */
  it('takes a command that arrives while a pan is still being published', async () => {
    const { engine, host } = await mounted()
    press(host, 200, 200, 1)
    host.dispatchEvent(new PointerEvent('pointermove', { clientX: 260, clientY: 200 }))

    const commanded: Viewport = { x: 12, y: 34, scale: 3 }
    engine.setView({ ...DEFAULT_VIEW, viewport: commanded })
    // A second push of the same viewport, as React re-renders: still the command, not the pan.
    engine.setView({ ...DEFAULT_VIEW, viewport: commanded })

    host.dispatchEvent(new PointerEvent('pointermove', { clientX: 261, clientY: 200 }))
    expect(canvasGpu().renders).toBeGreaterThan(0)
  })
})

/** `pointermove` goes to the host, `pointerup` to the window — as the engine listens for them. */
function drag(host: HTMLElement, x: number, y: number, shiftKey = false): void {
  host.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, shiftKey }))
}

function release(x = 400, y = 400): void {
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y }))
}

describe('painting cells by call', () => {
  const CELL = { x: 0, y: 0, width: 1, height: 1 }
  const two: readonly Rect[] = [CELL, { x: 4, y: 4, width: 1, height: 1 }]

  // The invariant a client depends on: ⌘Z must not cost one press per cell.
  it('lays a whole set of cells as ONE history entry', async () => {
    const { engine, patches } = await mounted({ ...DEFAULT_CANVAS, pixelCell: 1 })

    expect(engine.paintCells(null, two, 0xff0000)).toBe(true)
    expect(patches).toHaveLength(1)
  })

  // The one branch of the call a client can see from outside: a null colour takes pixels away.
  it('erases the cells rather than painting them when no colour is named', async () => {
    const { engine } = await mounted({ ...DEFAULT_CANVAS, pixelCell: 1 })
    canvasGpu().painted = []

    expect(engine.paintCells(null, two, null)).toBe(true)
    expect(canvasGpu().painted).not.toHaveLength(0)
  })

  /**
   * A refusal leaves the history alone: an entry that changes nothing is a ⌘Z the user watches
   * do something invisible. The layer is named by ID and is NOT the armed one, which is the
   * whole reason the call resolves its own target.
   */
  it('refuses an absent layer and a padlocked one, and pushes nothing for either', async () => {
    const locked: CanvasState = {
      ...DEFAULT_CANVAS,
      layers: [
        pixelLayer('armed', 'Armed'),
        { ...pixelLayer('l', 'L'), locked: { ...UNLOCKED, pixels: true } },
      ],
      activeLayerId: 'armed',
    }
    const { engine, patches } = await mounted(locked)

    expect(engine.paintCells('nobody', [CELL], 0)).toBe(false)
    expect(engine.paintCells('l', [CELL], 0)).toBe(false)
    expect(patches).toHaveLength(0)
  })

  /**
   * 🛑 `patches.begin` throws away whatever is open: a call landing between two `pointermove`
   * would take the trait's tiles with it, and the trait would end with no entry at all.
   */
  it('refuses while a stroke is in flight', async () => {
    const { engine, host } = await mounted({ ...DEFAULT_CANVAS, pixelCell: 1 }, 'pencil')

    press(host, 200, 200)
    expect(engine.paintCells(null, two, 0xff0000)).toBe(false)
    release(200, 200)
  })
})

describe('the gestures of a pixel grid', () => {
  // Aligned whatever the magnetism says: on a grid the alignment is the mode, not a preference.
  it('lands a moved layer on a cell boundary, ahead of the magnetism', async () => {
    const stack: CanvasState = {
      ...DEFAULT_CANVAS,
      pixelCell: 16,
      layers: [{ ...pixelLayer('t', 'T'), transform: { ...IDENTITY, x: 0, y: 0 } }],
      activeLayerId: 't',
    }
    const { engine, host, layers } = await mounted(stack, 'move')
    engine.setView({ ...DEFAULT_VIEW, rulers: false, guides: false, snap: true })

    press(host, 200, 200)
    drag(host, 237, 205)
    release(237, 205)

    // The hand moved by (37, 5); the layer lands on the nearest boundary of a 16 px cell.
    expect(layers).toContain('translate:t:32:0')
  })

  /**
   * A marquee off the grid selects a fraction of a cell, which no dab can ever fill. Both ends
   * grow OUTWARD: rounding each to its nearest boundary makes a drag of the same length select a
   * cell or nothing at all, depending where inside a cell the hand happened to start.
   */
  it('carves a marquee outward, onto whole cells', async () => {
    const { engine, host, selections } = await mounted({ ...DEFAULT_CANVAS, pixelCell: 16 })
    engine.setTool('select')
    engine.setView({ ...DEFAULT_VIEW, rulers: false, guides: false, snap: false })

    press(host, 205, 205)
    drag(host, 253, 261)
    release(253, 261)
    await nextFrame()

    expect(selections.at(-1)).toEqual({
      kind: 'rect',
      rect: { x: 192, y: 192, width: 64, height: 80 },
    })
  })

  it('takes the cell a drag never left, rather than nothing at all', async () => {
    const { engine, host, selections } = await mounted({ ...DEFAULT_CANVAS, pixelCell: 16 })
    engine.setTool('select')

    press(host, 220, 220)
    drag(host, 228, 228)
    release(228, 228)
    await nextFrame()

    expect(selections.at(-1)).toEqual({
      kind: 'rect',
      rect: { x: 208, y: 208, width: 32, height: 32 },
    })
  })
})

describe('a stroke on a pixel grid', () => {
  // The press stamps the first cell, each move the cells of the line after it — merged into one
  // rectangle per row, so no fragment of a half-opaque stroke is drawn onto itself.
  it('stamps the cells of the line, one run per row', async () => {
    const { engine, host } = await mounted({ ...DEFAULT_CANVAS, pixelCell: 8 }, 'pencil')
    engine.setBrush({ ...DEFAULT_BRUSH, size: 1 })
    // A surface is born filled edge to edge, by the same `rect` — not a stamp.
    canvasGpu().stamps = []

    press(host, 204, 204)
    drag(host, 244, 228)
    release()

    // Bresenham from (25,25) to (30,28): 25 · 26,27 · 28,29 · 30 — one run per row.
    expect(canvasGpu().stamps).toEqual([
      { x: 200, y: 200, width: 8, height: 8 },
      { x: 208, y: 208, width: 16, height: 8 },
      { x: 224, y: 216, width: 16, height: 8 },
      { x: 240, y: 224, width: 8, height: 8 },
    ])
  })
})

describe('generation comments', () => {
  it('places a point comment where the canvas was clicked', async () => {
    const { host, comments } = await mounted(undefined, 'comment')

    press(host, 40, 80)
    release(40, 80)

    expect(comments).toEqual([{ at: { x: 40, y: 80 } }])
  })

  it('keeps the area traced before the comment is opened', async () => {
    const { host, comments } = await mounted(undefined, 'comment')

    press(host, 40, 80)
    drag(host, 80, 80)
    drag(host, 80, 120)
    release(40, 120)

    expect(comments).toEqual([
      {
        at: { x: 40, y: 80 },
        outline: [
          { x: 40, y: 80 },
          { x: 80, y: 80 },
          { x: 80, y: 120 },
        ],
      },
    ])
  })

  it('keeps a bounded long outline attached to the pointer', async () => {
    const { host, comments } = await mounted(undefined, 'comment')

    press(host, 40, 80)
    for (let x = 41; x <= 640; x += 1) drag(host, x, 80)
    release(640, 80)

    expect(comments[0]?.outline?.length).toBeLessThanOrEqual(512)
    expect(comments[0]?.outline?.at(-1)).toEqual({ x: 640, y: 80 })
  })
})
