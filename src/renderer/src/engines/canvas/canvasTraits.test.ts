import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CANVAS,
  IDENTITY,
  adjustmentLayer,
  groupLayer,
  pixelLayer,
  textLayer,
  type CanvasState,
  type Layer,
} from './canvasState'
import { traitsOfCanvas } from './canvasTraits'

const withLayers = (...layers: Layer[]): CanvasState => ({ ...DEFAULT_CANVAS, layers })

describe('what a picture document holds', () => {
  it('holds nothing to lose when it is the single layer a picture opened as', () => {
    // The case that must stay silent: opening a PNG, painting on it, saving it back.
    expect(traitsOfCanvas(DEFAULT_CANVAS)).toEqual([])
  })

  it('holds a stack as soon as a second layer is added', () => {
    expect(traitsOfCanvas(withLayers(pixelLayer('a', 'A'), pixelLayer('b', 'B')))).toContain(
      'layers',
    )
  })

  it('holds a group, and the layers a group nests', () => {
    const traits = traitsOfCanvas(withLayers(groupLayer('g', 'G', [pixelLayer('a', 'A')])))

    expect(traits).toContain('groups')
    expect(traits).toContain('layers')
  })

  it('reads a trait carried by a layer buried inside a group', () => {
    // `allLayers` walks the nesting; a scan of `state.layers` alone would miss this and report
    // no loss on a document that has one.
    const buried: Layer = { ...pixelLayer('a', 'A'), blend: 'multiply' }

    expect(traitsOfCanvas(withLayers(groupLayer('g', 'G', [buried])))).toContain('blendMode')
  })

  it('holds a mask only when the mask is switched on', () => {
    const off = { ...pixelLayer('a', 'A'), mask: { enabled: false, linked: true } }
    const on = { ...pixelLayer('b', 'B'), mask: { enabled: true, linked: true } }

    expect(traitsOfCanvas(withLayers(off))).not.toContain('layerMask')
    expect(traitsOfCanvas(withLayers(on))).toContain('layerMask')
  })

  it('holds an adjustment layer, and words kept as words', () => {
    expect(traitsOfCanvas(withLayers(adjustmentLayer('a', 'A', 'exposure')))).toContain(
      'adjustmentLayer',
    )
    expect(traitsOfCanvas(withLayers(textLayer('t', 'Hello', { x: 0, y: 0 })))).toContain(
      'liveText',
    )
  })

  it('holds a transform only past the offset an open format can carry', () => {
    // ORA carries an integer x/y offset, so a moved layer is not a loss; a rotated one is.
    const moved = { ...pixelLayer('a', 'A'), transform: { ...IDENTITY, x: 40, y: 12 } }
    const turned = { ...pixelLayer('b', 'B'), transform: { ...IDENTITY, rotation: 0.4 } }

    expect(traitsOfCanvas(withLayers(moved))).not.toContain('layerTransform')
    expect(traitsOfCanvas(withLayers(turned))).toContain('layerTransform')
  })

  it('holds a faded layer whether the fade is on the layer or on its fill', () => {
    expect(traitsOfCanvas(withLayers({ ...pixelLayer('a', 'A'), opacity: 0.5 }))).toContain(
      'layerOpacity',
    )
    expect(traitsOfCanvas(withLayers({ ...pixelLayer('b', 'B'), fillOpacity: 0.5 }))).toContain(
      'layerOpacity',
    )
  })

  it('holds clipping, padlocks and guides', () => {
    expect(traitsOfCanvas(withLayers({ ...pixelLayer('a', 'A'), clipped: true }))).toContain(
      'clipping',
    )
    expect(
      traitsOfCanvas(
        withLayers({
          ...pixelLayer('b', 'B'),
          locked: { pixels: true, position: false, alpha: false },
        }),
      ),
    ).toContain('layerLock')
    expect(
      traitsOfCanvas({ ...DEFAULT_CANVAS, guides: [{ id: 'g', axis: 'x', position: 10 }] }),
    ).toContain('guides')
  })

  it('lists each trait once, however many layers carry it', () => {
    const state = withLayers(
      { ...pixelLayer('a', 'A'), opacity: 0.5 },
      { ...pixelLayer('b', 'B'), opacity: 0.2 },
    )

    expect(traitsOfCanvas(state).filter(trait => trait === 'layerOpacity')).toEqual([
      'layerOpacity',
    ])
  })
  /**
   * The blind spot this closes, and it was a real loss: one layer holds no `layers`, so a stack
   * of one HIDDEN layer declared nothing at all and flattened to an empty picture in silence.
   */
  it('holds the visibility of a layer the stack hides', () => {
    const state = withLayers({ ...pixelLayer('a', 'A'), visible: false })

    expect(traitsOfCanvas(state)).toContain('layerVisibility')
  })
})
