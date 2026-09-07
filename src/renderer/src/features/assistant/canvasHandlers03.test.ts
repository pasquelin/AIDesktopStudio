import {
  DEFAULT_CANVAS,
  GUIDE_AXES,
  pixelLayer,
  type CanvasState,
} from '@/engines/canvas/canvasState'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import { installIn } from '@/stores/document-fixtures'
import { assistantAction } from '@shared/domain/assistant'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAction } from './executor'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'
import {
  GENERATION_COMMENT_OUTLINE_MAX,
  GENERATION_COMMENT_TEXT_MAX,
} from '@shared/domain/generationComment'
import { isRecord } from '@shared/guards'

const DOCUMENT = 'doc-image'

function canvas(): CanvasState {
  return canvasOf(useCanvases.getState(), DOCUMENT)
}

function withLayers(...layers: CanvasState['layers']): void {
  installIn(canvasStore, DOCUMENT, { ...DEFAULT_CANVAS, layers }, 'image')
}

/** By name rather than by index: a layer the stack was asked to add does not land at a known one. */
const layerNamed = (name: string): CanvasState['layers'][number] | undefined =>
  canvas().layers.find(layer => layer.name === name)

beforeEach(() => {
  withLayers(pixelLayer('layer-a', 'Fond'), pixelLayer('layer-b', 'Sujet'))
  useGenerationComments.setState({ comments: {} })
})

/**
 * Every other closed field of the registry reads its source — `MODEL_FAMILIES`, `ASSET_TYPES`,
 * `WORKSPACE_IDS`, the three scene registries. The image family cannot: blend modes and
 * adjustment kinds live in `engines/canvas`, which `shared/` may not import, so they are written
 * out by hand there. This is what holds the copies to their originals, and it has to live on this
 * side of the boundary for the same reason.
 */
