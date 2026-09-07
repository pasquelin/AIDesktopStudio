import { describe, expect, it, onTestFinished } from 'vitest'
import { DEFAULT_CANVAS, groupLayer, pixelLayer, textLayer, type CanvasState } from './canvasState'

import {
  CanvasEngine,
  canvasGpu,
  drag,
  extractedBytes,
  mounted,
  nextFrame,
  press,
  release,
  SAVED,
  silentOptions,
  stacked,
} from './canvasEngineTest-fixtures'

describe('carving out a selection', () => {
  it('sends a click prompt in document coordinates without changing the selection', async () => {
    const { engine, host, selections, smartPrompts } = await mounted()
    engine.setTool('smartSelect')

    press(host, 120, 80)
    release(120, 80)
    await nextFrame()

    expect(smartPrompts).toEqual([{ point: { x: 120, y: 80 } }])
    expect(selections).toEqual([])
  })

  it('sends the approximate box as a prompt, never as the resulting selection', async () => {
    const { engine, host, selections, smartPrompts } = await mounted()
    engine.setTool('smartSelect')

    press(host, 120, 80)
    drag(host, 320, 280)
    release(320, 280)

    expect(smartPrompts).toEqual([{ box: { x: 120, y: 80, width: 200, height: 200 } }])
    expect(selections).toEqual([])
  })

  it('uses the release point when an intelligent box drag has no intervening move event', async () => {
    const { engine, host, smartPrompts } = await mounted()
    engine.setTool('smartSelect')

    press(host, 120, 80)
    release(320, 280)

    expect(smartPrompts).toEqual([{ box: { x: 120, y: 80, width: 200, height: 200 } }])
  })

  it('uses a point prompt instead of an invalid intelligent box for a click', async () => {
    const { engine, host, smartPrompts } = await mounted()
    engine.setTool('smartSelect')

    press(host, 120, 80)
    release(120, 80)

    expect(smartPrompts).toEqual([{ point: { x: 120, y: 80 } }])
  })

  it('normalizes an intelligent box dragged toward its origin', async () => {
    const { engine, host, smartPrompts } = await mounted()
    engine.setTool('smartSelect')

    press(host, 320, 280)
    release(120, 80)

    expect(smartPrompts).toEqual([{ box: { x: 120, y: 80, width: 200, height: 200 } }])
  })

  it('publishes a box drawn between the two corners of a drag', async () => {
    const { engine, host, selections } = await mounted()
    engine.setTool('select')

    press(host, 100, 100)
    drag(host, 300, 200)
    release()
    await nextFrame()

    expect(selections.at(-1)).toEqual({
      kind: 'rect',
      rect: { x: 100, y: 100, width: 200, height: 100 },
    })
  })

  it('draws an ellipse when that is the armed mode', async () => {
    const { engine, host, selections } = await mounted()
    engine.setTool('select')
    engine.setSelectionShape('ellipse')

    press(host, 100, 100)
    drag(host, 300, 200)
    await nextFrame()

    expect(selections.at(-1)?.kind).toBe('ellipse')
  })

  it('grows a lasso point by point', async () => {
    const { engine, host, selections } = await mounted()
    engine.setTool('select')
    engine.setSelectionShape('lasso')

    press(host, 100, 100)
    drag(host, 120, 130)
    drag(host, 160, 180)
    await nextFrame()

    const last = selections.at(-1)
    expect(last?.kind).toBe('lasso')
    expect(last?.kind === 'lasso' && last.points).toHaveLength(4)
  })

  it('draws whatever shape was armed last', async () => {
    const { engine, host, selections } = await mounted()
    engine.setTool('select')
    engine.setSelectionShape('lasso')
    engine.setSelectionShape('rect')

    press(host, 120, 120)
    drag(host, 160, 160)
    await nextFrame()

    expect(selections.at(-1)?.kind).toBe('rect')
  })

  it('drops a selection a click carved nothing out of', async () => {
    const { engine, host, selections } = await mounted()
    engine.setTool('select')

    press(host, 200, 200)
    release()
    await nextFrame()

    expect(selections.at(-1)).toBeNull()
  })

  it('keeps one a drag actually made', async () => {
    const { engine, host, selections } = await mounted()
    engine.setTool('select')

    press(host, 200, 200)
    drag(host, 260, 260)
    release()
    await nextFrame()

    expect(selections.at(-1)).not.toBeNull()
  })

  it('tells React once a frame rather than once per pointer move', async () => {
    const { engine, host, selections } = await mounted()
    engine.setTool('select')

    press(host, 200, 200)
    for (const x of [210, 220, 230]) drag(host, x, 240)

    expect(selections).toEqual([])
    await nextFrame()
    expect(selections).toHaveLength(1)
  })
})

