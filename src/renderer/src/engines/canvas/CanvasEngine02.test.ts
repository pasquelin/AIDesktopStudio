import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { DEFAULT_BRUSH } from './brush'
import {
  DEFAULT_CANVAS,
  IDENTITY,
  pixelLayer,
  type CanvasState,
  type Transform,
} from './canvasState'
import type { CanvasTool } from './canvasTool'
import { PixelPatches } from './PixelPatches'

/**
 * jsdom has no WebGL context, so Pixi is doubled. What is tested here is what the engine
 * *decides* — which surfaces it builds, which gesture a click starts, what it publishes — never
 * what lands on the GPU, which only a real renderer could tell.
 *
 * It exists because the alternative was believed for a while: that this file could not be tested
 * at all. A guard added to `apply` then silently stopped a freshly opened document from ever
 * building a texture, and nothing caught it.
 */
import type { Placed } from './canvasEngineTest-fixtures'
import { canvasGpu, drag, mounted, press, release, stacked } from './canvasEngineTest-fixtures'

describe('layer masks', () => {
  const withMask = (mask?: { enabled: boolean; linked: boolean }): CanvasState =>
    stacked([{ ...pixelLayer('layer-1', 'Background'), mask }])

  // A mask per layer allocated ahead would double the GPU memory of every document.
  it('costs nothing at all on a layer that carries no mask', async () => {
    await mounted(withMask())

    expect(canvasGpu().texturesCreated).toBe(1)
  })

  it('gives a masked layer a texture and a sprite of its own', async () => {
    await mounted(withMask({ enabled: true, linked: true }))

    expect(canvasGpu().texturesCreated).toBe(2)
    expect(canvasGpu().sprites[0]?.mask).toBe(canvasGpu().sprites[1])
  })

  // Unticking the box hides a mask; it does not erase it. The pixels are the point of the toggle.
  it('takes a disabled mask off the sprite while keeping its pixels', async () => {
    const { engine } = await mounted(withMask({ enabled: true, linked: true }))

    engine.apply(withMask({ enabled: false, linked: true }))

    expect(canvasGpu().sprites[0]?.mask).toBeNull()
    expect(canvasGpu().texturesDestroyed).toBe(0)
  })

  // A mask is born revealing everything. Left cleared, ticking the box made the layer vanish
  // whole, and there was no way to bring it back but to flood the mask by hand.
  it('reveals the whole layer until something is painted into it', async () => {
    const { engine } = await mounted(withMask())
    canvasGpu().painted = []

    engine.apply(withMask({ enabled: true, linked: true }))

    // The second texture is the mask, and it is filled at birth like a new document's page.
    expect(canvasGpu().painted).toContain(1)
  })

  it('frees the mask texture when the mask itself leaves the state', async () => {
    const { engine } = await mounted(withMask({ enabled: true, linked: true }))

    engine.apply(withMask())

    expect(canvasGpu().texturesDestroyed).toBe(1)
  })

  /**
   * The texture is allocated on the mask's presence, so the placement has to encode presence too.
   * Keyed on `enabled` alone, removing a disabled mask left the string unchanged, the drop pass
   * never ran, and a later mask was handed the old one's pixels back.
   */
  it('frees it just the same when the mask it drops was disabled', async () => {
    const { engine } = await mounted(withMask({ enabled: false, linked: true }))
    expect(canvasGpu().texturesCreated).toBe(2)

    engine.apply(withMask())

    expect(canvasGpu().texturesDestroyed).toBe(1)
  })

  // Unlinked means the mask does not follow the layer: it stays where it was painted.
  it('leaves an unlinked mask behind when the layer moves', async () => {
    const moved = { ...IDENTITY, x: 40, y: 60 }
    await mounted({
      ...DEFAULT_CANVAS,
      layers: [
        {
          ...pixelLayer('layer-1', 'Background'),
          transform: moved,
          mask: { enabled: true, linked: false },
        },
      ],
      activeLayerId: 'layer-1',
    })

    expect(canvasGpu().sprites[0]?.position).toMatchObject({ x: 40 + 512, y: 60 + 512 })
    expect(canvasGpu().sprites[1]?.position).toMatchObject({ x: 512, y: 512 })
  })
})