describe('the padlocks of a layer', () => {
  it('sets the one it was given and leaves the others alone', async () => {
    await runAction('layer.lock', { layerId: 'layer-a', pixels: true })

    expect(canvas().layers[0]?.locked).toEqual({ pixels: true, position: false, alpha: false })

    await runAction('layer.lock', { layerId: 'layer-a', alpha: true })

    expect(canvas().layers[0]?.locked).toEqual({ pixels: true, position: false, alpha: true })
  })

  it('refuses a call that names no padlock', async () => {
    expect(await runAction('layer.lock', { layerId: 'layer-a' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

describe('document image properties', () => {
  it('sets print resolution, colour mode and bit depth through one MCP action', async () => {
    expect(
      await runAction('canvas.setDocumentProperties', {
        dpi: 300,
        colorMode: 'grayscale',
        bitDepth: 16,
      }),
    ).toEqual({ ok: true })

    expect(canvas()).toMatchObject({ dpi: 300, colorMode: 'grayscale', bitDepth: 16 })
    expect(await runAction('canvas.state', {})).toMatchObject({
      ok: true,
      data: { dpi: 300, colorMode: 'grayscale', bitDepth: 16 },
    })
  })
})

describe('repainting a shape long after it was drawn', () => {
  const drawn = async (): Promise<string> => {
    const made = await runAction('layer.add', {
      kind: 'shape',
      name: 'Cadre',
      shape: 'rectangle',
      width: 100,
      height: 50,
    })
    return made.ok ? (made.data as { layerId: string }).layerId : ''
  }

  it('changes the fill and the outline of a shape already on the stack', async () => {
    const layerId = await drawn()

    await runAction('layer.editShapeLayer', {
      layerId,
      fill: '#ff0000',
      stroke: '#0000ff',
      strokeWidth: 6,
    })

    expect(layerNamed('Cadre')).toMatchObject({
      fill: 0xff0000,
      stroke: { color: 0x0000ff, width: 6 },
    })
  })

  // The panel hides the fill switch for these two, and `paintShape` leaves their path open: an
  // `ok` here would be paint nobody can see.
  it('refuses to fill a line, which has no inside', async () => {
    const made = await runAction('layer.add', {
      kind: 'shape',
      name: 'Trait',
      shape: 'line',
      width: 100,
      height: 0.5,
    })
    const layerId = made.ok ? (made.data as { layerId: string }).layerId : ''

    expect(await runAction('layer.editShapeLayer', { layerId, filled: true })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(layerNamed('Trait')).toMatchObject({ fill: null })
  })

  /**
   * The panel answers this by switching the other one back on, which is right under a finger and
   * wrong from outside: a client that asked for both to go hears that it cannot have that.
   */
  it('refuses to leave a shape with neither fill nor outline', async () => {
    const layerId = await drawn()
    await runAction('layer.editShapeLayer', { layerId, filled: true, stroked: false })

    expect(await runAction('layer.editShapeLayer', { layerId, filled: false })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(layerNamed('Cadre')).toMatchObject({ fill: expect.any(Number) })
  })
})

describe('the dial of an adjustment layer', () => {
  const adjusting = async (): Promise<string> => {
    const made = await runAction('layer.add', {
      kind: 'adjustment',
      name: 'Expo',
      adjustment: 'exposure',
    })
    return made.ok ? (made.data as { layerId: string }).layerId : ''
  }

  it('moves the dial the layer carries', async () => {
    const layerId = await adjusting()

    await runAction('layer.setAdjustmentAmount', { layerId, exposure: 1.5 })

    expect(layerNamed('Expo')).toMatchObject({ values: { exposure: 1.5, contrast: 1 } })
  })

  // Written into the stack it would be carried, neutral and invisible, by a pass that never
  // reads it — so the call says so instead.
  it('refuses a dial that is not the layer’s own', async () => {
    const layerId = await adjusting()

    expect(await runAction('layer.setAdjustmentAmount', { layerId, contrast: 1.4 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

describe('the frame itself', () => {
  it('resizes the frame alone, and rescales the layers when asked', async () => {
    await runAction('canvas.resize', { width: 800, height: 600 })
    expect(canvas()).toMatchObject({ width: 800, height: 600 })

    await runAction('canvas.resize', { width: 400, height: 300, scalePixels: true })
    expect(canvas()).toMatchObject({ width: 400, height: 300 })
  })

  it('crops to a rectangle and turns the frame a quarter turn', async () => {
    await runAction('canvas.crop', { x: 0, y: 0, width: 100, height: 200 })
    expect(canvas()).toMatchObject({ width: 100, height: 200 })

    await runAction('canvas.flipOrRotate', { turn: 'rotateClockwise' })
    expect(canvas()).toMatchObject({ width: 200, height: 100 })
  })
})

describe('what a mask does, once the engine has carved one', () => {
  const masked = () => ({
    ...pixelLayer('layer-a', 'Fond'),
    mask: { enabled: true, linked: true },
  })

  it('says whether it hides and whether it travels, one field at a time', async () => {
    withLayers(masked(), pixelLayer('layer-b', 'Sujet'))

    expect(await runAction('layer.setMaskOptions', { layerId: 'layer-a', linked: false })).toEqual({
      ok: true,
    })
    expect(canvas().layers[0]?.mask).toEqual({ enabled: true, linked: false })
  })

  it('takes it off, and refuses to say what it does in the same breath', async () => {
    withLayers(masked())

    expect(
      await runAction('layer.setMaskOptions', { layerId: 'layer-a', remove: true, enabled: false }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })

    expect(await runAction('layer.setMaskOptions', { layerId: 'layer-a', remove: true })).toEqual({
      ok: true,
    })
    expect(canvas().layers[0]?.mask).toBeUndefined()
  })

  /** Carving one is the engine's, through a command: a record with no pixels behind it hides all. */
  it('refuses a layer wearing none rather than giving it an empty one', async () => {
    expect(
      await runAction('layer.setMaskOptions', { layerId: 'layer-a', enabled: false }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

describe('the guides of an image', () => {
  it('offers exactly the two ways a guide may run', () => {
    expect([
      ...(assistantAction('guide.add')?.fields.find(f => f.key === 'axis')?.options ?? []),
    ]).toEqual([...GUIDE_AXES])
  })

  it('lays one, moves it, and takes it away by the id it answered', async () => {
    const laid = await runAction('guide.add', { axis: 'x', position: 120 })
    const guideId = laid.ok ? (laid.data as { guideId: string }).guideId : ''

    expect(canvas().guides).toEqual([{ id: guideId, axis: 'x', position: 120 }])

    expect(await runAction('guide.move', { guideId, position: 40 })).toEqual({ ok: true })
    expect(canvas().guides[0]?.position).toBe(40)

    expect(await runAction('guide.remove', { guideId })).toEqual({ ok: true })
    expect(canvas().guides).toEqual([])
  })

  it('refuses an id nothing answers to rather than writing nothing', async () => {
    expect(await runAction('guide.move', { guideId: 'guide-z', position: 40 })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(await runAction('guide.remove', { guideId: 'guide-z' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })
})

/**
 * 🛑 Measured on the bench pass of 2026-08-31 against deepseek-chat: `layer.mask` was refused
 * twelve times on a bare `badInput`, and the very same call came back word for word.
 */
describe('what a refused mask says', () => {
  const detailOf = (outcome: { ok: boolean; detail?: string }): string => outcome.detail ?? ''

  it('says the layer wears no mask, and which fields it would have taken', async () => {
    const outcome = await runAction('layer.setMaskOptions', { layerId: 'layer-a', enabled: false })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(detailOf(outcome)).toContain('canvas.state')
    expect(detailOf(outcome)).toContain('mask')
  })

  it('says the two halves cannot travel together', async () => {
    const outcome = await runAction('layer.setMaskOptions', {
      layerId: 'layer-a',
      remove: true,
      linked: true,
    })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(detailOf(outcome)).toContain('remove')
    expect(detailOf(outcome)).toContain('linked')
  })

  it('names the layer it could not find, and the call that lists them', async () => {
    const outcome = await runAction('layer.setMaskOptions', {
      layerId: 'layer-nowhere',
      enabled: true,
    })

    expect(outcome).toMatchObject({ ok: false, refusal: 'notFound' })
    expect(detailOf(outcome)).toContain('layer-nowhere')
    expect(detailOf(outcome)).toContain('canvas.state')
  })
})

describe('generation comments through the assistant boundary', () => {
  it('adds a traced instruction to a named layer and exposes it in canvas state', async () => {
    const added = await runAction('img.pin', {
      action: 'add',
      x: 10,
      y: 20,
      text: 'Extraire la voiture',
      layerId: 'layer-b',
      outline: [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 40 },
      ],
    })

    expect(added).toMatchObject({ ok: true })
    expect(await runAction('canvas.state', {})).toMatchObject({
      ok: true,
      data: {
        generationComments: [
          {
            at: { x: 10, y: 20 },
            text: 'Extraire la voiture',
            layerId: 'layer-b',
          },
        ],
      },
    })
  })

  it('updates and removes a generation comment before submission', async () => {
    const added = await runAction('img.pin', {
      action: 'add',
      x: 10,
      y: 20,
      text: 'Old instruction',
    })
    if (!added.ok || !isRecord(added.data) || typeof added.data.commentId !== 'string') {
      throw new Error('the comment was not added')
    }
    const commentId = added.data.commentId

    expect(
      await runAction('img.pin', {
        action: 'update',
        commentId,
        text: 'New instruction',
      }),
    ).toEqual({ ok: true })
    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)[0]?.text).toBe(
      'New instruction',
    )

    expect(await runAction('img.pin', { action: 'remove', commentId })).toEqual({ ok: true })
    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)).toEqual([])
  })

  it('refuses an outline too large to render and send safely', async () => {
    const outcome = await runAction('img.pin', {
      action: 'add',
      x: 10,
      y: 20,
      text: 'Trace this',
      outline: Array.from({ length: GENERATION_COMMENT_OUTLINE_MAX + 1 }, (_, x) => ({ x, y: 20 })),
    })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  it('refuses anchors and outlines outside the image or without a polygon', async () => {
    const inputs = [
      { action: 'add', x: -1, y: 20, text: 'Outside' },
      {
        action: 'add',
        x: 10,
        y: 20,
        text: 'Outside outline',
        outline: [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
          { x: DEFAULT_CANVAS.width + 1, y: 40 },
        ],
      },
      {
        action: 'add',
        x: 10,
        y: 20,
        text: 'Open line',
        outline: [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
        ],
      },
      {
        action: 'add',
        x: 10,
        y: 20,
        text: 'Flat polygon',
        outline: [
          { x: 10, y: 20 },
          { x: 20, y: 20 },
          { x: 30, y: 20 },
        ],
      },
    ]

    for (const input of inputs) {
      await expect(runAction('img.pin', input)).resolves.toMatchObject({
        ok: false,
        refusal: 'badInput',
      })
    }
    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)).toEqual([])
  })

  it('refuses empty and oversized instructions without storing a comment', async () => {
    for (const text of ['   ', 'x'.repeat(GENERATION_COMMENT_TEXT_MAX + 1)]) {
      await expect(
        runAction('img.pin', { action: 'add', x: 10, y: 20, text }),
      ).resolves.toMatchObject({ ok: false, refusal: 'badInput' })
    }
    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)).toEqual([])
  })

  it('refuses a layer that is not in the open image', async () => {
    const outcome = await runAction('img.pin', {
      action: 'add',
      x: 10,
      y: 20,
      text: 'Keep it',
      layerId: 'missing-layer',
    })

    expect(outcome).toMatchObject({ ok: false, refusal: 'notFound' })
    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)).toEqual([])
  })
})