describe('painting inside a selection', () => {
  /** How many objects the engine handed the renderer for the last pass. */
  const stencilled = (): boolean =>
    canvasGpu().containers.some(container => container.mask !== null)

  it('paints straight onto the layer when nothing is selected', async () => {
    const { host } = await mounted()
    canvasGpu().containers = []

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(stencilled()).toBe(false)
  })

  // Cut on the GPU rather than tested per dab: the shape is a stencil.
  it('cuts the stroke to the selection when there is one', async () => {
    const { engine, host } = await mounted()
    engine.setSelection({ kind: 'rect', rect: { x: 0, y: 0, width: 100, height: 100 } })
    canvasGpu().containers = []

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(stencilled()).toBe(true)
  })

  /**
   * The bucket stops at the selection; a surface being born never does. A mask is born white,
   * and one born white inside a marquee and transparent outside would hide its layer everywhere
   * else the moment it appeared.
   */
  it('never cuts the fill a surface is born with', async () => {
    const { engine } = await mounted()
    engine.setSelection({ kind: 'rect', rect: { x: 0, y: 0, width: 10, height: 10 } })
    canvasGpu().containers = []

    engine.apply(stacked([pixelLayer('layer-1', 'Background'), pixelLayer('b', 'B', 0xffffff)]))

    expect(canvasGpu().containers.some(container => container.mask !== null)).toBe(false)
  })

  it('cuts the bucket the same way, which is what makes it fill a region', async () => {
    const { engine, host } = await mounted()
    engine.setTool('fill')
    engine.setSelection({ kind: 'ellipse', rect: { x: 0, y: 0, width: 100, height: 100 } })
    canvasGpu().containers = []

    press(host, 200, 200)

    expect(stencilled()).toBe(true)
  })

  it('puts the bucket on screen without waiting for another gesture', async () => {
    const { engine, host } = await mounted()
    engine.setTool('fill')
    // A render aimed at no target is a render of the stage: what the window actually shows.
    const presented = (): number => canvasGpu().renders - canvasGpu().painted.length
    const before = presented()

    press(host, 200, 200)

    expect(presented()).toBeGreaterThan(before)
  })
})

describe('making a mask of a selection', () => {
  const masked = (): CanvasState =>
    stacked([{ ...pixelLayer('layer-1', 'Background'), mask: { enabled: true, linked: true } }])

  it('paints the region into a mask that already exists', async () => {
    const { engine } = await mounted(masked())
    engine.setSelection({ kind: 'rect', rect: { x: 0, y: 0, width: 40, height: 40 } })
    canvasGpu().painted = []

    engine.fillMaskFromSelection('layer-1')

    // The second texture is the mask, and `clear: true` says the region replaces what was there.
    expect(canvasGpu().painted).toContain(1)
  })

  /**
   * The seam again: the command that gives a layer its mask writes into the store, and the
   * surface only follows one React commit later. Asked for it before then, the engine held the
   * region rather than dropping it — otherwise the mask came out uniformly white.
   */
  it('holds the region until the mask it was asked for exists', async () => {
    const { engine } = await mounted()
    engine.setSelection({ kind: 'rect', rect: { x: 0, y: 0, width: 40, height: 40 } })

    engine.fillMaskFromSelection('layer-1')
    canvasGpu().painted = []
    engine.apply(masked())

    expect(canvasGpu().painted.filter(id => id === 1)).toHaveLength(2)
  })

  it('paints the region it was asked for, not the one selected by then', async () => {
    const { engine, host } = await mounted()
    engine.setSelection({ kind: 'rect', rect: { x: 0, y: 0, width: 40, height: 40 } })
    engine.fillMaskFromSelection('layer-1')

    engine.setTool('select')
    press(host, 200, 200)
    drag(host, 400, 400)
    release()
    canvasGpu().painted = []
    engine.apply(masked())

    expect(canvasGpu().painted.filter(id => id === 1)).toHaveLength(2)
  })
})

