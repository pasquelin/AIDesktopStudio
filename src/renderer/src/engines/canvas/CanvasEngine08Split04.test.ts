import { describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS, pixelLayer } from './canvasState'

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import { drag, mounted, press, release, VIEW_1_1 } from './canvasEngineTest-fixtures'

describe('the move tool', () => {
  // The layer position lives in the state, not on the sprite: anything else is lost to the next
  // `apply` and invisible to the history.
  it('writes the layer position into the state instead of nudging the sprite', async () => {
    const { engine, host, layers } = await mounted()
    engine.setTool('move')

    press(host, 200, 200)
    drag(host, 260, 230)
    release()

    expect(layers).toEqual(['begin', 'translate:layer-1:60:30', 'end'])
  })

  // Every step is absolute from where the layer stood, or merging the drag into one entry would
  // rewind a single pointer move.
  it('reports where the layer is, not how far the pointer went', async () => {
    const { engine, host, layers } = await mounted()
    engine.setTool('move')

    press(host, 200, 200)
    drag(host, 260, 200)
    drag(host, 300, 200)

    expect(layers).toEqual(['begin', 'translate:layer-1:60:0', 'translate:layer-1:100:0'])
  })

  it('sticks the layer edge to a guide the way a guide sticks to the frame', async () => {
    const { engine, host, layers } = await mounted({
      ...DEFAULT_CANVAS,
      guides: [{ id: 'g', axis: 'x', position: 64 }],
    })
    engine.setView(VIEW_1_1)
    engine.setTool('move')

    press(host, 200, 200)
    drag(host, 262, 200)

    expect(layers.at(-1)).toBe('translate:layer-1:64:0')
  })

  it('refuses to move a layer whose position is padlocked', async () => {
    const { engine, host, layers } = await mounted({
      ...DEFAULT_CANVAS,
      layers: [pixelLayer('layer-1', 'Background')].map(layer => ({
        ...layer,
        locked: { pixels: false, position: true, alpha: false },
      })),
    })
    engine.setTool('move')

    press(host, 200, 200)
    drag(host, 260, 230)

    expect(layers).toEqual([])
  })

  it('closes the drag when a pan takes the pointer mid-gesture', async () => {
    const { engine, host, layers } = await mounted()
    engine.setTool('move')

    press(host, 200, 200)
    press(host, 220, 220, 1)

    expect(layers.at(-1)).toBe('end')
  })
})
