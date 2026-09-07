import { BLEND_MODES } from '@shared/domain/canvasBlend'
import { describe, expect, it } from 'vitest'
import { layerFixture } from './canvas-fixtures'
import {
  DEFAULT_CANVAS,
  groupLayer,
  IDENTITY,
  pixelLayer,
  type CanvasState,
  type Layer,
} from './canvasState'

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
  BLEND_BY_MODE,
  canvasGpu,
  groupContainer,
  mounted,
  mutationsCounted,
  stacked,
} from './canvasEngineTest-fixtures'

describe('the blend table', () => {
  // A mode missing from the table falls back to 'normal' silently: the layer composites wrongly
  // and nothing says so. Eleven of the sixteen did exactly that until the extension was imported.
  it('names each Pixi mode after the mode it stands for', () => {
    for (const mode of BLEND_MODES) {
      if (mode === 'hue') continue
      expect(BLEND_BY_MODE[mode]).toBe(mode)
    }
  })

  // Pixi 8.19 dropped 'hue' from its own union and ships no filter for it. The fallback is
  // deliberate, and written down so it is not read as an oversight.
  it('falls back to normal for the one mode Pixi no longer carries', () => {
    expect(BLEND_BY_MODE.hue).toBe('normal')
  })

  // The advanced modes read the back buffer. Without it WebGL warns once and composites normally.
  it('asks the renderer for the back buffer the advanced modes read from', async () => {
    await mounted()

    expect(canvasGpu().init.useBackBuffer).toBe(true)
  })
})