describe('flattening the document', () => {
  // What `mergedimage.png` holds: the picture every other application draws of a `.ora`, as
  // bytes — never a string, and never through one either.
  it('hands the flatten back as bytes', async () => {
    const { engine } = await mounted()

    await expect(engine.flatten()).resolves.toEqual(extractedBytes())
  })

  // The same picture, for the API and for a PNG asset: the payload alone, no data URL around it.
  it('hands the same picture back as base64 for the callers that take one', async () => {
    const { engine } = await mounted()

    await expect(engine.snapshot()).resolves.toBe(btoa(String.fromCharCode(...extractedBytes())))
  })

  it('frames the whole document when no region is named', async () => {
    const { engine } = await mounted()

    await engine.snapshot()

    expect(canvasGpu().extracted).toHaveLength(1)
    expect(canvasGpu().extracted[0]?.frame).toBeDefined()
  })

  /**
   * Not the renderer's resolution, which is the display scale: the same document would be sent
   * at 1024² from one screen and 2048² from another, at twice the price and past the 6 MB the
   * upload route accepts.
   */
  it('sends the document at its own size, whatever the screen is worth', async () => {
    const { engine } = await mounted()

    await engine.snapshot()

    expect(canvasGpu().extracted[0]?.resolution).toBe(1)
  })

  // Extracted bare, the sprite loses the transform `place` put on it and the mask arrives
  // offset from the picture it masks.
  it('frames a mask on the document, like the picture it masks', async () => {
    const { engine } = await mounted({
      ...DEFAULT_CANVAS,
      layers: [{ ...pixelLayer('layer-1', 'Background'), mask: { enabled: true, linked: true } }],
      activeLayerId: 'layer-1',
    })

    await engine.maskSnapshot('layer-1')

    expect(canvasGpu().extracted[0]?.frame).toBeDefined()
    expect(canvasGpu().extracted[0]?.resolution).toBe(1)
  })

  // The mask one paints is the mask one regenerates: the same texture, alone.
  it('extracts the mask of a layer on its own', async () => {
    const { engine } = await mounted({
      ...DEFAULT_CANVAS,
      layers: [{ ...pixelLayer('layer-1', 'Background'), mask: { enabled: true, linked: true } }],
      activeLayerId: 'layer-1',
    })

    await expect(engine.maskSnapshot('layer-1')).resolves.toBe(
      btoa(String.fromCharCode(...extractedBytes())),
    )
  })

  it('says nothing for a layer that carries no mask', async () => {
    const { engine } = await mounted()

    await expect(engine.maskSnapshot('layer-1')).resolves.toBeNull()
  })

  it('extracts one pixel layer without the rest of the document', async () => {
    const { engine } = await mounted()

    await expect(engine.layerSnapshot('layer-1')).resolves.toBe(
      btoa(String.fromCharCode(...extractedBytes())),
    )
    expect(canvasGpu().extracted[0]?.frame).toBeDefined()
  })

  it('extracts a drawn layer through its group and restores the visible stack', async () => {
    const { engine } = await mounted({
      ...DEFAULT_CANVAS,
      layers: [
        pixelLayer('background', 'Background'),
        groupLayer('group', 'Labels', [textLayer('caption', 'Hello', { x: 20, y: 30 })]),
      ],
      activeLayerId: 'caption',
    })

    const snapshot = engine.layerSnapshot('caption')
    expect(canvasGpu().sprites.every(sprite => sprite.renderable)).toBe(true)
    await expect(snapshot).resolves.toBe(btoa(String.fromCharCode(...extractedBytes())))
    expect(canvasGpu().sprites.every(sprite => sprite.renderable)).toBe(true)
  })

  it('turns comment outlines into one document-sized mask', async () => {
    const { engine } = await mounted()

    await expect(
      engine.outlineMaskSnapshot([
        [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
          { x: 30, y: 40 },
        ],
      ]),
    ).resolves.toBe(btoa(String.fromCharCode(...extractedBytes())))
    expect(canvasGpu().extracted[0]?.frame).toBeDefined()
  })
})

