import { describe, expect, it } from 'vitest'
import { layerFixture } from './canvas-fixtures'
import { NEUTRAL_ADJUSTMENTS } from '@shared/domain/adjustments'
import {
  allLayers,
  clampOpacity,
  DEFAULT_CANVAS,
  DEFAULT_TEXT_SIZE,
  IDENTITY,
  layerBelow,
  layerById,
  mapLayers,
  serializeCanvas,
  textLayer,
  type CanvasState,
} from './canvasState'
import { deserializeCanvas } from './canvasStatePersistence'

const populated: CanvasState = {
  ...DEFAULT_CANVAS,
  width: 800,
  height: 600,
  layers: [
    layerFixture({
      id: 'a',
      name: 'Background',
      locked: { pixels: true, position: true, alpha: true },
    }),
    layerFixture({ id: 'b', visible: false, opacity: 0.5, blend: 'multiply' }),
  ],
  activeLayerId: 'b',
}

describe('canvas state', () => {
  it('opens with one layer, already active', () => {
    expect(DEFAULT_CANVAS.layers).toHaveLength(1)
    expect(DEFAULT_CANVAS.activeLayerId).toBe(DEFAULT_CANVAS.layers[0]?.id)
  })

  it('finds a layer by id', () => {
    expect(layerById(populated, 'b')?.name).toBe('Paint')
  })

  it('returns null for an unknown id', () => {
    expect(layerById(populated, 'nope')).toBeNull()
  })

  it('survives a serialize/deserialize round trip unchanged', () => {
    expect(deserializeCanvas(serializeCanvas(populated))).toEqual(populated)
  })

  it('falls back to a fresh document rather than throwing on unreadable input', () => {
    expect(deserializeCanvas('{ not json')).toEqual(DEFAULT_CANVAS)
  })

  it('falls back when the stored document has no layer at all', () => {
    // A canvas with an empty stack has nothing to paint on, which is worse than a fresh one.
    expect(deserializeCanvas(JSON.stringify({ width: 10, height: 10, layers: [] }))).toEqual(
      DEFAULT_CANVAS,
    )
  })

  it('picks a layer to be active when the stored one is missing', () => {
    const raw = JSON.stringify({ ...populated, activeLayerId: undefined })
    expect(deserializeCanvas(raw).activeLayerId).toBe('a')
  })
})

describe('clampOpacity', () => {
  it('keeps a value in range untouched', () => {
    expect(clampOpacity(0.4)).toBe(0.4)
  })

  it('bounds both ends', () => {
    expect(clampOpacity(-2)).toBe(0)
    expect(clampOpacity(3)).toBe(1)
  })

  it('treats an unreadable value as fully opaque', () => {
    expect(clampOpacity(Number.NaN)).toBe(1)
  })
})

/**
 * A document written before groups, granular locks and transforms existed must still open —
 * silently, with the same pixels, not as an error dialog.
 */
describe('reading back an older document', () => {
  const legacy = JSON.stringify({
    width: 640,
    height: 480,
    layers: [
      { id: 'a', name: 'Background', visible: true, locked: true, opacity: 1, blend: 'normal' },
      { id: 'b', name: 'Paint', visible: true, locked: false, opacity: 0.5, blend: 'multiply' },
    ],
    activeLayerId: 'b',
  })

  it('keeps the stack and what was armed', () => {
    const state = deserializeCanvas(legacy)

    expect(state.layers.map(layer => layer.id)).toEqual(['a', 'b'])
    expect(state.activeLayerId).toBe('b')
    expect([state.width, state.height]).toEqual([640, 480])
  })

  // A file GIMP wrote carries no grid, and neither did this build before the pixel art mode.
  it('reads a document that says nothing about a grid as being on none', () => {
    const onAGrid = JSON.stringify({ ...DEFAULT_CANVAS, pixelCell: 16 })
    const nonsense = JSON.stringify({ ...DEFAULT_CANVAS, pixelCell: 'sixteen' })

    expect(deserializeCanvas(legacy).pixelCell).toBeNull()
    expect(deserializeCanvas(onAGrid).pixelCell).toBe(16)
    expect(deserializeCanvas(nonsense).pixelCell).toBeNull()
  })

  it('reads every layer as a pixel layer, which is all there was', () => {
    expect(deserializeCanvas(legacy).layers.every(layer => layer.kind === 'pixel')).toBe(true)
  })

  // One boolean was the whole padlock: it meant nothing about the layer moved.
  it('spreads the old single lock across the three padlocks', () => {
    const state = deserializeCanvas(legacy)

    expect(layerById(state, 'a')?.locked).toEqual({ pixels: true, position: true, alpha: true })
    expect(layerById(state, 'b')?.locked).toEqual({ pixels: false, position: false, alpha: false })
  })

  it('fills in what the old format had no field for', () => {
    const layer = layerById(deserializeCanvas(legacy), 'b')

    expect(layer?.fillOpacity).toBe(1)
    expect(layer?.transform).toEqual(IDENTITY)
    expect(layer?.clipped).toBe(false)
  })

  it('keeps a blend mode it still knows, and drops one it does not', () => {
    expect(layerById(deserializeCanvas(legacy), 'b')?.blend).toBe('multiply')

    const odd = JSON.stringify({ layers: [{ id: 'a', blend: 'plaid' }] })
    expect(layerById(deserializeCanvas(odd), 'a')?.blend).toBe('normal')
  })
})

