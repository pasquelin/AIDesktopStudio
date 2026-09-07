import { describe, expect, it } from 'vitest'
import { IDENTITY, pixelLayer } from './canvasState'

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import { cursorOn, drag, mounted, press, stacked } from './canvasEngineTest-fixtures'

describe('the transform grips', () => {
  const armed = async () => {
    const harness = await mounted()
    harness.engine.setTool('move')
    return harness
  }

  const offset = (): Promise<Awaited<ReturnType<typeof mounted>>> =>
    mounted(
      stacked([
        { ...pixelLayer('layer-1', 'Background'), transform: { ...IDENTITY, x: 200, y: 200 } },
      ]),
    )

  it('takes a corner grip rather than moving the layer', async () => {
    const { host, layers } = await armed()

    press(host, 1024, 1024)
    drag(host, 1224, 1224)

    expect(layers.at(-1)).toMatch(/^transform:layer-1:/)
  })

  it('puts the grips on the picture the layer holds, not on the surface around it', async () => {
    const { host, engine, layers } = await armed()
    await engine.loadInto('layer-1', 'ai-desktop-studio://asset/take-1')

    press(host, 612, 562)
    drag(host, 812, 662)

    expect(layers.at(-1)).toBe('transform:layer-1:2.00:2.00:0.00')
  })

  it('scales from the far corner, so the opposite one stays put', async () => {
    const { host, layers } = await armed()

    press(host, 1024, 1024)
    drag(host, 2048, 2048)

    expect(layers.at(-1)).toBe('transform:layer-1:2.00:2.00:0.00')
  })

  it('reports where the layer is, not how far the pointer went', async () => {
    const { host, layers } = await armed()

    press(host, 1024, 1024)
    drag(host, 2048, 2048)
    drag(host, 1536, 1536)

    expect(layers.at(-1)).toBe('transform:layer-1:1.50:1.50:0.00')
  })

  it('turns the layer by the zone just outside a corner', async () => {
    const { engine, host, layers } = await offset()
    engine.setTool('move')

    // Beyond the north-west corner (200, 200) — too far out for the grip, inside the rotation
    // ring — then a quarter turn about the middle at (712, 712).
    press(host, 190, 190)
    drag(host, 1234, 190)

    expect(layers.at(-1)).toMatch(/^transform:layer-1:1\.00:1\.00:1\.5/)
  })

  it('moves the layer for a drag that started just inside the same corner', async () => {
    const { engine, host, layers } = await offset()
    engine.setTool('move')

    press(host, 210, 210)
    drag(host, 240, 240)

    expect(layers.at(-1)).toBe('translate:layer-1:230:230')
  })

  it('says a grip pulls across the edge when the pointer rests on one', async () => {
    const { host } = await armed()

    drag(host, 1024, 512)

    expect(cursorOn(host)).toBe('ew-resize')
  })

  it('says a corner pulls along its diagonal', async () => {
    const { host } = await armed()

    drag(host, 1024, 1024)

    expect(cursorOn(host)).toBe('nwse-resize')
  })

  it('draws a turning cursor over the zone outside a corner', async () => {
    const { host } = await armed()

    drag(host, 1034, 1034)

    expect(cursorOn(host)).toContain('data:image/svg+xml')
  })
})
