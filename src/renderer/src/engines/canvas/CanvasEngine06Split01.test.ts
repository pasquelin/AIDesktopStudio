import { bridgeWatchingLogs } from '@/services/fakeBridge'
import type { FontRef } from '@shared/domain/font'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS, groupLayer, pixelLayer, textLayer, type CanvasState } from './canvasState'
import { ROTATE_REACH } from './handles'

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
  doubleClick,
  drag,
  flushMicrotasks,
  mounted,
  mountedWithoutFace,
  PARAGRAPH,
  press,
  release,
  stacked,
  VIEW_1_1,
} from './canvasEngineTest-fixtures'

describe('captions', () => {
  const caption = (text: string, size = 48): CanvasState =>
    stacked([
      pixelLayer('layer-1', 'Background'),
      { ...textLayer('t', text, { x: 10, y: 20 }, PARAGRAPH), size },
    ])

  const BARE_VIEW = { ...VIEW_1_1, rulers: false, guides: false, snap: false }

  const armedCaption = (): CanvasState => ({ ...caption('Bonjour'), activeLayerId: 't' })

  it('leaves a caption’s pixels alone while it turns the document', async () => {
    const { engine } = await mounted(caption('Bonjour'))
    canvasGpu().sprites.length = 0

    engine.turnQuarter(true)

    expect(canvasGpu().sprites.filter(sprite => sprite.rotation !== 0)).toHaveLength(1)
  })

  it('turns the pixels of a caption a group carries', async () => {
    const inside = groupLayer('g', 'Group', [textLayer('t', 'Bonjour', { x: 10, y: 20 })])
    const { engine } = await mounted(stacked([pixelLayer('layer-1', 'Background'), inside]))
    canvasGpu().sprites.length = 0

    engine.turnQuarter(true)

    expect(canvasGpu().sprites.filter(sprite => sprite.rotation !== 0)).toHaveLength(2)
  })

  it('opens a caption with no box at all where a click landed', async () => {
    const { engine, host, captions } = await mounted()
    engine.setTool('text')

    press(host, 300, 250)
    release()

    expect(captions).toEqual([{ at: { x: 300, y: 250 }, box: null }])
  })

  it('cuts a paragraph to its box, and leaves a point caption uncut', async () => {
    const { engine } = await mounted(caption('Bonjour'))
    expect(canvasGpu().masked).toBeGreaterThan(0)

    canvasGpu().masked = 0
    engine.apply(stacked([{ ...textLayer('t', 'Bonjour', { x: 10, y: 20 }), size: 60 }]))

    expect(canvasGpu().masked).toBe(0)
  })

  it('sizes the box from the drag when the hand really drew one', async () => {
    const { engine, host, captions } = await mounted()
    engine.setTool('text')

    press(host, 100, 100)
    drag(host, 300, 200)
    release()

    expect(captions).toEqual([{ at: { x: 100, y: 100 }, box: { width: 200, height: 100 } }])
  })

  it('edits the caption already under the hand rather than stacking another', async () => {
    const { engine, host, captions } = await mounted(caption('Bonjour'))
    engine.setTool('text')

    press(host, 20, 30)
    release()

    expect(captions).toEqual([{ layerId: 't' }])
  })

  it('rasterizes nothing while a field is typing the caption', async () => {
    const { engine } = await mounted(caption('Bonjour'))
    engine.setEditingText('t')
    canvasGpu().painted = []

    engine.apply(caption('Bonjour !'))

    expect(canvasGpu().painted).toEqual([])
  })

  it('draws it once when the field lets go, not once per letter', async () => {
    const { engine } = await mounted(caption('Bonjour'))
    engine.setEditingText('t')
    engine.apply(caption('Bonjour !'))
    canvasGpu().painted = []

    engine.setEditingText(null)

    expect(canvasGpu().painted).toHaveLength(1)
  })

  it('pulls the box by its grip instead of scaling the layer', async () => {
    const { engine, host, boxes, layers } = await mounted(armedCaption(), 'text')
    engine.setView(BARE_VIEW)

    // The south-east grip of the default box, which starts at the caption's own corner.
    press(host, 10 + PARAGRAPH.width, 20 + PARAGRAPH.height)
    drag(host, 200, 100)

    expect(boxes.at(-1)?.box).toEqual({ width: 190, height: 80 })
    // The layer's own transform is untouched: a pull on the box is not a pull on the picture.
    expect(layers.some(call => call.startsWith('transform:'))).toBe(false)
  })

  it('keeps the box in its own proportions while shift is held', async () => {
    const { engine, host, boxes } = await mounted(armedCaption(), 'text')
    engine.setView(BARE_VIEW)

    press(host, 10 + PARAGRAPH.width, 20 + PARAGRAPH.height)
    drag(host, 300, 400, true)

    const pulled = boxes.at(-1)?.box
    expect((pulled?.height ?? 0) / (pulled?.width ?? 1)).toBeCloseTo(
      PARAGRAPH.height / PARAGRAPH.width,
    )
  })

  it('moves the corner with a north-west grip, so the far edge holds still', async () => {
    const { engine, host, boxes } = await mounted(armedCaption(), 'text')
    engine.setView(BARE_VIEW)

    press(host, 10, 20)
    drag(host, 60, 70)

    expect(boxes.at(-1)?.at).toEqual({ x: 60, y: 70 })
    expect(boxes.at(-1)?.box).toEqual({
      width: PARAGRAPH.width - 50,
      height: PARAGRAPH.height - 50,
    })
  })

  it('reopens the armed caption on a double click with the move tool', async () => {
    const { engine, host, captions } = await mounted(armedCaption(), 'move')
    engine.setView(BARE_VIEW)

    doubleClick(host, 20, 40)

    expect(captions).toEqual([{ layerId: 't' }])
  })

  it('moves the caption on a single click rather than opening it', async () => {
    const { engine, host, captions, layers } = await mounted(armedCaption(), 'move')
    engine.setView(BARE_VIEW)

    press(host, 20, 40)
    drag(host, 60, 90)
    release(60, 90)

    // Where the caption ENDED UP: it started at (10, 20) and the hand moved by (40, 50).
    expect(layers).toContain('translate:t:50:70')
    expect(captions).toEqual([])
  })

  it('opens a caption whose position is padlocked', async () => {
    const armed = armedCaption()
    const { engine, host, captions } = await mounted(
      {
        ...armed,
        layers: armed.layers.map(layer =>
          layer.id === 't' ? { ...layer, locked: { ...layer.locked, position: true } } : layer,
        ),
      },
      'move',
    )
    engine.setView(BARE_VIEW)

    doubleClick(host, 20, 40)

    expect(captions).toEqual([{ layerId: 't' }])
  })

  it('leaves a double click alone while another tool is armed', async () => {
    const { engine, host, captions } = await mounted(armedCaption(), 'brush')
    engine.setView(BARE_VIEW)

    doubleClick(host, 20, 40)

    expect(captions).toEqual([])
  })

  it('closes the history entry the box pull opened', async () => {
    const { engine, host, layers } = await mounted(armedCaption(), 'text')
    engine.setView(BARE_VIEW)

    press(host, 10 + PARAGRAPH.width, 20 + PARAGRAPH.height)
    drag(host, 200, 100)
    release(200, 100)

    expect(layers.filter(call => call === 'begin' || call === 'end')).toEqual(['begin', 'end'])
  })

  it('turns the caption by the ring outside a corner', async () => {
    const { engine, host, layers } = await mounted(armedCaption(), 'text')
    engine.setView(BARE_VIEW)

    // Well outside the north-west corner, which is where the rotation zone reaches.
    press(host, 10 - ROTATE_REACH / 2, 20 - ROTATE_REACH / 2)
    drag(host, 200, 300)

    expect(layers.some(call => call.startsWith('transform:'))).toBe(true)
  })

  it('moves the caption under a held command key rather than editing it', async () => {
    const { engine, host, layers, captions } = await mounted(armedCaption(), 'text')
    engine.setView(BARE_VIEW)

    host.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 100, clientY: 60, metaKey: true }),
    )
    drag(host, 300, 260)

    expect(layers.some(call => call.startsWith('translate:'))).toBe(true)
    // And it is NOT read as a click on the caption, which would have opened the editor instead.
    expect(captions).toEqual([])
  })

  it('opens a fresh box beside a caption, not on it', async () => {
    const { engine, host, captions } = await mounted(caption('Bonjour'))
    engine.setTool('text')

    press(host, 800, 800)
    release()

    expect(captions[0]).toMatchObject({ at: { x: 800, y: 800 } })
  })

  it('asks the page for the face a caption is set in', async () => {
    const { engine, faces } = await mounted()

    engine.apply(caption('Hello'))
    await flushMicrotasks()

    expect(faces).toEqual(['Lato'])
  })

  it('asks for a face once, whatever is set in it', async () => {
    const { engine, faces } = await mounted()

    engine.apply(caption('Hello'))
    await flushMicrotasks()
    engine.apply(caption('Goodbye'))
    await flushMicrotasks()

    expect(faces).toEqual(['Lato'])
  })

  it('redraws every caption in a family when its face lands, not only the one that asked', async () => {
    // Surfaces are built in document order, and `layer-1` takes texture 0.
    const FIRST_CAPTION = 1
    const SECOND_CAPTION = 2
    let land = (): void => {}
    const onItsWay = new Promise<void>(resolve => {
      land = resolve
    })
    const { engine } = await mounted(DEFAULT_CANVAS, 'brush', () => onItsWay)

    engine.apply(
      stacked([
        pixelLayer('layer-1', 'Background'),
        textLayer('first', 'Hello', { x: 10, y: 20 }),
        textLayer('second', 'Goodbye', { x: 10, y: 60 }),
      ]),
    )
    await flushMicrotasks()
    // Both are on screen in the generic by now; what follows is the file arriving.
    canvasGpu().painted = []

    land()
    await flushMicrotasks()

    expect(canvasGpu().painted).toEqual([FIRST_CAPTION, SECOND_CAPTION])
  })

  it('redraws and asks for the face when only the font changed', async () => {
    const { engine, faces } = await mounted()
    engine.apply(caption('Hello'))
    await flushMicrotasks()
    canvasGpu().painted = []

    const mono: FontRef = { source: 'embedded', family: 'IBM Plex Mono' }
    const refaced = stacked([
      pixelLayer('layer-1', 'Background'),
      { ...textLayer('t', 'Hello', { x: 10, y: 20 }), font: mono },
    ])
    engine.apply(refaced)
    await flushMicrotasks()

    expect(canvasGpu().painted).toContain(1)
    expect(faces).toEqual(['Lato', 'IBM Plex Mono'])
  })

  it('says a face it could not put in the page, once, and draws in the generic', async () => {
    const logs = bridgeWatchingLogs()
    const { engine } = await mountedWithoutFace()

    engine.apply(caption('Hello'))
    await flushMicrotasks()
    engine.apply(caption('Goodbye'))
    await flushMicrotasks()

    expect(logs.entries().filter(entry => entry.scope === 'font.face')).toHaveLength(1)
  })

  it('leaves a caption alone when it was refaced while its file was on its way', async () => {
    const { engine, faces } = await mounted()

    engine.apply(caption('Hello'))
    engine.apply(stacked([pixelLayer('layer-1', 'Background')]))
    await flushMicrotasks()

    expect(faces).toEqual(['Lato'])
  })

  it('asks the page for nothing when the face is one the machine has', async () => {
    const { engine, faces } = await mounted()
    const font: FontRef = { source: 'system', family: 'Futura' }
    const installed = stacked([{ ...textLayer('t', 'Hello', { x: 10, y: 20 }), font }])

    engine.apply(installed)
    await flushMicrotasks()

    expect(faces).toEqual([])
  })

  it('rasterizes the words into the layer that holds them', async () => {
    const { engine } = await mounted()
    canvasGpu().painted = []

    engine.apply(caption('Hello'))

    expect(canvasGpu().painted).toContain(1)
  })

  it('redraws only when the words or their setting change', async () => {
    const { engine } = await mounted(caption('Hello'))
    canvasGpu().painted = []

    engine.apply(caption('Hello'))
    expect(canvasGpu().painted).toEqual([])

    engine.apply(caption('Goodbye'))
    expect(canvasGpu().painted).toContain(1)
  })

  it('takes no brush stroke, which the next letter typed would erase', async () => {
    const { host, patches } = await mounted(stacked([textLayer('t', 'Hello', { x: 10, y: 20 })]))

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(patches).toEqual([])
  })

  it('takes one into its mask, which nothing ever redraws', async () => {
    const masked = stacked([
      { ...textLayer('t', 'Hello', { x: 10, y: 20 }), mask: { enabled: true, linked: true } },
    ])
    const { engine, host, patches } = await mounted(masked)
    engine.setPaintTarget('mask')

    press(host, 200, 200)
    drag(host, 240, 240)
    release()

    expect(patches).toHaveLength(1)
  })

  it('draws the words again when the layer comes back', async () => {
    const { engine } = await mounted(caption('Hello'))
    engine.apply(stacked([pixelLayer('layer-1', 'Background')]))
    canvasGpu().painted = []

    engine.apply(caption('Hello'))

    expect(canvasGpu().painted.length).toBeGreaterThan(0)
  })
})
