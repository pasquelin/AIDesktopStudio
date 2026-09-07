import { describe, expect, it, onTestFinished } from 'vitest'
import { DEFAULT_CANVAS, pixelLayer, type CanvasState } from './canvasState'

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
import {
  canvasGpu,
  drag,
  flushMicrotasks,
  mounted,
  press,
  release,
  SAVED,
  stacked,
} from './canvasEngineTest-fixtures'

describe('following the document to another size', () => {
  const masked: CanvasState = {
    ...DEFAULT_CANVAS,
    layers: [{ ...pixelLayer('layer-1', 'Background'), mask: { enabled: true, linked: true } }],
    activeLayerId: 'layer-1',
  }

  const resizedTo = (state: CanvasState, width: number, height: number): CanvasState => ({
    ...state,
    width,
    height,
    // A fresh array, since `apply` skips a state whose stack it already holds.
    layers: [...state.layers],
  })

  it('rebuilds the layer and its mask, and frees what they replace', async () => {
    const { engine } = await mounted(masked)
    const builtBefore = canvasGpu().texturesCreated
    const freedBefore = canvasGpu().texturesDestroyed

    engine.apply(resizedTo(masked, 512, 512))

    // Two surfaces, so two textures out and two in. A mask left behind is a layer hidden by a
    // stencil one document old.
    expect(canvasGpu().texturesCreated - builtBefore).toBe(2)
    expect(canvasGpu().texturesDestroyed - freedBefore).toBe(2)
  })

  it('carries the old picture into each new surface', async () => {
    const { engine } = await mounted(masked)
    const first = canvasGpu().texturesCreated
    canvasGpu().painted = []

    engine.apply(resizedTo(masked, 512, 512))

    // Rebuilt and left empty would lose the stack outright; the copy is what makes it a resize.
    expect(canvasGpu().painted).toContain(first)
    expect(canvasGpu().painted).toContain(first + 1)
  })

  it('leaves the surfaces alone when the frame keeps its size', async () => {
    const { engine } = await mounted(masked)
    const freedBefore = canvasGpu().texturesDestroyed

    engine.apply({ ...masked, layers: [...masked.layers] })

    expect(canvasGpu().texturesDestroyed).toBe(freedBefore)
  })

  it('throws the undo tiles away, and says which ones', async () => {
    // A capture names its tile in the surface's own coordinates. Once the surface is another
    // shape those coordinates point elsewhere, so replaying one would paint sideways.
    const { engine, host, patches, dropped } = await mounted(masked)
    press(host, 200, 200)
    drag(host, 240, 240)
    release()
    const recorded = patches[0]
    expect(recorded).toBeDefined()

    engine.apply(resizedTo(masked, 512, 512))

    expect(dropped).toEqual([recorded])
  })
})

/**
 * The stencil holder is rebuilt per pass and the old one freed with its children. The brush's
 * stamp is not one of its children to keep — it is built once, with the engine, and lives as long
 * as it does.
 */
describe('the stencil holder and the stamp it borrows', () => {
  const paintSpace = (): Placed | undefined =>
    canvasGpu().containers.find(container => container.matrix)

  /** With nothing selected the stamp goes straight into the paint space: that is how it is found. */
  function stampAfterAPlainDab(host: HTMLElement): Placed {
    press(host, 200, 200)
    release(200, 200)
    const stamp = paintSpace()?.children[0]
    if (!stamp) throw new Error('a dab always draws through the paint space')
    return stamp
  }

  /**
   * The softener is hung by `setTool`, which a rebuilt engine can run BEFORE its first state —
   * and nothing feathers on a grid. Without the first state counting as a change, every square
   * came out blurred and the tiles were recorded a fringe too wide, silently.
   */
  it('hangs no softener when the first state it is handed is already on a grid', async () => {
    const { host } = await mounted({ ...DEFAULT_CANVAS, pixelCell: 8 }, 'brush')

    expect(stampAfterAPlainDab(host).filters).toEqual([])
  })

  it('keeps the stamp alive when a selection is dropped between two strokes', async () => {
    const { engine, host } = await mounted()
    const stamp = stampAfterAPlainDab(host)

    // Inside a marquee the stamp is reparented into a holder, which is what the stencil masks.
    engine.setSelection({ kind: 'rect', rect: { x: 0, y: 0, width: 100, height: 100 } })
    press(host, 50, 50)
    release(50, 50)

    // Deselecting frees that holder. The stamp must not go with it, or the brush is dead for
    // the rest of the session: it is built once and never rebuilt.
    engine.setSelection(null)
    press(host, 200, 200)
    release(200, 200)

    expect(stamp.destroyed).toBe(false)
  })

  it('keeps the stamp alive when another tool borrows the stencil next', async () => {
    const { engine, host } = await mounted()
    const stamp = stampAfterAPlainDab(host)

    engine.setSelection({ kind: 'rect', rect: { x: 0, y: 0, width: 100, height: 100 } })
    press(host, 50, 50)
    release(50, 50)

    // The bucket cuts on the same stencil, and hands `clipped` a sheet of its own: the holder
    // holding the stamp is freed by a pass the stamp is not part of.
    engine.setTool('fill')
    press(host, 60, 60)
    release(60, 60)

    expect(stamp.destroyed).toBe(false)
  })
})

