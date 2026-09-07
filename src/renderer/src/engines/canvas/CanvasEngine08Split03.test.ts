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
import { canvasGpu, drag, mounted, press, release } from './canvasEngineTest-fixtures'

describe('the crop tool', () => {
  it('leaves a key typed into a prompt alone', async () => {
    const { host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)

    const field = document.createElement('input')
    document.body.appendChild(field)
    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))
    field.remove()

    expect(crops).toEqual([])
  })

  it('carries the kept region into the new surface, not the document’s corner', async () => {
    const { engine, host } = await mounted(DEFAULT_CANVAS, 'crop')
    canvasGpu().sprites.length = 0

    press(host, 900, 900)
    drag(host, 2000, 2000)
    release(2000, 2000)
    engine.applyCrop()

    expect(canvasGpu().sprites[0]?.position).toEqual({ x: -900, y: -900 })
  })

  it('drops the frame when the document changes size under it', async () => {
    const { engine, host, crops } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 800, 100)
    drag(host, 1000, 400)
    release(1000, 400)
    engine.apply({ ...DEFAULT_CANVAS, width: 512, height: 2048 })
    engine.applyCrop()

    expect(crops).toEqual([])
  })

  it('moves the picture’s grips with the pixels when the document is cropped', async () => {
    const { engine, host, layers } = await mounted(DEFAULT_CANVAS, 'crop')
    // 200 × 100 centred in 1024²: the picture sits at 412,462.
    await engine.loadInto('layer-1', 'ai-desktop-studio://asset/take-1')

    press(host, 400, 450)
    drag(host, 700, 600)
    release(700, 600)
    engine.applyCrop()
    engine.setTool('move')

    // The picture now sits at 12,12 in a 300 × 150 document, so its south-east grip is at 212,112.
    press(host, 212, 112)
    drag(host, 412, 212)

    expect(layers.at(-1)).toBe('transform:layer-1:2.00:2.00:0.00')
  })

  it('gives the new surface the frame’s own size', async () => {
    const { engine, host } = await mounted(DEFAULT_CANVAS, 'crop')
    const before = canvasGpu().texturesCreated

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)
    engine.applyCrop()

    expect(canvasGpu().texturesCreated).toBeGreaterThan(before)
    expect(canvasGpu().painted.length).toBeGreaterThan(0)
  })

  it('leaves the pixels alone', async () => {
    const { host, patches } = await mounted(DEFAULT_CANVAS, 'crop')

    press(host, 100, 100)
    drag(host, 400, 300)
    release(400, 300)

    expect(patches).toEqual([])
  })
})