describe('mounting', () => {
  // The regression this file was written for: React pushes the state before `init` resolves, so
  // the replay inside `mount` is the only thing that ever builds the first document's surfaces.
  it('builds a surface for a state pushed before the renderer existed', async () => {
    await mounted()

    expect(canvasGpu().texturesCreated).toBe(1)
  })

  /**
   * Pixi honours `resizeTo` through a `window.resize` listener and nothing else. Every surface of
   * the studio lives in a Dockview panel, and a dragged splitter resizes the panel without
   * resizing the window — so the drawing buffer stayed at its mounted size while the overlay,
   * which observes the host, followed it. The handles then sat beside the layer they belong to.
   *
   * Read through `measure`, which is the one path both the observer and the mount take.
   */
  it('hands the renderer the host box whenever it measures one', async () => {
    await mounted()

    expect(canvasGpu().resizes).toBeGreaterThan(0)
  })

  /**
   * `attach` is now the only thing that hangs a sprite in the world, and it only runs when the
   * placement changes. A signature kept across `dispose` made the replay find it unchanged, so a
   * remount onto the same engine rebuilt every texture and hung none of them.
   */
  it('hangs the document again after a dispose and a second mount', async () => {
    const { engine } = await mounted()
    engine.dispose()

    const second = document.createElement('div')
    document.body.appendChild(second)
    await engine.mount(second)

    expect(canvasGpu().sprites.at(-1)?.parent).not.toBeNull()
  })

  it('builds one per paintable layer, groups excluded', async () => {
    await mounted({
      ...DEFAULT_CANVAS,
      layers: [pixelLayer('a', 'A'), pixelLayer('b', 'B')],
      activeLayerId: 'a',
    })

    expect(canvasGpu().texturesCreated).toBe(2)
  })

  /**
   * Held rather than destroyed: merging, flattening and removing are all undoable, and the tree
   * an undo restores says nothing about pixels. Destroyed here, the layer came back holding its
   * fill and nothing that had been painted on it.
   */
  it('keeps the texture of a layer that left the stack, against the undo', async () => {
    const { engine } = await mounted({
      ...DEFAULT_CANVAS,
      layers: [pixelLayer('a', 'A'), pixelLayer('b', 'B')],
      activeLayerId: 'a',
    })

    engine.apply({ ...DEFAULT_CANVAS, layers: [pixelLayer('a', 'A')], activeLayerId: 'a' })

    expect(canvasGpu().texturesDestroyed).toBe(0)
  })

  it('gives that very texture back when the layer returns, without building another', async () => {
    const two = {
      ...DEFAULT_CANVAS,
      layers: [pixelLayer('a', 'A'), pixelLayer('b', 'B')],
      activeLayerId: 'a',
    }
    const { engine } = await mounted(two)

    engine.apply({ ...DEFAULT_CANVAS, layers: [pixelLayer('a', 'A')], activeLayerId: 'a' })
    const built = canvasGpu().texturesCreated
    engine.apply(two)

    expect(canvasGpu().texturesCreated).toBe(built)
  })

  it('frees what it was holding when the engine goes', async () => {
    const { engine } = await mounted({
      ...DEFAULT_CANVAS,
      layers: [pixelLayer('a', 'A'), pixelLayer('b', 'B')],
      activeLayerId: 'a',
    })
    engine.apply({ ...DEFAULT_CANVAS, layers: [pixelLayer('a', 'A')], activeLayerId: 'a' })

    engine.dispose()

    expect(canvasGpu().texturesDestroyed).toBe(2)
  })

  /**
   * Dragging a layer rewrites `state.layers` sixty times a second without restacking it, and
   * rebuilding the tree for it would detach and reattach every sprite of the document per frame.
   */
  it('does not restack for a state whose layers are the same ones in the same order', async () => {
    const stack = [pixelLayer('a', 'A'), pixelLayer('b', 'B')]
    const { engine } = await mounted({ ...DEFAULT_CANVAS, layers: stack, activeLayerId: 'a' })
    const world = mutationsCounted()

    engine.apply({
      ...DEFAULT_CANVAS,
      layers: stack.map(layer => ({ ...layer, transform: { ...layer.transform, x: 20 } })),
      activeLayerId: 'a',
    })

    expect(world()).toBe(0)
  })

  it('restacks when the order actually changes', async () => {
    const stack = [pixelLayer('a', 'A'), pixelLayer('b', 'B')]
    const { engine } = await mounted({ ...DEFAULT_CANVAS, layers: stack, activeLayerId: 'a' })
    const world = mutationsCounted()

    engine.apply({ ...DEFAULT_CANVAS, layers: [...stack].reverse(), activeLayerId: 'a' })

    // Two detached and two reattached. The bound is the point: the pass this replaced was
    // quadratic in the surfaces, and a fifty-layer document felt it.
    expect(world()).toBe(4)
  })

  // A guide drag rewrites the state on every pointer move and touches no pixel.
  it('does not walk the stack again for a state whose layers are the same', async () => {
    const { engine } = await mounted()
    const renders = canvasGpu().renders

    engine.apply({ ...DEFAULT_CANVAS, guides: [{ id: 'g', axis: 'x', position: 10 }] })

    expect(canvasGpu().texturesCreated).toBe(1)
    expect(canvasGpu().renders).toBe(renders)
  })

  // Putting the document on a grid changes no layer, and the guard above would have skipped the
  // pass that switches every surface to nearest sampling: green, and inert.
  it('switches every surface to nearest sampling on a pixel grid, and back off it', async () => {
    const { engine } = await mounted()
    const sampling = (): string[] => canvasGpu().textures.map(texture => texture.source.scaleMode)

    engine.apply({ ...DEFAULT_CANVAS, pixelCell: 1 })
    expect(sampling()).toEqual(['nearest'])

    engine.apply(DEFAULT_CANVAS)
    expect(sampling()).toEqual(['linear'])
    expect(canvasGpu().textures[0]?.source.style.updates).toBe(2)
  })
})

