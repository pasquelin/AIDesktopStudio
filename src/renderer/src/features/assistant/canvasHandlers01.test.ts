import {
  ADJUSTMENT_KINDS,
  DEFAULT_CANVAS,
  DIAL_RANGE,
  LAYER_KINDS,
  pixelLayer,
  type CanvasState,
} from '@/engines/canvas/canvasState'
import { MAX_SIDES, MIN_SIDES } from '@/engines/canvas/shapeGeometry'
import { holdCanvas } from '@/features/image/canvasHosts'
import { canvasHostStub } from '@/stores/canvas-fixtures'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import { installIn } from '@/stores/document-fixtures'
import { useDocuments } from '@/stores/documents'
import { assistantAction, type ActionName } from '@shared/domain/assistant'
import { BLEND_MODES } from '@shared/domain/canvasBlend'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runAction } from './executor'

const DOCUMENT = 'doc-image'

function canvas(): CanvasState {
  return canvasOf(useCanvases.getState(), DOCUMENT)
}

function withLayers(...layers: CanvasState['layers']): void {
  installIn(canvasStore, DOCUMENT, { ...DEFAULT_CANVAS, layers }, 'image')
}

beforeEach(() => {
  withLayers(pixelLayer('layer-a', 'Fond'), pixelLayer('layer-b', 'Sujet'))
})

/**
 * Every other closed field of the registry reads its source — `MODEL_FAMILIES`, `ASSET_TYPES`,
 * `WORKSPACE_IDS`, the three scene registries. The image family cannot: blend modes and
 * adjustment kinds live in `engines/canvas`, which `shared/` may not import, so they are written
 * out by hand there. This is what holds the copies to their originals, and it has to live on this
 * side of the boundary for the same reason.
 */
describe('what the registry offers a layer', () => {
  const optionsOf = (name: ActionName, key: string): string[] =>
    [...(assistantAction(name)?.fields.find(field => field.key === key)?.options ?? [])]
      .flatMap(option => (typeof option === 'string' ? [option] : []))
      .sort()

  it('is exactly what the engine declares', () => {
    expect(optionsOf('layer.setOpacityBlendAndVisibility', 'blend')).toEqual(
      [...BLEND_MODES].sort(),
    )
    expect(optionsOf('layer.add', 'adjustment')).toEqual([...ADJUSTMENT_KINDS].sort())
    // Every kind but `group`, which is made by grouping a selection rather than added.
    expect(optionsOf('layer.add', 'kind')).toEqual(
      LAYER_KINDS.filter(kind => kind !== 'group').sort(),
    )
  })

  /**
   * The BOUNDS travel the same way as the options, and were the half nothing held: a schema that
   * offers a wider swing than the slider is a client told it may write what the panel cannot.
   */
  it('bounds every dial exactly as the engine does', () => {
    const boundsOf = (name: ActionName, key: string) => {
      const field = assistantAction(name)?.fields.find(one => one.key === key)
      return { min: field?.min, max: field?.max }
    }

    for (const kind of ADJUSTMENT_KINDS) {
      expect(boundsOf('layer.setAdjustmentAmount', kind), kind).toEqual(DIAL_RANGE[kind])
    }

    expect(boundsOf('layer.editShapeLayer', 'sides')).toEqual({ min: MIN_SIDES, max: MAX_SIDES })
    expect(boundsOf('layer.add', 'sides')).toEqual({ min: MIN_SIDES, max: MAX_SIDES })
  })
})

describe('what a layer stands at', () => {
  /**
   * 🛑 Left out and read as the default: a layer is drawn, whole, unlocked, blended normally,
   * uncut and untransformed. Written whole, one cost 290 characters — a stack of four came back
   * cut before the layer a sentence named.
   */
  it('leaves out what a fresh layer already holds', async () => {
    const outcome = await runAction('canvas.state', {})
    const [layer] = outcome.ok
      ? ((outcome.data as { layers: Record<string, unknown>[] }).layers ?? [])
      : []

    expect(layer).toHaveProperty('id')
    for (const key of [
      'visible',
      'opacity',
      'fillOpacity',
      'locked',
      'blend',
      'clipped',
      'transform',
    ])
      expect(layer).not.toHaveProperty(key)
  })
})