/**
 * What a saved image weighs. The stack goes in the manifest and the pixels in a file per surface,
 * so this is the seam between a document on disk and the textures only the GPU holds.
 */
describe('saving and restoring the pixels', () => {
  const masked = (): CanvasState => ({
    ...DEFAULT_CANVAS,
    layers: [
      { ...pixelLayer('layer-1', 'Background'), mask: { enabled: true, linked: true } },
      pixelLayer('layer-2', 'Paint'),
    ],
    activeLayerId: 'layer-1',
  })

  it('hands back one picture per surface, masks included', async () => {
    const { engine } = await mounted(masked())

    await expect(engine.pixelSnapshots()).resolves.toEqual([
      { layerId: 'layer-1', mask: false, data: extractedBytes() },
      { layerId: 'layer-1', mask: true, data: extractedBytes() },
      { layerId: 'layer-2', mask: false, data: extractedBytes() },
    ])
  })

  /**
   * The texture, not the placed sprite: a surface is document-sized and the transform lives in
   * the state, so extracting the sprite would bake in a move `place` applies again on the way in.
   */
  it('extracts the texture rather than the sprite, at the document’s own scale', async () => {
    const { engine } = await mounted()
    canvasGpu().extracted.length = 0

    await engine.pixelSnapshots()

    expect(canvasGpu().extracted[0]?.resolution).toBe(1)
    expect(canvasGpu().extracted[0]?.frame).toBeUndefined()
  })

  it('hands back nothing for a group, which owns no texture', async () => {
    const { engine } = await mounted({
      ...DEFAULT_CANVAS,
      layers: [groupLayer('group-1', 'Set', [])],
      activeLayerId: null,
    })

    await expect(engine.pixelSnapshots()).resolves.toEqual([])
  })

  it('hands back nothing before a document is applied', async () => {
    const engine = new CanvasEngine(silentOptions())

    await expect(engine.pixelSnapshots()).resolves.toEqual([])
  })

  /**
   * The loudest thing this engine does, and it has to stay loud. The container is replaced whole
   * on every ⌘S, so a surface handed back as ABSENT is a surface deleted from the file — and the
   * save then marks the document clean. A layer gone, in silence, on a save that looked fine.
   */
  it('refuses the whole extraction rather than dropping a surface it cannot encode', async () => {
    const { engine } = await mounted(masked())
    canvasGpu().refuseEncode = true
    onTestFinished(() => {
      canvasGpu().refuseEncode = false
    })

    await expect(engine.pixelSnapshots()).rejects.toThrow()
  })

  // Same rule for the flatten: `mergedimage.png` is what every other application draws.
  it('refuses to hand back a flatten it could not encode', async () => {
    const { engine } = await mounted(masked())
    canvasGpu().refuseEncode = true
    onTestFinished(() => {
      canvasGpu().refuseEncode = false
    })

    await expect(engine.flatten()).rejects.toThrow()
  })

  it('draws a saved picture back into the surface it came from', async () => {
    const { engine } = await mounted(masked())
    canvasGpu().loaded.length = 0

    await engine.restoreSnapshot({ layerId: 'layer-1', mask: true, data: SAVED })

    expect(canvasGpu().loaded[0]?.src.startsWith('blob:')).toBe(true)
    expect(canvasGpu().loaded[0]?.parser).toBe('texture')
  })

  /**
   * The loader's cache is keyed on the WHOLE source string and lives for the session. A data URL
   * of a 4K layer sat in it for good — the very megabytes this stopped putting in a string — so
   * the blob URL that replaced it has to be given back, both to the loader and to the document.
   */
  it('tells the loader to forget the blob URL a restore went in through', async () => {
    const { engine } = await mounted(masked())
    canvasGpu().unloaded.length = 0

    await engine.restoreSnapshot({ layerId: 'layer-1', mask: true, data: SAVED })

    expect(canvasGpu().unloaded).toEqual([canvasGpu().loaded[canvasGpu().loaded.length - 1]?.src])
  })
})