describe('groups', () => {
  const grouped = (children: Layer[]): CanvasState => stacked([groupLayer('g', 'G', children)])

  it('builds a container of its own and nests the surfaces inside it', async () => {
    await mounted(grouped([pixelLayer('a', 'A'), pixelLayer('b', 'B')]))

    expect(groupContainer('g')?.children).toHaveLength(2)
  })

  // A group has no pixels of its own: allocating it a texture would be a document-sized waste.
  it('costs no texture', async () => {
    await mounted(grouped([pixelLayer('a', 'A')]))

    expect(canvasGpu().texturesCreated).toBe(1)
  })

  /**
   * The known regression: a surface judged missing here is a texture destroyed on the GPU, and
   * grouping two painted layers used to lose their pixels outright.
   */
  it('keeps both textures when two layers are gathered into one', async () => {
    const stack = [pixelLayer('a', 'A'), pixelLayer('b', 'B')]
    const { engine } = await mounted({ ...DEFAULT_CANVAS, layers: stack, activeLayerId: 'a' })

    engine.apply(grouped(stack))

    expect(canvasGpu().texturesDestroyed).toBe(0)
    expect(canvasGpu().texturesCreated).toBe(2)
  })

  // A group at 50% used to leave its children at 100%: the whole point of a group is that it
  // composites its subtree, not that it passes the stack through.
  it('carries its own visibility, opacity and blend mode', async () => {
    const group: Layer = {
      ...groupLayer('g', 'G', [pixelLayer('a', 'A')]),
      opacity: 0.5,
      visible: false,
      blend: 'multiply',
    }
    await mounted({ ...DEFAULT_CANVAS, layers: [group], activeLayerId: 'a' })

    expect(groupContainer('g')).toMatchObject({ alpha: 0.5, visible: false, blendMode: 'multiply' })
  })

  // Isolation is an offscreen pass, and a neutral filter is how v8 asks for one.
  it('isolates only the group that asks for it', async () => {
    const passing = groupLayer('g', 'G', [pixelLayer('a', 'A')])
    const { engine } = await mounted(stacked([passing]))
    expect(groupContainer('g')?.filters).toEqual([])

    engine.apply(stacked([{ ...passing, isolation: 'isolate' }]))
    expect(groupContainer('g')?.filters).toHaveLength(1)
  })

  /**
   * A container's `blendMode` is only inherited, and every child overwrites it with its own; its
   * `alpha` multiplies per child, so two overlapping layers showed through each other. Both only
   * mean what they say once the subtree is composited offscreen.
   */
  it('composites offscreen as soon as its blend or its opacity would show', async () => {
    const plain = groupLayer('g', 'G', [pixelLayer('a', 'A')])
    const { engine } = await mounted(stacked([plain]))
    expect(groupContainer('g')?.filters).toEqual([])

    engine.apply(stacked([{ ...plain, blend: 'multiply' }]))
    expect(groupContainer('g')?.filters).toHaveLength(1)

    engine.apply(stacked([{ ...plain, opacity: 0.5 }]))
    expect(groupContainer('g')?.filters).toHaveLength(1)

    engine.apply(stacked([plain]))
    expect(groupContainer('g')?.filters).toEqual([])
  })

  it('drops the container of a group that left the stack', async () => {
    const { engine } = await mounted(grouped([pixelLayer('a', 'A')]))

    engine.apply({ ...DEFAULT_CANVAS, layers: [pixelLayer('a', 'A')], activeLayerId: 'a' })

    expect(groupContainer('g')?.children).toHaveLength(0)
  })
})

