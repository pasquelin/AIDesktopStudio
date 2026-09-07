import { describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS } from './canvasState'

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import { drag, mounted, press, release } from './canvasEngineTest-fixtures'

describe('the crop tool', () => {
  it('adjusts the placed frame when a grip is dragged', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)

    // The east grip sits at x = 400, halfway down the frame.
    press(host, 400, 200)
    drag(host, 500, 200)
    release(500, 200)
    engine.applyCrop()

    expect(crops).toEqual([{ x: 100, y: 100, width: 400, height: 200 }])
  })

  it('starts a fresh frame when the press lands away from every grip', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)

    press(host, 600, 600)
    drag(host, 700, 660)
    release(700, 660)
    engine.applyCrop()

    expect(crops).toEqual([{ x: 600, y: 600, width: 100, height: 60 }])
  })

  it('places nothing for a press the hand never dragged', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 200, 200)
    release(200, 200)
    engine.applyCrop()

    expect(crops).toEqual([])
  })

  it('clamps a drag that runs off the document, so a crop never grows the frame', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 900, 900)
    drag(host, 2000, 2000)
    release(2000, 2000)
    engine.applyCrop()

    expect(crops).toEqual([{ x: 900, y: 900, width: 124, height: 124 }])
  })

  it('squares the frame while shift is held', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 200, true)
    release(400, 200)
    engine.applyCrop()

    expect(crops).toEqual([{ x: 100, y: 100, width: 300, height: 300 }])
  })

  it('keeps the frame through a middle-button pan', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)

    press(host, 400, 300, 1)
    release(400, 300)
    engine.applyCrop()

    expect(crops).toEqual([{ x: 100, y: 100, width: 300, height: 200 }])
  })

  it('drops the frame when another tool is armed', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)
    engine.setTool('brush')
    engine.applyCrop()

    expect(crops).toEqual([])
  })
})
