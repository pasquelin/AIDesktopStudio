import { describe, expect, it } from 'vitest'
import { layerFixture } from './canvas-fixtures'
import { DEFAULT_CANVAS, groupLayer, pixelLayer, UNLOCKED, type CanvasState } from './canvasState'
import type { CanvasTool } from './canvasTool'

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
  cursorOn,
  drag,
  mounted,
  nextFrame,
  overlayRecorder,
  stacked,
  VIEW_1_1,
} from './canvasEngineTest-fixtures'

describe('a tool that can do nothing here', () => {
  const BARE = { ...VIEW_1_1, rulers: false, guides: false, snap: false }

  async function hoveringWith(tool: CanvasTool, state: CanvasState): Promise<string> {
    const harness = await mounted(state, tool)
    harness.engine.setView(BARE)
    await nextFrame()

    drag(harness.host, 120, 90)
    await nextFrame()
    return cursorOn(harness.host)
  }

  const armedGroup = (): CanvasState => {
    const group = groupLayer('g', 'G', [pixelLayer('a', 'A')])
    return { ...DEFAULT_CANVAS, layers: [group], activeLayerId: group.id }
  }

  const padlocked = (): CanvasState =>
    stacked([layerFixture({ locked: { ...UNLOCKED, pixels: true } })])

  const pinned = (): CanvasState =>
    stacked([layerFixture({ locked: { ...UNLOCKED, position: true } })])

  it('refuses the brush on a group, and says so under the hand', async () => {
    expect(await hoveringWith('brush', armedGroup())).toBe('not-allowed')
  })

  it('refuses the brush on a layer padlocked against paint', async () => {
    expect(await hoveringWith('brush', padlocked())).toBe('not-allowed')
  })

  it('refuses the eraser and the bucket on the same layer', async () => {
    expect(await hoveringWith('eraser', padlocked())).toBe('not-allowed')
    expect(await hoveringWith('fill', padlocked())).toBe('not-allowed')
  })

  it('lets the shape tool through over a padlocked layer, having nothing to write on it', async () => {
    expect(await hoveringWith('shape', padlocked())).toBe('')
  })

  it('refuses the move tool on a layer pinned in place', async () => {
    expect(await hoveringWith('move', pinned())).toBe('not-allowed')
  })

  it('lets the brush through on a layer that can take it', async () => {
    expect(await hoveringWith('brush', stacked([layerFixture()]))).toBe('')
  })

  it('says nothing for the tools a padlock does not stop', async () => {
    expect(await hoveringWith('picker', padlocked())).toBe('')
    expect(await hoveringWith('select', padlocked())).toBe('')
    expect(await hoveringWith('crop', padlocked())).toBe('')
  })

  it('takes the refusal back when a tool that can act is armed', async () => {
    const harness = await mounted(padlocked(), 'brush')
    harness.engine.setView(BARE)
    drag(harness.host, 120, 90)
    await nextFrame()
    expect(cursorOn(harness.host)).toBe('not-allowed')

    harness.engine.setTool('picker')
    drag(harness.host, 122, 92)
    await nextFrame()

    expect(cursorOn(harness.host)).toBe('')
  })

  it('yields to space, which can always pan', async () => {
    const harness = await mounted(padlocked(), 'brush')
    harness.engine.setView(BARE)
    drag(harness.host, 120, 90)
    await nextFrame()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    drag(harness.host, 122, 92)
    await nextFrame()

    expect(cursorOn(harness.host)).toBe('grab')
  })

  it('drops the ring too, since nothing would land under it', async () => {
    const { rings } = overlayRecorder()
    const harness = await mounted(padlocked(), 'brush')
    harness.engine.setView(BARE)
    await nextFrame()

    rings.length = 0
    drag(harness.host, 120, 90)
    await nextFrame()

    expect(rings).toHaveLength(0)
  })
})
