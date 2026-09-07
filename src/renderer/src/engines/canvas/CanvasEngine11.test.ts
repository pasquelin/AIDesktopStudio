import stylesheet from '@/index-foundation.css?raw'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BRUSH } from './brush'
import { DEFAULT_CANVAS } from './canvasState'
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
  drag,
  fallbackColors,
  mounted,
  nextFrame,
  overlayRecorder,
  overlayTokens,
  VIEW_1_1,
} from './canvasEngineTest-fixtures'

describe('the brush ring', () => {
  /** Rulers off on purpose: they are the other reason the overlay repaints on a bare move. */
  const BARE = { ...VIEW_1_1, rulers: false, guides: false, snap: false }

  async function ringsAfterMoving(tool: CanvasTool, size?: number): Promise<number[][]> {
    const { rings } = overlayRecorder()
    const harness = await mounted(DEFAULT_CANVAS, tool)
    harness.engine.setView(BARE)
    if (size !== undefined) harness.engine.setBrush({ ...DEFAULT_BRUSH, size })
    await nextFrame()

    rings.length = 0
    drag(harness.host, 120, 90)
    await nextFrame()
    return rings
  }

  it('rings the hand while the brush is armed', async () => {
    const rings = await ringsAfterMoving('brush', 40)

    expect(rings).toHaveLength(2)
    // Half the brush: the setting is a diameter, and the ring is the footprint of one dab.
    expect(rings[0]).toEqual([120, 90, 20])
  })

  it('rings the hand for the eraser too, which lays down the same disc', async () => {
    expect(await ringsAfterMoving('eraser', 40)).toHaveLength(2)
  })

  it('leaves the hand bare under a tool that lays down no disc', async () => {
    expect(await ringsAfterMoving('move')).toHaveLength(0)
    expect(await ringsAfterMoving('select')).toHaveLength(0)
    expect(await ringsAfterMoving('crop')).toHaveLength(0)
  })

  /**
   * The overlay used to repaint on an idle move only to echo the pointer on the rulers. With
   * them off, the ring would have been painted once and then stood still while the hand moved.
   */
  it('follows the hand with the rulers off', async () => {
    const { rings } = overlayRecorder()
    const harness = await mounted(DEFAULT_CANVAS, 'brush')
    harness.engine.setView(BARE)
    await nextFrame()

    drag(harness.host, 100, 100)
    await nextFrame()
    rings.length = 0
    drag(harness.host, 160, 140)
    await nextFrame()

    expect(rings[0]?.slice(0, 2)).toEqual([160, 140])
  })

  // Dragging the size slider must show the new footprint at once: waiting for the next twitch
  // of the mouse is what makes a slider feel disconnected from what it sets.
  it('resizes under a still hand when the setting changes', async () => {
    const { rings } = overlayRecorder()
    const harness = await mounted(DEFAULT_CANVAS, 'brush')
    harness.engine.setView(BARE)
    drag(harness.host, 100, 100)
    await nextFrame()

    rings.length = 0
    harness.engine.setBrush({ ...DEFAULT_BRUSH, size: 64 })
    await nextFrame()

    expect(rings[0]).toEqual([100, 100, 32])
  })

  it('drops the ring once the hand leaves the canvas', async () => {
    const { rings } = overlayRecorder()
    const harness = await mounted(DEFAULT_CANVAS, 'brush')
    harness.engine.setView(BARE)
    drag(harness.host, 100, 100)
    await nextFrame()

    rings.length = 0
    harness.host.dispatchEvent(new PointerEvent('pointerleave'))
    await nextFrame()

    expect(rings).toHaveLength(0)
  })
})

/**
 * The overlay reads its colours from the stylesheet and keeps a table of hexadecimals for the
 * one case where it cannot: a canvas that is not in a document yet. That table restates nine
 * tokens by hand, and nothing but this described what it was restating.
 *
 * The stakes are not that the fallback looks wrong. `token()` answers an empty string for a name
 * `index.css` no longer declares, and `readColors` falls back on exactly that answer — so a
 * renamed or removed token turns this table into the real source of the overlay's colours, on
 * every canvas, with the whole suite green. Two of these eleven tokens were repainted on 12 August
 * alone.
 *
 * Pinned against the DARK declarations only, and that is a decision rather than an oversight: a
 * canvas with no document has no theme to read either, and the table's own comment states the
 * greys it was chosen for.
 */
describe('the overlay colours the canvas falls back on', () => {
  /**
   * The `@theme` BLOCK, not the rest of the file from `@theme` onwards — and the difference is
   * the whole point, measured. Reading onwards, a token deleted from `@theme` is still found in
   * the light theme's own block further down, so removing `--color-marquee-light` from the
   * reference left this green while the dark theme no longer declared it. Three tokens are
   * exposed that way: the ones the light theme restates at the same value.
   */
  const darkTokens = (): Map<string, string> => {
    // Comments go from the WHOLE sheet before the block is cut out, and the order is the point:
    // cutting first leaves any comment that opens above `@theme {` and closes inside it, so a
    // commented-out declaration — or the commented-out block itself — reads as live and this
    // guard stays green while the fallback quietly becomes the real source of every colour.
    const live = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '')
    const start = live.indexOf('@theme {')
    expect(start, '`@theme {` is gone from index-foundation.css').toBeGreaterThan(-1)
    const block = live.slice(start, live.indexOf('\n}', start))

    const declared = new Map(
      [...block.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g)].map(([, name = '', value = '']) => [
        name,
        value.trim(),
      ]),
    )

    // A token composed from another is resolved here, since a canvas cannot paint `color-mix`:
    // the fallback has to restate it as the `rgba` the browser would have handed the painter.
    return new Map(
      [...declared].map(([name, value]) => {
        const mixed = /color-mix\(in srgb, var\((--color-[a-z-]+)\) (\d{1,2})%, transparent\)/.exec(
          value,
        )
        if (!mixed) return [name, value]

        const [red, green, blue] = [1, 3, 5].map(at =>
          parseInt((declared.get(mixed[1] ?? '') ?? '').substr(at, 2), 16),
        )

        return [name, `rgba(${red}, ${green}, ${blue}, ${Number(mixed[2]) / 100})`]
      }),
    )
  }

  it('names only tokens the stylesheet still declares', () => {
    const declared = darkTokens()
    const gone = Object.values(overlayTokens()).filter(name => !declared.has(name))

    expect(gone).toEqual([])
  })

  it('restates each of those tokens exactly', () => {
    const declared = darkTokens()

    expect({ ...fallbackColors() }).toEqual(
      Object.fromEntries(
        Object.entries(overlayTokens()).map(([part, name]) => [part, declared.get(name)]),
      ),
    )
  })
})
