import { NEUTRAL_ADJUSTMENTS, type AdjustmentStack } from '@shared/domain/adjustments'
import { describe, expect, it } from 'vitest'
import { adjustmentLayer, pixelLayer, type CanvasState } from './canvasState'

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import {
  canvasGpu,
  drag,
  groupContainer,
  mounted,
  press,
  release,
  stacked,
} from './canvasEngineTest-fixtures'

describe('adjustment layers', () => {
  const graded = (values: Partial<AdjustmentStack> = {}): CanvasState =>
    stacked([
      pixelLayer('layer-1', 'Background'),
      {
        ...adjustmentLayer('grade', 'Exposure', 'exposure'),
        values: { ...NEUTRAL_ADJUSTMENTS, ...values },
      },
    ])

  // It holds no pixels of its own: allocating it a document-sized texture would be pure waste.
  it('costs no texture', async () => {
    await mounted(graded())

    expect(canvasGpu().texturesCreated).toBe(1)
  })

  it('grades through a container of its own, carrying one filter', async () => {
    await mounted(graded())
    const pass = groupContainer('grade')

    expect(pass?.filters).toHaveLength(1)
  })

  // What it covers goes inside it: the filter grades the pass, not a sibling beside it.
  it('holds what it grades rather than sitting next to it', async () => {
    await mounted(graded())

    expect(groupContainer('grade')?.children).toHaveLength(1)
  })

  /**
   * The container holds the layers it grades, so hiding it would hide the whole stack under it.
   * The eye of an adjustment drops its pass instead.
   */
  it('drops its pass when it is hidden, rather than hiding what it grades', async () => {
    const layer = { ...adjustmentLayer('grade', 'Exposure', 'exposure'), visible: false }
    await mounted(stacked([pixelLayer('layer-1', 'Background'), layer]))

    const pass = groupContainer('grade')
    expect(pass?.filters).toEqual([])
    expect(pass?.visible).toBe(true)
  })

  it('lets the pass go when the layer leaves the stack', async () => {
    const { engine } = await mounted(graded())

    engine.apply(stacked([pixelLayer('layer-1', 'Background')]))

    expect(groupContainer('grade')?.children).toHaveLength(0)
  })
})

describe('drawing a shape', () => {
  it('asks the stack for a layer when the hand comes up, and not before', async () => {
    const { engine, host, shapes } = await mounted()
    engine.setTool('shape')

    press(host, 200, 200)
    drag(host, 300, 260)
    // A layer per pointer move would be a hundred entries in the history for one gesture.
    expect(shapes).toEqual([])

    release()
    expect(shapes).toHaveLength(1)
  })

  it('writes no pixel of its own, which is what keeps the shape editable', async () => {
    const { engine, host, patches } = await mounted()
    engine.setTool('shape')
    canvasGpu().painted = []

    press(host, 200, 200)
    drag(host, 300, 260)
    release()

    expect(canvasGpu().painted).not.toContain(0)
    expect(patches).toEqual([])
  })

  // Six modes, one tool: the bar says which shape the next drag draws.
  it('hands over whichever of the six was armed, and its point count', async () => {
    const { engine, host, shapes } = await mounted()
    engine.setTool('shape')
    engine.setShape('star', 7)

    press(host, 200, 200)
    drag(host, 300, 260)
    release()

    expect(shapes[0]?.drawn.shape).toBe('star')
    expect(shapes[0]?.drawn.sides).toBe(7)
  })

  /**
   * A layer draws into a texture of its own, from (0, 0), and its transform is what puts it back
   * where the hand drew it: a point left in document space would draw outside the texture.
   */
  it('hands the two points over in the space of the layer itself', async () => {
    const { engine, host, shapes } = await mounted()
    engine.setTool('shape')

    press(host, 200, 200)
    drag(host, 300, 260)
    release()
    const far = { ...shapes[0] }

    press(host, 100, 120)
    drag(host, 200, 180)
    release()

    for (const one of shapes) {
      expect(one.drawn.from.x).toBeGreaterThanOrEqual(0)
      expect(one.drawn.from.y).toBeGreaterThanOrEqual(0)
    }
    // The same drag, moved: the shape is the same and only where its box starts differs.
    expect(shapes[1]?.drawn).toEqual(far.drawn)
    expect(shapes[1]?.at).not.toEqual(far.at)
  })

  it('stores the square shift really drew, not the rectangle the pointer traced', async () => {
    const { engine, host, shapes } = await mounted()
    engine.setTool('shape')
    engine.setShape('rectangle', 5)

    press(host, 200, 200)
    host.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 300, clientY: 240, shiftKey: true }),
    )
    release()

    expect(shapes[0]?.drawn.to.x).toBeCloseTo(shapes[0]?.drawn.to.y ?? 0)
  })

  it('lands even over a layer whose pixels are padlocked, having none of its own', async () => {
    const { engine, host, shapes } = await mounted(
      stacked([
        {
          ...pixelLayer('layer-1', 'Background'),
          locked: { pixels: true, position: false, alpha: false },
        },
      ]),
    )
    engine.setTool('shape')

    press(host, 200, 200)
    drag(host, 300, 260)
    release()

    expect(shapes).toHaveLength(1)
  })
})
