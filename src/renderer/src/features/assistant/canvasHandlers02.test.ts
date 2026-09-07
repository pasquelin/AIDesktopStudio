import {
  DEFAULT_CANVAS,
  pixelLayer,
  textLayer,
  type CanvasState,
} from '@/engines/canvas/canvasState'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import { installIn } from '@/stores/document-fixtures'
import { EMBEDDED_FONTS } from '@shared/domain/font'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAction } from './executor'

const DOCUMENT = 'doc-image'

function canvas(): CanvasState {
  return canvasOf(useCanvases.getState(), DOCUMENT)
}

function withLayers(...layers: CanvasState['layers']): void {
  installIn(canvasStore, DOCUMENT, { ...DEFAULT_CANVAS, layers }, 'image')
}

const layerIds = (): string[] => canvas().layers.map(layer => layer.id)

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
describe('building a stack', () => {
  it('adds a layer and answers the id it was given', async () => {
    const outcome = await runAction('layer.add', { kind: 'pixel', name: 'Ciel' })
    const added = outcome.ok ? (outcome.data as { layerId: string }) : null

    expect(added?.layerId).toBeTruthy()
    expect(canvas().layers.at(-1)?.name).toBe('Ciel')
  })

  // Told the whole rule with name, kind and shape already given, a client re-read the rule and
  // not its own call — measured 2026-09-06, Codex by MCP.
  it('names only what a box lacks, not the whole rule', async () => {
    const outcome = await runAction('layer.add', {
      kind: 'shape',
      name: 'Cadre',
      shape: 'rectangle',
    })

    expect(outcome).toEqual({
      ok: false,
      refusal: 'badInput',
      detail: 'a shape wants "width" above zero and "height" above zero',
    })
  })

  /** A client has a rectangle, not a hand: the box is what it names, and the two points follow. */
  it('draws a shape from the box a client names', async () => {
    await runAction('layer.add', {
      kind: 'shape',
      name: 'Cadre',
      shape: 'rectangle',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      fill: '#ff0000',
    })

    const added = canvas().layers.at(-1)
    if (added?.kind !== 'shape') throw new Error('the layer added is not a shape')

    // Read through the transform, which is where the box really lands: the layer's own space
    // starts at the corner of what the shape REACHES, a stroke's overhang included.
    expect({ x: added.transform.x + added.from.x, y: added.transform.y + added.from.y }).toEqual({
      x: 10,
      y: 20,
    })
    expect({ x: added.transform.x + added.to.x, y: added.transform.y + added.to.y }).toEqual({
      x: 110,
      y: 70,
    })
    expect(added.fill).toBe(0xff0000)
  })

  /**
   * A line and an arrow have no inside: `paintShape` leaves their path open on purpose, so a
   * fill paints nothing at all. The layer listed in the stack and drew a blank.
   */
  it('strokes the two shapes that have no inside, rather than filling them', async () => {
    await runAction('layer.add', {
      kind: 'shape',
      name: 'Trait',
      shape: 'line',
      width: 100,
      height: 100,
      fill: '#00ff00',
    })

    const added = canvas().layers.at(-1)
    expect(added?.kind === 'shape' && added.fill).toBeNull()
    expect(added?.kind === 'shape' && added.stroke?.color).toBe(0x00ff00)
  })

  // A ring reaches its far point from the CENTRE, so a box wider than it is tall used to put the
  // top of the star at a negative y — outside the layer's texture, and clipped away.
  it('keeps a star inside its own texture whatever the box is shaped like', async () => {
    await runAction('layer.add', {
      kind: 'shape',
      name: 'Étoile',
      shape: 'star',
      width: 200,
      height: 50,
    })

    const added = canvas().layers.at(-1)
    if (added?.kind !== 'shape') throw new Error('the layer added is not a shape')

    expect(added.from.x).toBeGreaterThanOrEqual(0)
    expect(added.from.y).toBeGreaterThanOrEqual(0)
    expect(added.to.y).toBeGreaterThanOrEqual(0)
  })

  // A shape with no box is a layer with nothing on it, which nothing on screen could show.
  it('refuses a shape that names no box', async () => {
    expect(await runAction('layer.add', { kind: 'shape', name: 'Cadre' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * A caption added by a client is a POINT one, having no box — naming a width is what gives it
   * one. The other axis then starts at the paragraph default rather than at nothing.
   */
  it('gives a point caption a box the first time a client names one', async () => {
    await runAction('layer.add', { kind: 'text', name: 'Titre', text: 'Bonjour' })
    const id = canvas().layers.at(-1)?.id
    expect(canvas().layers.at(-1)?.kind === 'text' && canvas().layers.at(-1)).toMatchObject({
      box: null,
    })

    await runAction('layer.editTextLayer', { layerId: id, width: 900, align: 'center' })

    const written = canvas().layers.at(-1)
    if (written?.kind !== 'text') throw new Error('the layer is not a caption')
    expect(written.box?.width).toBe(900)
    expect(written.box?.height).toBeGreaterThan(0)
    expect(written.align).toBe('center')
  })

  /** One axis at a time: a client naming only a width must not flatten the height with it. */
  it('resizes a caption box on the axis it names, and on that one only', async () => {
    await runAction('layer.add', { kind: 'text', name: 'Titre', text: 'Bonjour' })
    const id = canvas().layers.at(-1)?.id
    await runAction('layer.editTextLayer', { layerId: id, width: 900, height: 400 })

    await runAction('layer.editTextLayer', { layerId: id, width: 500 })

    const written = canvas().layers.at(-1)
    if (written?.kind !== 'text') throw new Error('the layer is not a caption')
    expect(written.box).toEqual({ width: 500, height: 400 })
  })

  // A row in the panel that changes nothing is the one thing a layer must never be.
  it('refuses an adjustment layer that names no dial', async () => {
    expect(await runAction('layer.add', { kind: 'adjustment', name: 'Étalonnage' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(canvas().layers).toHaveLength(2)
  })

  it('removes, renames and reorders by id', async () => {
    await runAction('layer.rename', { layerId: 'layer-a', name: 'Ciel' })
    expect(canvas().layers[0]?.name).toBe('Ciel')

    await runAction('layer.reorderInStack', { layerId: 'layer-a', index: 1 })
    expect(layerIds()).toEqual(['layer-b', 'layer-a'])

    await runAction('layer.remove', { layerId: 'layer-b' })
    expect(layerIds()).toEqual(['layer-a'])
  })

  /**
   * A command whose layer is gone answers by returning the state untouched, so without this
   * check every miss would be reported as done — the whole reason the id is looked up first.
   */
  it('refuses a layer the stack does not hold rather than reporting a no-op as done', async () => {
    expect(await runAction('layer.rename', { layerId: 'layer-z', name: 'Rien' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  it('groups, ungroups and duplicates, answering the new ids', async () => {
    const grouped = await runAction('layer.group', {
      layerIds: ['layer-a', 'layer-b'],
      name: 'Décor',
    })
    const groupId = grouped.ok ? (grouped.data as { layerId: string }).layerId : ''
    expect(canvas().layers.map(one => one.kind)).toEqual(['group'])

    const copy = await runAction('layer.duplicate', { layerId: groupId })
    expect(copy).toMatchObject({ ok: true })
    expect(canvas().layers).toHaveLength(2)

    await runAction('layer.ungroup', { layerId: groupId })
    expect(canvas().layers.some(one => one.id === groupId)).toBe(false)
  })

  /**
   * 🛑 By NAME as well as by id, as every other layer gesture: a name copied out of `canvas.state`
   * was answered « not at the top of the stack », which blames the stack for a lookup never made.
   */
  it('groups the layers a call names, not only the ones it numbers', async () => {
    expect(
      await runAction('layer.group', { layerIds: ['Fond', 'Sujet'], name: 'Décor' }),
    ).toMatchObject({ ok: true })

    expect(canvas().layers.map(one => one.kind)).toEqual(['group'])
  })

  /**
   * `groupLayers` gathers TOP-LEVEL layers only and hands the state back when it finds none, so
   * an id that names nothing — or one already inside a group — was answered with the id of a
   * group no layer carries.
   */
  it('refuses to group an id that is not a layer of the top level', async () => {
    expect(await runAction('layer.group', { layerIds: ['layer-z'], name: 'Décor' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(canvas().layers.map(one => one.kind)).toEqual(['pixel', 'pixel'])
  })

  /** `moveLayer` refuses a parent that is no group by handing the state back — done, said twice. */
  it('refuses a move under something that is not a group', async () => {
    expect(
      await runAction('layer.reorderInStack', {
        layerId: 'layer-a',
        parentId: 'layer-b',
        index: 0,
      }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(layerIds()).toEqual(['layer-a', 'layer-b'])
  })

  /** `textLayer` names a layer after its own text; the name asked for is what a client looks up. */
  it('keeps the name a text layer was asked for, not its text', async () => {
    await runAction('layer.add', { kind: 'text', name: 'Titre', text: 'Générique' })

    expect(canvas().layers.at(-1)?.name).toBe('Titre')
  })
})

describe('styling and placing a layer', () => {
  it('changes only the dials it was given', async () => {
    await runAction('layer.setOpacityBlendAndVisibility', { layerId: 'layer-a', opacity: 0.5 })

    expect(canvas().layers[0]).toMatchObject({ opacity: 0.5, blend: 'normal', visible: true })
  })

  /**
   * Three dials, three entries, and that is the right answer rather than a shortcoming: history
   * coalescing merges commands that share an `id`, keeping the FIRST one's `revert` — a gesture
   * around three different dials would undo the opacity and leave the blend mode set.
   */
  it('takes several dials in one call, each undoable on its own', async () => {
    await runAction('layer.setOpacityBlendAndVisibility', {
      layerId: 'layer-a',
      opacity: 0.2,
      blend: 'multiply',
      visible: false,
    })

    expect(canvas().layers[0]).toMatchObject({ opacity: 0.2, blend: 'multiply', visible: false })
    expect(useCanvases.getState().histories[DOCUMENT]?.past).toHaveLength(3)
  })

  // Degrees in, radians stored: a client writing 90 for a quarter turn is right more often than
  // one writing 1.5707963.
  it('takes a rotation in degrees and keeps every value it was not given', async () => {
    await runAction('layer.transform', { layerId: 'layer-a', x: 40, rotation: 90 })

    expect(canvas().layers[0]?.transform).toMatchObject({ x: 40, rotation: Math.PI / 2, scaleX: 1 })
  })

  it('answers the dials it set, and only those', async () => {
    expect(
      await runAction('layer.setOpacityBlendAndVisibility', {
        layerId: 'layer-a',
        opacity: 0.5,
        blend: 'multiply',
      }),
    ).toEqual({ ok: true, data: { opacity: 0.5, blend: 'multiply' } })
  })

  it('answers where the layer landed, the rotation in degrees as it came in', async () => {
    expect(
      await runAction('layer.transform', {
        layerId: 'layer-a',
        x: 10,
        rotation: 90,
        relative: true,
      }),
    ).toEqual({ ok: true, data: { x: 10, rotation: 90 } })
  })

  it('writes a text layer’s words, and refuses one that holds pixels', async () => {
    withLayers(textLayer('layer-t', 'Titre', { x: 0, y: 0 }), pixelLayer('layer-p', 'Fond'))

    await runAction('layer.editTextLayer', { layerId: 'layer-t', text: 'Générique', size: 64 })
    expect(canvas().layers[0]).toMatchObject({ text: 'Générique', size: 64 })

    expect(
      await runAction('layer.editTextLayer', { layerId: 'layer-p', text: 'Rien' }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('reads a colour written as #rrggbb', async () => {
    withLayers(textLayer('layer-t', 'Titre', { x: 0, y: 0 }))

    await runAction('layer.editTextLayer', { layerId: 'layer-t', color: '#ff8800' })
    expect(canvas().layers[0]).toMatchObject({ color: 0xff8800 })
  })

  /**
   * `fonts.list` named faces nothing could then set — the one action of discovery this registry
   * published with no way to act on what it found.
   */
  it('sets the typeface, telling a shipped face from an installed one', async () => {
    withLayers(textLayer('layer-t', 'Titre', { x: 0, y: 0 }))

    await runAction('layer.editTextLayer', { layerId: 'layer-t', fontFamily: 'Helvetica Neue' })
    expect(canvas().layers[0]).toMatchObject({
      font: { source: 'system', family: 'Helvetica Neue' },
    })

    const shipped = EMBEDDED_FONTS[0]?.family ?? ''
    await runAction('layer.editTextLayer', { layerId: 'layer-t', fontFamily: shipped })

    expect(canvas().layers[0]).toMatchObject({ font: { source: 'embedded', family: shipped } })
  })

  /**
   * `source` carries one promise — that the document opens the same on the next machine — and an
   * `embedded` face the studio does not ship breaks exactly that one, silently.
   */
  it('refuses a face claimed as shipped that the studio does not ship', async () => {
    withLayers(textLayer('layer-t', 'Titre', { x: 0, y: 0 }))

    const outcome = await runAction('layer.editTextLayer', {
      layerId: 'layer-t',
      fontFamily: 'Helvetica Neue',
      fontSource: 'embedded',
    })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
  })
})
