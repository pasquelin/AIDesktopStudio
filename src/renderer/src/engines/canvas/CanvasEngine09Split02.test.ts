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
import { cursorOn, drag, mounted, press, release, stacked } from './canvasEngineTest-fixtures'

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

  it('gives the cursor back when the pointer leaves a grip for the middle', async () => {
    const { host } = await armed()
    drag(host, 1024, 512)
    expect(cursorOn(host)).toBe('ew-resize')

    drag(host, 512, 512)

    expect(cursorOn(host)).toBe('')
  })

  it('turns the arrow with the layer, not just with the grip', async () => {
    const { engine, host } = await mounted(
      stacked([
        {
          ...pixelLayer('layer-1', 'Background'),
          transform: { ...IDENTITY, rotation: Math.PI / 2 },
        },
      ]),
    )
    engine.setTool('move')

    drag(host, 512, 1024)

    expect(cursorOn(host)).toBe('ns-resize')
  })

  it('brings the grip’s arrow back after space was held and released', async () => {
    const { host } = await armed()
    drag(host, 1024, 512)
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))

    drag(host, 1024, 512)

    expect(cursorOn(host)).toBe('ew-resize')
  })

  it('drops the cursor when another layer is armed under a still pointer', async () => {
    const state = stacked([pixelLayer('layer-1', 'Background'), pixelLayer('layer-2', 'Top')])
    const { engine, host } = await mounted(state)
    engine.setTool('move')
    drag(host, 1024, 512)
    expect(cursorOn(host)).toBe('ew-resize')

    // The very shape `selectLayer` produces: a fresh state around the same `layers` array.
    engine.apply({ ...state, activeLayerId: 'layer-2' })

    expect(cursorOn(host)).toBe('')
  })

  it('closes the history entry a turn opened', async () => {
    const { engine, host, layers } = await offset()
    engine.setTool('move')

    press(host, 190, 190)
    drag(host, 1234, 190)
    release()

    expect(layers.at(-1)).toBe('end')
  })

  it('hands the cursor back when another tool is armed', async () => {
    const { engine, host } = await armed()
    drag(host, 1024, 512)

    engine.setTool('brush')

    expect(cursorOn(host)).toBe('')
  })

  it('offers no grip at all once another tool is armed', async () => {
    const { engine, host } = await armed()
    drag(host, 1024, 512)
    expect(cursorOn(host)).toBe('ew-resize')

    engine.setTool('brush')
    drag(host, 1024, 513)

    expect(cursorOn(host)).toBe('')
  })
})