describe('clipping', () => {
  const clipped = (id: string): Layer => ({ ...layerFixture({ id, name: id }), clipped: true })

  /**
   * An object cannot be both the picture and the stencil, so each clipped layer gets a proxy of
   * its own onto the base's texture. Three clipped on one base means three proxies, all visible.
   */
  it('gives every clipped layer of a run its own stencil onto the same base', async () => {
    await mounted(stacked([pixelLayer('base', 'Base'), clipped('a'), clipped('b'), clipped('c')]))

    // Four layers, then three proxies: seven sprites, four textures.
    expect(canvasGpu().sprites).toHaveLength(7)
    expect(canvasGpu().texturesCreated).toBe(4)

    const proxies = canvasGpu().sprites.slice(4)
    for (const proxy of proxies) expect(proxy.parent?.mask).toBe(proxy)
    expect(new Set(proxies).size).toBe(3)
  })

  /**
   * Pixi reads the red channel of a sprite mask by default, which its own docs point out. What
   * cuts a clipped layer out is where the base has pixels, not how red they are: a base painted
   * pure blue cut out nothing at all.
   */
  it('cuts on the coverage of the base, not on how red it is', async () => {
    await mounted(stacked([pixelLayer('base', 'Base'), clipped('a')]))

    const proxy = canvasGpu().sprites.at(-1)
    expect(proxy?.parent?.maskChannel).toBe('alpha')
  })

  it('leaves an unclipped stack without a single stencil', async () => {
    await mounted(stacked([pixelLayer('a', 'A'), pixelLayer('b', 'B')]))

    expect(canvasGpu().sprites).toHaveLength(2)
  })

  // A clipped layer with nothing under it is not clipped at all: hiding it would lose its pixels.
  it('builds no stencil for a clipped layer with no base under it', async () => {
    await mounted(stacked([clipped('a'), pixelLayer('b', 'B')]))

    expect(canvasGpu().sprites).toHaveLength(2)
  })

  it('drops the stencil once the layer stops being clipped', async () => {
    const stack = [pixelLayer('base', 'Base'), clipped('a')]
    const { engine } = await mounted(stacked(stack))
    expect(canvasGpu().sprites).toHaveLength(3)

    engine.apply(stacked([pixelLayer('base', 'Base'), pixelLayer('a', 'a')]))

    expect(canvasGpu().sprites.at(-1)?.parent).toBeNull()
  })

  // A stencil is only as strong as the base it stands for: hiding the base used to leave the
  // layers clipped to it floating at full strength over nothing.
  it('takes the visibility and the opacity of the base along with its place', async () => {
    const base = { ...pixelLayer('base', 'Base'), visible: false, opacity: 0.4 }
    await mounted(stacked([base, clipped('a')]))

    const proxy = canvasGpu().sprites.at(-1)
    expect(proxy).toMatchObject({ visible: false, alpha: 0.4 })
  })

  // A stencil a frame behind the layer it cuts would show a seam down the side of it.
  it('moves the stencil with the base it stands for', async () => {
    const base = pixelLayer('base', 'Base')
    const stack = [base, clipped('a')]
    const { engine } = await mounted(stacked(stack))

    engine.apply(
      stacked([{ ...base, transform: { ...IDENTITY, x: 30, y: 70 } }, clipped('a'), clipped('b')]),
    )

    const proxy = canvasGpu().sprites.find(sprite => sprite.parent?.mask === sprite)
    expect(proxy?.position).toMatchObject({ x: 30 + 512, y: 70 + 512 })
  })

  // A clipped layer that also carries a mask needs two, and an object holds one.
  it('lets a clipped layer keep a mask of its own', async () => {
    const masked: Layer = {
      ...pixelLayer('a', 'A'),
      clipped: true,
      mask: { enabled: true, linked: true },
    }
    await mounted(stacked([pixelLayer('base', 'Base'), masked]))

    const sprite = canvasGpu().sprites[1]
    expect(sprite?.mask).not.toBeNull()
    expect(sprite?.parent?.mask).not.toBe(sprite?.mask)
  })
})

describe('fill opacity', () => {
  // No layer effect exists yet, so for now the two simply multiply. The distinction is written
  // down in the engine so it is not lost the day effects arrive.
  it('fades the pixels alongside the layer opacity', async () => {
    const layer: Layer = { ...pixelLayer('layer-1', 'Background'), opacity: 0.5, fillOpacity: 0.5 }
    await mounted({ ...DEFAULT_CANVAS, layers: [layer], activeLayerId: 'layer-1' })

    expect(canvasGpu().sprites[0]?.alpha).toBe(0.25)
  })
})