describe('reading back a document with groups', () => {
  const nested = JSON.stringify({
    layers: [
      {
        id: 'g',
        kind: 'group',
        children: [{ id: 'a', kind: 'pixel' }],
        collapsed: true,
        isolation: 'isolate',
      },
    ],
    activeLayerId: 'a',
  })

  it('finds a layer nested inside a group', () => {
    expect(layerById(deserializeCanvas(nested), 'a')?.id).toBe('a')
  })

  it('lists the group and its children, bottom first', () => {
    expect(allLayers(deserializeCanvas(nested).layers).map(layer => layer.id)).toEqual(['g', 'a'])
  })

  it('keeps a nested layer armed rather than resetting to the top level', () => {
    expect(deserializeCanvas(nested).activeLayerId).toBe('a')
  })

  // An id naming no layer leaves the document unpaintable, with no way back to a usable state.
  it('arms the first layer when the stored id names none', () => {
    const orphan = JSON.stringify({ layers: [{ id: 'a' }], activeLayerId: 'gone' })

    expect(deserializeCanvas(orphan).activeLayerId).toBe('a')
  })
})

describe('mapLayers', () => {
  const tree = deserializeCanvas(
    JSON.stringify({ layers: [{ id: 'g', kind: 'group', children: [{ id: 'a' }] }, { id: 'b' }] }),
  )

  it('reaches a layer nested in a group', () => {
    const renamed = mapLayers(tree.layers, layer =>
      layer.id === 'a' ? { ...layer, name: 'Renamed' } : layer,
    )

    expect(layerById({ ...tree, layers: renamed }, 'a')?.name).toBe('Renamed')
  })

  it('removes a nested layer without touching the group around it', () => {
    const pruned = mapLayers(tree.layers, layer => (layer.id === 'a' ? null : layer))

    expect(allLayers(pruned).map(layer => layer.id)).toEqual(['g', 'b'])
  })
})

describe('layerBelow', () => {
  const tree = deserializeCanvas(
    JSON.stringify({
      layers: [{ id: 'a' }, { id: 'g', kind: 'group', children: [{ id: 'x' }, { id: 'y' }] }],
    }),
  )

  it('finds the neighbour under a root layer', () => {
    expect(layerBelow(tree.layers, 'g')?.id).toBe('a')
  })

  it('stays inside the group, never through its wall', () => {
    // `mergeDown` merges within a level. Reaching out of the group would merge a child into
    // whatever happens to sit under the group itself.
    expect(layerBelow(tree.layers, 'y')?.id).toBe('x')
    expect(layerBelow(tree.layers, 'x')).toBeNull()
  })

  it('finds nothing at the bottom of a level, or for an id nobody carries', () => {
    expect(layerBelow(tree.layers, 'a')).toBeNull()
    expect(layerBelow(tree.layers, 'nope')).toBeNull()
  })
})

