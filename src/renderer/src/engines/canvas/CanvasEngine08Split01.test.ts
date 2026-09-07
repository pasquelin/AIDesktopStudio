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
  it('places a frame on release without cropping anything yet', async () => {
    const { host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)

    expect(crops).toEqual([])
  })

  it('says a grip of the placed frame pulls across its edge', async () => {
    const { host } = await mounted(DEFAULT_CANVAS, 'crop')
    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)

    drag(host, 400, 200)

    expect(host.querySelector('canvas')?.style.cursor).toBe('ew-resize')
  })

  it('offers no rotation outside a corner of the frame', async () => {
    const { host } = await mounted(DEFAULT_CANVAS, 'crop')
    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)

    drag(host, 412, 312)

    expect(host.querySelector('canvas')?.style.cursor).toBe('')
  })

  it('crops to the placed frame on ⏎', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)
    engine.applyCrop()

    expect(crops).toEqual([{ x: 100, y: 100, width: 300, height: 200 }])
  })

  it('takes the frame off screen on ⎋, and crops nothing', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)
    engine.dropCrop()
    engine.applyCrop()

    expect(crops).toEqual([])
  })

  it('says a frame is drawn, and says it is gone once answered', async () => {
    const { engine, host, cropFrames } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)
    expect(cropFrames.at(-1)).toBe(true)

    engine.applyCrop()

    expect(cropFrames.at(-1)).toBe(false)
  })

  it('says so again after a frame dropped rather than applied', async () => {
    const { engine, host, cropFrames } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)
    engine.dropCrop()

    expect(cropFrames.at(-1)).toBe(false)
  })

  it('ignores ⏎ when no frame is placed', async () => {
    const { engine, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    engine.applyCrop()

    expect(crops).toEqual([])
  })
})