describe('painting into a mask', () => {
  const masked: CanvasState = {
    ...DEFAULT_CANVAS,
    layers: [{ ...pixelLayer('layer-1', 'Background'), mask: { enabled: true, linked: true } }],
    activeLayerId: 'layer-1',
  }

  /** The layer's texture is built first, its mask second. */
  const LAYER = 0
  const MASK = 1

  it('writes to the layer while the brush is aimed at its pixels', async () => {
    const { host } = await mounted(masked)
    canvasGpu().painted = []

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(canvasGpu().painted).toContain(LAYER)
    expect(canvasGpu().painted).not.toContain(MASK)
  })

  it('writes to the mask once the brush is aimed at it', async () => {
    const { engine, host } = await mounted(masked)
    engine.setPaintTarget('mask')
    canvasGpu().painted = []

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(canvasGpu().painted).toContain(MASK)
    expect(canvasGpu().painted).not.toContain(LAYER)
  })

  it('files the undo patch against the mask, so the stroke can be taken back', async () => {
    const { engine, host, patches } = await mounted(masked)
    engine.setPaintTarget('mask')

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    const patchId = patches[0]
    expect(patchId).toBeDefined()
    canvasGpu().painted = []
    expect(engine.restorePixels(patchId ?? '', 'before')).toBe(true)
    expect(canvasGpu().painted).toContain(MASK)
  })

  // A layer with no mask has nothing to paint into: the stroke lands nowhere rather than on it.
  it('paints nothing when the layer aimed at carries no mask', async () => {
    const { engine, host, patches } = await mounted()
    engine.setPaintTarget('mask')
    canvasGpu().painted = []

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(canvasGpu().painted).toEqual([])
    expect(patches).toEqual([])
  })
})