describe('the pixel-art grid, driven by value', () => {
  let drop = (): void => {}
  afterEach(() => {
    drop()
    drop = (): void => {}
  })

  const onGrid = (cell: number): void =>
    installIn(
      canvasStore,
      DOCUMENT,
      {
        ...DEFAULT_CANVAS,
        width: 512,
        height: 512,
        pixelCell: cell,
        layers: [pixelLayer('l', 'L')],
      },
      'image',
    )

  // Set in CELLS, which is how a person says it — the handler turns them into the document's size.
  it('sizes the document from a count of cells', async () => {
    expect(
      await runAction('canvas.setPixelArt', { enabled: true, columns: 32, rows: 32, cell: 2 }),
    ).toMatchObject({ ok: true })

    expect([canvas().width, canvas().height, canvas().pixelCell]).toEqual([64, 64, 2])
  })

  it('reads the grid back in cells, and says nothing of it when there is none', async () => {
    onGrid(16)
    const held = await runAction('canvas.state', {})
    expect(held).toMatchObject({
      ok: true,
      data: { pixelArt: { cell: 16, columns: 32, rows: 32 } },
    })

    await runAction('canvas.setPixelArt', { enabled: false })
    const gone = await runAction('canvas.state', {})
    expect(gone.ok && 'pixelArt' in (gone.data as object)).toBe(false)
  })

  it('refuses to draw on an image that is not on a grid', async () => {
    expect(
      await runAction('canvas.drawPixels', { shape: 'points', cells: ['1,1'], color: '#ff0000' }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  // One of the two and never both: a call that named a colour AND asked to erase means neither.
  it('refuses a colour and an erasure together, and refuses neither', async () => {
    onGrid(16)

    expect(
      await runAction('canvas.drawPixels', {
        shape: 'points',
        cells: ['1,1'],
        color: '#ff0000',
        erase: true,
      }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(await runAction('canvas.drawPixels', { shape: 'points', cells: ['1,1'] })).toMatchObject(
      {
        ok: false,
        refusal: 'badInput',
      },
    )
  })

  /**
   * Outside the grid is DROPPED, never folded back: a cell at 40 on a grid of 32 is a mistake,
   * and painting it at 8 would answer a request nobody made.
   */
  it('refuses when every cell asked for falls outside the grid', async () => {
    onGrid(16)

    expect(
      await runAction('canvas.drawPixels', { shape: 'points', cells: ['99,99'], color: '#ff0000' }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  // 🛑 One count alone was DROPPED and answered `ok`: the model then placed its cells on a grid
  // of the document's own size, believing it had asked for 32.
  it('refuses one count of a grid without the other', async () => {
    expect(await runAction('canvas.setPixelArt', { enabled: true, columns: 32 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * By id OR by NAME, as every other layer gesture of this file: `canvas.state` answers both, and
   * a name copied out of it came back « no such layer ».
   */
  it('finds the layer a call names, and says so when nothing answers to it', async () => {
    onGrid(16)

    expect(
      await runAction('canvas.drawPixels', {
        shape: 'points',
        cells: ['1,1'],
        color: '#ff0000',
        layerId: 'Nowhere',
      }),
    ).toMatchObject({ ok: false, refusal: 'notFound' })
  })

  // The three shapes the points case does not reach: a rectangle hollow or filled, a line between
  // two corners, and a fill falling back on the whole layer when no box is named.
  it('lays each shape on the cells it covers', async () => {
    onGrid(16)
    const laid: number[] = []
    drop = holdCanvas(DOCUMENT, () =>
      canvasHostStub({
        paintCells: (_layer, rects) => {
          laid.push(rects.length)
          return true
        },
      }),
    )

    const red = { color: '#ff0000' }
    await runAction('canvas.drawPixels', { shape: 'rectangle', x: 0, y: 0, toX: 3, toY: 3, ...red })
    await runAction('canvas.drawPixels', {
      shape: 'rectangle',
      x: 0,
      y: 0,
      toX: 3,
      toY: 3,
      filled: true,
      ...red,
    })
    await runAction('canvas.drawPixels', { shape: 'line', x: 0, y: 0, toX: 5, toY: 5, ...red })
    await runAction('canvas.drawPixels', { shape: 'fill', ...red })

    expect(laid).toEqual([12, 16, 6, 32 * 32])
  })

  /**
   * 🛑 A box far larger than the grid is CLIPPED before it is walked, never after: every cell it
   * drops was going to be dropped anyway, and « fill 0 to 99 999 » cost 264 ms of the UI thread.
   */
  it('fills the part of an oversized box that lands on the grid', async () => {
    onGrid(16)
    const laid: number[] = []
    drop = holdCanvas(DOCUMENT, () =>
      canvasHostStub({
        paintCells: (_layer, rects) => {
          laid.push(rects.length)
          return true
        },
      }),
    )

    await runAction('canvas.drawPixels', {
      shape: 'rectangle',
      x: 0,
      y: 0,
      toX: 99_999,
      toY: 99_999,
      filled: true,
      color: '#ff0000',
    })

    expect(laid).toEqual([32 * 32])
  })

  // 🛑 `Number('')` is zero, so a bare "3" used to land on row nought without a word said.
  it('refuses a cell that does not name both of its coordinates', async () => {
    onGrid(16)

    expect(
      await runAction('canvas.drawPixels', { shape: 'points', cells: ['3'], color: '#ff0000' }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(
      await runAction('canvas.drawPixels', { shape: 'points', cells: ['3,'], color: '#ff0000' }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  // No engine is mounted under a headless run, so the port answers nothing and the refusal names
  // what a caller can act on rather than reporting a success that painted nothing.
  it('says so when nothing was painted', async () => {
    onGrid(16)

    expect(
      await runAction('canvas.drawPixels', { shape: 'points', cells: ['1,1'], color: '#ff0000' }),
    ).toMatchObject({ ok: false, refusal: 'notFound' })
  })
})

describe('reading the image in front', () => {
  it('answers the frame and the whole stack, groups walked into', async () => {
    const outcome = await runAction('canvas.state', {})

    expect(outcome).toMatchObject({
      ok: true,
      data: { documentId: DOCUMENT, width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height },
    })
    const read = outcome.ok ? (outcome.data as { layers: { id: string }[] }) : null
    expect(read?.layers.map(one => one.id)).toEqual(['layer-a', 'layer-b'])
  })

  /**
   * The rule `command.runStudioCommand` already follows: an action of this family speaks to the image tab in
   * front, and there is no second way of naming a document. Without a check the commands would
   * run against a default state and report success.
   */
  it('refuses every action of the family while no image is in front', async () => {
    useDocuments.setState({ documents: {}, activeId: null })

    expect(await runAction('canvas.state', {})).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
    expect(await runAction('layer.remove', { layerId: 'layer-a' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })

  // The sentence is read by whoever is being refused, so the three families have to say the same
  // thing: written twice, one copy drifts at the first rewording and nothing goes red.
  it('says the same thing whichever family refuses', async () => {
    useDocuments.setState({ documents: {}, activeId: null })

    const said = async (name: ActionName, input = {}): Promise<string | undefined> => {
      const outcome = await runAction(name, input)
      return outcome.ok ? undefined : outcome.detail
    }

    expect(await said('layer.lock', { layerId: 'layer-a' })).toBe(await said('canvas.state'))
    expect(await said('canvas.setPixelArt', { enabled: true })).toBe(await said('canvas.state'))
  })
})
