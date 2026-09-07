import { describe, expect, it } from 'vitest'
import { pixelLayer } from './canvasState'

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import { drag, mounted, press, stacked } from './canvasEngineTest-fixtures'

describe('the transform grips', () => {
  const armed = async () => {
    const harness = await mounted()
    harness.engine.setTool('move')
    return harness
  }

  it('moves the layer for a drag that took no grip at all', async () => {
    const { host, layers } = await armed()

    press(host, 400, 400)
    drag(host, 460, 430)

    expect(layers.at(-1)).toBe('translate:layer-1:60:30')
  })

  it('takes no grip on a layer whose position is padlocked', async () => {
    const { engine, host, layers } = await mounted(
      stacked([
        {
          ...pixelLayer('layer-1', 'Background'),
          locked: { pixels: false, position: true, alpha: false },
        },
      ]),
    )
    engine.setTool('move')

    press(host, 1024, 1024)
    drag(host, 1224, 1224)

    expect(layers).toEqual([])
  })
})