describe('loading a picture into a layer', () => {
  const URL = 'ai-desktop-studio://asset/take-1'

  it('draws it into the texture of the layer it names', async () => {
    const { engine } = await mounted(stacked([pixelLayer('a', 'A'), pixelLayer('b', 'B')]))
    canvasGpu().painted = []

    await engine.loadInto('b', URL)

    expect(canvasGpu().painted).toEqual([1])
  })

  // The scheme carries no extension, so nothing in the URL tells Pixi what to make of it.
  it('names the parser, which the scheme cannot tell Pixi by itself', async () => {
    const { engine } = await mounted()

    await engine.loadInto('layer-1', URL)

    expect(canvasGpu().loaded).toEqual([{ src: URL, parser: 'texture' }])
  })

  it('lays it inside the document without deforming it', async () => {
    const { engine } = await mounted()

    await engine.loadInto('layer-1', URL)

    // 200×100 in a 1024² document: it already fits, so it keeps its size and is centred.
    const laid = canvasGpu().sprites.at(-1)
    expect(laid?.size).toEqual({ width: 200, height: 100 })
    expect(laid?.position).toMatchObject({ x: 412, y: 462 })
  })

  /**
   * The seam a whole layer of tests used to straddle: the engine hears about a layer one React
   * commit after the store took it, so a picture drawn at the moment of the drop landed nowhere
   * at all. It is drawn when the surface is built, which is the first moment there is one.
   */
  it('draws what a layer carries as soon as it builds its surface', async () => {
    const laid = { ...pixelLayer('a', 'A'), source: 'asset-7' }
    const { engine } = await mounted()
    canvasGpu().loaded = []

    engine.apply(stacked([pixelLayer('layer-1', 'Background'), laid]))
    await flushMicrotasks()

    expect(canvasGpu().loaded).toEqual([
      { src: 'ai-desktop-studio://asset/asset-7', parser: 'texture' },
    ])
  })

  // Once, when it is born: redrawing on every state would repaint over what has been painted.
  it('draws it once, not on every state that mentions the layer', async () => {
    const laid = { ...pixelLayer('a', 'A'), source: 'asset-7' }
    const { engine } = await mounted(stacked([laid]))
    await flushMicrotasks()
    canvasGpu().loaded = []

    engine.apply(stacked([{ ...laid, opacity: 0.5 }]))
    await flushMicrotasks()

    expect(canvasGpu().loaded).toEqual([])
  })

  // The race, and the loop behind it, are written out at `LayerSurface.fromDocument`.
  it('leaves the asset alone for a layer whose pixels the document restored', async () => {
    const laid = { ...pixelLayer('a', 'A'), source: 'asset-7' }
    const { engine } = await mounted()
    await engine.restoreSnapshot({ layerId: 'a', mask: false, data: SAVED })
    canvasGpu().loaded = []

    engine.apply(stacked([pixelLayer('layer-1', 'Background'), laid]))
    await flushMicrotasks()

    expect(canvasGpu().loaded).toHaveLength(1)
    expect(canvasGpu().loaded[0]?.src.startsWith('blob:')).toBe(true)
  })

  /**
   * A part inside `<id>.img/` can be truncated or corrupt. Before the claim existed the layer was
   * drawn from its asset regardless, so a bad part cost nothing visible; claimed and then failed,
   * it would leave the layer empty and silent — and the next ⌘S would write that emptiness over
   * the asset.
   */
  it('falls back to the asset when the document’s own pixels will not decode', async () => {
    const laid = { ...pixelLayer('a', 'A'), source: 'asset-7' }
    const { engine } = await mounted()
    await engine.restoreSnapshot({ layerId: 'a', mask: false, data: SAVED })
    canvasGpu().loaded = []
    canvasGpu().refuseLoad = true
    onTestFinished(() => {
      canvasGpu().refuseLoad = false
    })

    engine.apply(stacked([laid]))
    await flushMicrotasks()

    expect(canvasGpu().loaded.map(asked => asked.src)).toContain(
      'ai-desktop-studio://asset/asset-7',
    )
  })

  // Same fallback on the other path: a surface that already exists takes its pixels directly,
  // and the caller is told, because there it has somewhere to report to.
  it('gives the claim back when pixels handed to a live surface will not decode', async () => {
    const laid = { ...pixelLayer('a', 'A'), source: 'asset-7' }
    const { engine } = await mounted(stacked([laid]))
    await flushMicrotasks()
    canvasGpu().loaded = []
    canvasGpu().refuseLoad = true
    onTestFinished(() => {
      canvasGpu().refuseLoad = false
    })

    await expect(
      engine.restoreSnapshot({ layerId: 'a', mask: false, data: SAVED }),
    ).rejects.toThrow()
    await flushMicrotasks()

    expect(canvasGpu().loaded.map(asked => asked.src)).toContain(
      'ai-desktop-studio://asset/asset-7',
    )
  })

  /**
   * The surface is held for exactly this, so the saved pixels come back with the layer — the
   * asset is what it was BORN from, not what an undo owes the user. Redrawn from the asset, a
   * merge undone would give back the picture and lose every stroke laid on it since.
   */
  it('keeps the pixels it had once the layer has left the stack and returned', async () => {
    const laid = { ...pixelLayer('a', 'A'), source: 'asset-7' }
    const { engine } = await mounted()
    await engine.restoreSnapshot({ layerId: 'a', mask: false, data: SAVED })
    engine.apply(stacked([laid]))
    await flushMicrotasks()

    engine.apply(stacked([pixelLayer('layer-1', 'Background')]))
    canvasGpu().loaded = []
    engine.apply(stacked([laid]))
    await flushMicrotasks()

    expect(canvasGpu().loaded).toEqual([])
  })

  it('does nothing at all for a layer it does not hold', async () => {
    const { engine } = await mounted()
    canvasGpu().painted = []

    await expect(engine.loadInto('never-built', URL)).resolves.toBeUndefined()
    expect(canvasGpu().painted).toEqual([])
  })

  // Drawing into a texture the GPU has already freed is an error, not a no-op.
  it('drops the picture when the document closed while it was in flight', async () => {
    const { engine } = await mounted()
    const loading = engine.loadInto('layer-1', URL)
    engine.dispose()
    canvasGpu().painted = []

    await loading

    expect(canvasGpu().painted).toEqual([])
  })
})