/**
 * A layer's pixels are its own; the sprite that shows them carries the layer's transform. A dab
 * drawn where the cursor is therefore has to be mapped back, or it lands displaced by exactly
 * that transform — which is what made the brush miss after a crop, `resizeCanvas` shifting every
 * transform by the crop's offset.
 */
describe('painting a transformed layer', () => {
  /** The one node the engine puts a matrix on is the space a pass is drawn through. */
  const paintSpace = (): Placed | undefined =>
    canvasGpu().containers.find(container => container.matrix)

  const shifted = (transform: Partial<Transform>): CanvasState =>
    stacked([{ ...pixelLayer('layer-1', 'Background'), transform: { ...IDENTITY, ...transform } }])

  /**
   * A dab, closed. The release matters: `pointerup` is listened for on the window, so a gesture
   * left open outlives its test and is ended by the next one's release — which photographs its
   * tiles into the run that is measuring.
   */
  function dabAt(host: HTMLElement, x: number, y: number): void {
    press(host, x, y)
    release(x, y)
  }

  /** The box a stroke reports to the undo, in surface pixels. */
  const reachOf = (
    host: HTMLElement,
    at: { x: number; y: number } = { x: 200, y: 200 },
  ): { x: number; y: number; width: number; height: number } | undefined => {
    const touched = vi.spyOn(PixelPatches.prototype, 'touch')
    onTestFinished(() => touched.mockRestore())
    touched.mockClear()
    dabAt(host, at.x, at.y)
    return touched.mock.calls[0]?.[0]
  }

  /** The stamp is the one thing `paintSpace` carries into a surface. */
  const stamp = (): Placed | undefined => paintSpace()?.children[0]

  /**
   * The reach, not the disc. A soft brush lays pixels beyond its own radius — that fringe IS the
   * soft edge — and a stroke whose undo footprint was the radius alone would put back everything
   * except what the softness had just drawn.
   */
  it('reaches past the disc when the edge is soft, and stops at it when it is hard', async () => {
    const { host, engine } = await mounted(shifted({}))

    engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 1 })
    const hard = reachOf(host)

    engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 0 })
    const soft = reachOf(host)

    // 40 across, plus the pixel of slack `brushRect` already keeps for the antialiased rim.
    expect(hard).toMatchObject({ width: 42, height: 42 })
    // Ten pixels of spread, and the filter's padding is twice that on each side.
    expect(soft).toMatchObject({ width: 82, height: 82 })
    // The box grows on both sides, so its origin moves back by exactly what its width gained.
    expect((hard?.x ?? 0) - (soft?.x ?? 0)).toBe(20)
    expect((hard?.y ?? 0) - (soft?.y ?? 0)).toBe(20)
  })

  /**
   * The fringe is counted in surface pixels and the disc in document ones. Added before the
   * mapping, a layer scaled 2× recorded half the box its own stroke covered — and an undo left
   * the fringe on screen. The one state the other cases never reach, being pure translations.
   */
  it('reports the fringe in the surface’s pixels, not the document’s', async () => {
    const { host, engine } = await mounted(shifted({ scaleX: 2, scaleY: 2 }))
    engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 0 })

    const reach = reachOf(host)

    // The disc maps to 20 surface px across; the filter's padding is 20 surface px each side.
    expect(reach).toMatchObject({ width: 61, height: 61 })
  })

  /**
   * The pencil reads the same settings and spreads none of them: that is the whole difference.
   *
   * The eraser goes with it, and for Pixi's reason rather than a promise of the tool — see
   * `softness()`. Both rows are `BRUSH_SETTINGS_BY_TOOL`, which the bar reads to hide the
   * slider: this is the measurement that keeps the table honest about the one column the engine
   * asks it for.
   */
  it.each<CanvasTool>(['pencil', 'eraser'])(
    'reaches no further under the %s, whatever the hardness slider says',
    async tool => {
      const { host, engine } = await mounted(shifted({}))
      engine.setTool(tool)
      engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 0 })

      expect(reachOf(host)).toMatchObject({ width: 42 })
    },
  )

  /**
   * What the reach is computed from. Without this the filter could stop being hung at all and
   * every assertion above would still pass: they read `softness()`, never the filter it sets.
   */
  describe('the filter that softens the edge', () => {
    it('is hung, at the spread the brush asks for', async () => {
      const { host, engine } = await mounted(shifted({}))
      engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 0 })
      dabAt(host, 200, 200)

      expect(stamp()?.filters).toHaveLength(1)
      expect(stamp()?.filters[0]).toMatchObject({ strength: 10, padding: 20 })
    })

    it('is taken off for an edge that is already hard', async () => {
      const { host, engine } = await mounted(shifted({}))
      engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 0 })
      dabAt(host, 200, 200)
      engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 1 })

      expect(stamp()?.filters).toEqual([])
    })

    /**
     * Arming the pencil from the toolbar calls `setTool` alone — `setBrush` does not follow. The
     * filter left hanging would paint a feathered pencil while the undo box believed it hard.
     */
    it('is taken off by arming the pencil, with no setting touched', async () => {
      const { host, engine } = await mounted(shifted({}))
      engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 0 })
      dabAt(host, 200, 200)

      engine.setTool('pencil')

      expect(stamp()?.filters).toEqual([])
    })

    /**
     * A filtered container is drawn into a texture of its own and composed back with the
     * filter's blend mode, never the stamp's — so an `erase` stamp under a filter rubs out
     * against nothing. The eraser stays hard until that can be checked on a GPU.
     */
    it('is never hung under the eraser, whose blend would not survive it', async () => {
      const { host, engine } = await mounted(shifted({}))
      engine.setTool('eraser')
      engine.setBrush({ ...DEFAULT_BRUSH, size: 40, hardness: 0 })
      dabAt(host, 200, 200)

      expect(stamp()?.filters).toEqual([])
    })
  })

  it('draws straight into the pixels of an untouched layer', async () => {
    const { host } = await mounted(shifted({}))

    dabAt(host, 200, 200)

    const matrix = paintSpace()?.matrix
    expect(matrix).toBeDefined()
    // Signed zeroes come out of the inverse, and `toMatchObject` tells -0 from 0.
    expect(matrix?.a).toBeCloseTo(1, 10)
    expect(matrix?.d).toBeCloseTo(1, 10)
    expect(matrix?.tx).toBeCloseTo(0, 10)
    expect(matrix?.ty).toBeCloseTo(0, 10)
  })

  it('takes the move back out before it writes', async () => {
    const { host } = await mounted(shifted({ x: 50, y: 30 }))

    dabAt(host, 200, 200)

    // The stroke is aimed at document (200, 200); the layer's pixel under it is (150, 170).
    expect(paintSpace()?.matrix?.tx).toBeCloseTo(-50, 10)
    expect(paintSpace()?.matrix?.ty).toBeCloseTo(-30, 10)
  })

  it('takes a scale back out too, so a stroke keeps the width the bar shows', async () => {
    const { host } = await mounted(shifted({ scaleX: 2, scaleY: 2 }))

    dabAt(host, 200, 200)

    expect(paintSpace()?.matrix?.a).toBeCloseTo(0.5, 10)
    expect(paintSpace()?.matrix?.d).toBeCloseTo(0.5, 10)
  })

  it('declines the stroke on a layer crushed onto a line', async () => {
    // A singular map has no inverse, and painting through one writes NaN across the whole
    // texture — which no undo brings back. Nothing at all is the only safe answer.
    const { host, patches } = await mounted(shifted({ scaleX: 0 }))
    canvasGpu().painted = []

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(canvasGpu().painted).toEqual([])
    expect(patches).toEqual([])
  })

  it('keeps the stroke on the surface it started on', async () => {
    // The map is taken once, when the hand comes down. Re-deriving it per move would re-resolve
    // the armed layer, and a stroke would change surface mid-drag.
    const { engine, host } = await mounted(shifted({ x: 50, y: 30 }))

    press(host, 200, 200)
    engine.apply(shifted({ x: 400, y: 400 }))
    drag(host, 240, 240)
    release(240, 240)

    expect(paintSpace()?.matrix?.tx).toBeCloseTo(-50, 10)
    expect(paintSpace()?.matrix?.ty).toBeCloseTo(-30, 10)
  })

  it('paints an unlinked mask in its own space, where it was left', async () => {
    // Unlinked means the mask does not follow the layer, so the way back to its pixels is not
    // the layer's transform but the identity.
    const { engine, host } = await mounted(
      stacked([
        {
          ...pixelLayer('layer-1', 'Background'),
          transform: { ...IDENTITY, x: 50, y: 30 },
          mask: { enabled: true, linked: false },
        },
      ]),
    )
    engine.setPaintTarget('mask')

    dabAt(host, 200, 200)

    expect(paintSpace()?.matrix?.tx).toBeCloseTo(0, 10)
    expect(paintSpace()?.matrix?.ty).toBeCloseTo(0, 10)
  })
})