describe('reading back the kinds this build added', () => {
  const read = (layers: unknown[]) =>
    deserializeCanvas(JSON.stringify({ ...DEFAULT_CANVAS, layers, activeLayerId: 'a' }))

  /**
   * The four kinds a document may have been saved with before the grading pass existed. Each
   * lands on the dial that does its job, so an older file opens showing something rather than an
   * empty row.
   */
  it('lands a retired adjustment kind on the dial that does its job', () => {
    const retired = ['levels', 'curves', 'hsl', 'colorBalance']
    const layers = retired.map((adjustment, at) => ({
      id: `a${at}`,
      kind: 'adjustment',
      adjustment,
    }))

    const kinds = read(layers).layers.map(layer => layer.kind === 'adjustment' && layer.adjustment)
    expect(kinds).toEqual(['exposure', 'contrast', 'saturation', 'temperature'])
  })

  it('falls back to exposure for a kind no build ever wrote', () => {
    const [layer] = read([{ id: 'a', kind: 'adjustment', adjustment: 'nonsense' }]).layers

    expect(layer?.kind === 'adjustment' && layer.adjustment).toBe('exposure')
  })

  it('opens an adjustment saved before it carried values at neutral', () => {
    const [layer] = read([{ id: 'a', kind: 'adjustment', adjustment: 'exposure' }]).layers

    expect(layer?.kind === 'adjustment' && layer.values).toEqual(NEUTRAL_ADJUSTMENTS)
  })

  it('keeps the values a graded layer was saved with, and neutralises what is missing', () => {
    const [layer] = read([
      {
        id: 'a',
        kind: 'adjustment',
        adjustment: 'exposure',
        values: { exposure: 1.5, contrast: 'x' },
      },
    ]).layers

    expect(layer?.kind === 'adjustment' && layer.values).toMatchObject({
      exposure: 1.5,
      contrast: 1,
    })
  })

  it('reads a caption back with its words, its size and its colour', () => {
    const [layer] = read([{ id: 'a', kind: 'text', text: 'Hello', size: 72, color: 255 }]).layers

    expect(layer).toMatchObject({ kind: 'text', text: 'Hello', size: 72, color: 255 })
  })

  it('opens a caption whose fields were lost rather than dropping the layer', () => {
    const [layer] = read([{ id: 'a', kind: 'text' }]).layers

    expect(layer).toMatchObject({ kind: 'text', text: '', size: DEFAULT_TEXT_SIZE, color: 0 })
  })

  // The same reference a 3D text stores, read the same way — see `domain/font`.
  it('reads the face a caption was set in, and keeps a system one as written', () => {
    const written = { id: 'a', kind: 'text', font: { source: 'system', family: 'Futura' } }

    const [layer] = read([written]).layers

    expect(layer).toMatchObject({ font: { source: 'system', family: 'Futura' } })
  })

  it.each([
    ['a document written before captions had a face', undefined],
    ['a family the studio no longer ships', { source: 'embedded', family: 'Helvetiker' }],
  ])('sets a caption in a shipped face for %s', (_case, font) => {
    const [layer] = read([{ id: 'a', kind: 'text', font }]).layers

    expect(layer).toMatchObject({ font: { source: 'embedded', family: 'Lato' } })
  })

  // Its presence is what owns a texture; `enabled` only says whether it hides anything.
  it('reads a mask back, defaulting both of its flags to on', () => {
    const [layer] = read([{ id: 'a', mask: {} }]).layers

    expect(layer?.mask).toEqual({ enabled: true, linked: true })
  })

  it('keeps a mask that was saved switched off', () => {
    const [layer] = read([{ id: 'a', mask: { enabled: false, linked: false } }]).layers

    expect(layer?.mask).toEqual({ enabled: false, linked: false })
  })

  it('carries the asset a layer was born holding', () => {
    const [layer] = read([{ id: 'a', kind: 'pixel', source: 'asset-7' }]).layers

    expect(layer).toMatchObject({ kind: 'pixel', source: 'asset-7' })
  })

  it('drops a source that is not an id', () => {
    const [layer] = read([{ id: 'a', kind: 'pixel', source: 42 }]).layers

    expect(layer?.kind === 'pixel' && layer.source).toBeUndefined()
  })

  it('keeps the guides it can read and skips the ones it cannot', () => {
    const state = deserializeCanvas(
      JSON.stringify({
        ...DEFAULT_CANVAS,
        layers: [{ id: 'a' }],
        activeLayerId: 'a',
        guides: [{ id: 'g', axis: 'y', position: 40 }, { id: 'broken' }, 'nonsense'],
      }),
    )

    expect(state.guides).toEqual([{ id: 'g', axis: 'y', position: 40 }])
  })
})

describe('a caption given a box', () => {
  /**
   * The engine reads drags in floats, so one taken at 74% zoom comes back as 471.5789473684211 —
   * and the panel's fields keep every digit they are handed rather than rounding for show.
   */
  it('stores it in whole pixels', () => {
    const drawn = textLayer('t', '', { x: 0, y: 0 }, { width: 471.5789473684211, height: 242.52 })

    expect(drawn.box).toEqual({ width: 472, height: 243 })
  })

  // A box with no surface is not a box: a grip pulled past the opposite edge reads as zero.
  it('never gets a side of nothing', () => {
    expect(textLayer('t', '', { x: 0, y: 0 }, { width: 0.2, height: 0 }).box).toEqual({
      width: 1,
      height: 1,
    })
  })

  it('has none at all when it is a point caption', () => {
    expect(textLayer('t', '', { x: 0, y: 0 }).box).toBeNull()
  })
})