/**
 * Merging and flattening record that layers became one; the pixels are the engine's to compose,
 * and there is exactly one moment it can — before the command drops what they are made of.
 */
describe('composing a merge and a flatten', () => {
  const paintSpace = (): Placed | undefined =>
    canvasGpu().containers.find(container => container.matrix)

  const twoLayers = (transform: Partial<Transform> = {}): CanvasState =>
    stacked([
      pixelLayer('below', 'Below'),
      { ...pixelLayer('above', 'Above'), transform: { ...IDENTITY, ...transform } },
    ])

  /** The layers are built bottom first, so the lower one owns texture 0. */
  const BELOW = 0

  it('draws the upper layer into the lower one, which is the texture the merge keeps', async () => {
    const { engine } = await mounted(twoLayers())
    canvasGpu().painted = []

    engine.mergeInto('below', 'above')

    expect(canvasGpu().painted).toContain(BELOW)
  })

  it('carries the upper layer through the document and back into the lower one', async () => {
    const { engine } = await mounted(twoLayers({ x: 40, y: 25 }))

    engine.mergeInto('below', 'above')

    // The upper layer sits 40 by 25 further along; the lower one has not moved, so its pixels
    // must receive the picture at that same offset rather than at the origin.
    expect(paintSpace()?.matrix?.tx).toBeCloseTo(40, 10)
    expect(paintSpace()?.matrix?.ty).toBeCloseTo(25, 10)
  })

  it('composes nothing when either layer has no surface', async () => {
    const { engine } = await mounted(twoLayers())
    canvasGpu().painted = []

    engine.mergeInto('below', 'gone')

    expect(canvasGpu().painted).toEqual([])
  })

  it('hands the flattened picture to the layer that replaces the stack', async () => {
    const { engine } = await mounted(twoLayers())

    // Composed while the stack still exists, held for a layer that does not exist yet.
    engine.flattenInto('flat')
    const built = canvasGpu().texturesCreated
    canvasGpu().painted = []
    engine.apply(stacked([pixelLayer('flat', 'Background')]))

    // The new surface is built, then the held picture is poured into it: born empty, the
    // document would come out transparent, which is what kept Flatten off the menu.
    expect(canvasGpu().painted).toContain(built)
  })

  it('leaves a layer that was not flattened into alone', async () => {
    const { engine } = await mounted(twoLayers())

    engine.flattenInto('flat')
    const built = canvasGpu().texturesCreated
    canvasGpu().painted = []
    engine.apply(stacked([pixelLayer('other', 'Other')]))

    expect(canvasGpu().painted).not.toContain(built)
  })
})

/**
 * A texture used to be allocated once, at whatever size the document had when its layer was
 * born, and never grew. Five features were written against that and left unoffered for it: crop,
 * mirror, quarter turn, merge down and flatten.
 */
