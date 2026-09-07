import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { packedColour } from '@shared/domain/color'
import { toDegrees, toRadians } from '@shared/domain/angles'
import { BLEND_MODES } from '@shared/domain/canvasBlend'
import { embeddedFontOf, FONT_SOURCES, type FontRef } from '@shared/domain/font'
import {
  ADJUSTMENT_KINDS,
  adjustmentLayer,
  DEFAULT_SHAPE_SIDES,
  LOCK_KEYS,
  pixelLayer,
  SHAPE_KINDS,
  shapeLayer,
  TEXT_ALIGNS,
  textLayer,
  type DrawnShape,
  type Layer,
} from '@/engines/canvas/canvasState'
import {
  DEFAULT_STROKE_WIDTH,
  isOpenShape,
  localShape,
  SHAPE_INK,
} from '@/engines/canvas/shapeGeometry'
import type { Point, Size } from '@/engines/core/geometry'
import {
  addLayer,
  duplicateLayer,
  groupLayers,
  setLayerAdjustment,
  setLayerBlend,
  setLayerClipped,
  setLayerFillOpacity,
  setLayerLocks,
  setLayerOpacity,
  setLayerShape,
  setLayerText,
  setLayerTransform,
  setLayerVisible,
} from '@/engines/canvas/commands'
import { newId } from '@/helpers/ids'
import type { ActionHandlers } from './actionHandler'
import { boolOf, composedNumber, namedOf, numberOf, oneOf, textOf, textsOf } from './actionInputs'
import {
  aimedLayer,
  editCanvas,
  editCanvasLayer,
  mountedCanvas,
  NO_IMAGE,
  runCanvas,
} from './canvasHandlerContext'
/**
 * A shape from a box rather than from a drag: a client has a rectangle, not a hand. The two
 * points are the box's own corners, which is what the layer stores.
 */
function drawnShape(input: Record<string, unknown>): { at: Point; drawn: DrawnShape } | null {
  const shape = oneOf(input, 'shape', SHAPE_KINDS)
  const width = numberOf(input, 'width')
  const height = numberOf(input, 'height')
  if (!shape || width === null || height === null || width <= 0 || height <= 0) return null

  const ink = packedColour(textOf(input, 'fill') ?? '') ?? SHAPE_INK
  const open = isOpenShape(shape)
  const sides = numberOf(input, 'sides') ?? DEFAULT_SHAPE_SIDES
  const ring = shape === 'polygon' || shape === 'star'
  const from = ring ? { x: width / 2, y: height / 2 } : { x: 0, y: 0 }
  const to = { x: width, y: height }

  const local = localShape(shape, from, to, sides, open ? DEFAULT_STROKE_WIDTH : 0)
  return {
    at: local.at,
    drawn: {
      shape,
      from: local.from,
      to: local.to,
      sides,
      fill: open ? null : ink,
      stroke: open ? { color: ink, width: DEFAULT_STROKE_WIDTH } : null,
    },
  }
}

/** The other axis of a box a client half-named, giving a point caption one for the first time. */
const DEFAULT_PARAGRAPH: Size = { width: 480, height: 120 }

// Only what is MISSING: told the whole rule with name, kind and shape already given, a client
// re-read the rule and not its own call (a box without width and height, 2026-09-06).
function missingFor(kind: string, input: Record<string, unknown>): string {
  if (kind === 'adjustment') return `"adjustment" wants one of: ${ADJUSTMENT_KINDS.join(', ')}`
  const wants = [
    ...(oneOf(input, 'shape', SHAPE_KINDS) ? [] : [`"shape" one of: ${SHAPE_KINDS.join(', ')}`]),
    ...['width', 'height'].flatMap(side => {
      const held = numberOf(input, side)
      return held === null || held <= 0 ? [`"${side}" above zero`] : []
    }),
  ]
  return `a shape wants ${wants.join(' and ')}`
}

function bornShape(input: Record<string, unknown>, id: string, name: string): Layer | null {
  const made = drawnShape(input)
  if (!made) return null
  const at = { x: numberOf(input, 'x') ?? 0, y: numberOf(input, 'y') ?? 0 }
  return shapeLayer(id, name, { x: at.x + made.at.x, y: at.y + made.at.y }, made.drawn)
}

function born(
  input: Record<string, unknown>,
  id: string,
  name: string,
  kind: string,
): Layer | null {
  switch (kind) {
    case 'pixel':
      return pixelLayer(id, name)
    case 'shape':
      return bornShape(input, id, name)
    case 'text':
      return {
        ...textLayer(id, textOf(input, 'text') ?? name, {
          x: numberOf(input, 'x') ?? 0,
          y: numberOf(input, 'y') ?? 0,
        }),
        name,
      }
    case 'adjustment': {
      const adjustment = oneOf(input, 'adjustment', ADJUSTMENT_KINDS)
      return adjustment ? adjustmentLayer(id, name, adjustment) : null
    }
    default:
      return null
  }
}

function newLayer(input: Record<string, unknown>): ActionOutcome {
  // Both held to the registry by the executor before any handler runs — see `inputProblem`.
  const name = textOf(input, 'name') ?? ''
  const kind = textOf(input, 'kind') ?? ''
  const id = newId()
  const layer = born(input, id, name, kind)
  if (!layer) return refused('badInput', missingFor(kind, input))

  const outcome = editCanvas(() => [addLayer(layer)], 'the new layer built no command to run')
  return outcome.ok ? { ok: true, data: { layerId: id } } : outcome
}

function style(input: Record<string, unknown>): ActionOutcome {
  const opacity = numberOf(input, 'opacity')
  const fillOpacity = numberOf(input, 'fillOpacity')
  const blend = oneOf(input, 'blend', BLEND_MODES)

  return editCanvasLayer(
    input,
    ({ id }) => [
      ...(opacity === null ? [] : [setLayerOpacity(id, opacity)]),
      ...(fillOpacity === null ? [] : [setLayerFillOpacity(id, fillOpacity)]),
      ...(blend ? [setLayerBlend(id, blend)] : []),
      ...(input.visible === undefined ? [] : [setLayerVisible(id, boolOf(input, 'visible'))]),
      ...(input.clipped === undefined ? [] : [setLayerClipped(id, boolOf(input, 'clipped'))]),
    ],
    'this call named nothing to set: opacity, fillOpacity, blend, visible or clipped',
    layer => namedOf(input, layer),
  )
}

function transform(input: Record<string, unknown>): ActionOutcome {
  const degrees = numberOf(input, 'rotation')
  const by = boolOf(input, 'relative')

  const shifted = (key: string, held: number, how: 'add' | 'multiply'): number =>
    composedNumber(held, numberOf(input, key), by, how)

  return editCanvasLayer(
    input,
    layer => [
      setLayerTransform(layer.id, {
        ...layer.transform,
        x: shifted('x', layer.transform.x, 'add'),
        y: shifted('y', layer.transform.y, 'add'),
        scaleX: shifted('scaleX', layer.transform.scaleX, 'multiply'),
        scaleY: shifted('scaleY', layer.transform.scaleY, 'multiply'),
        rotation: composedNumber(
          layer.transform.rotation,
          degrees === null ? null : toRadians(degrees),
          by,
          'add',
        ),
      }),
    ],
    'nothing to move: this layer takes x, y, scaleX, scaleY or rotation',
    layer => ({
      ...namedOf(input, layer.transform),
      ...(degrees === null ? {} : { rotation: toDegrees(layer.transform.rotation) }),
    }),
  )
}

/**
 * The face, or nothing when `embedded` is claimed for a family the studio does not ship — the one
 * promise `source` carries is that the document opens the same elsewhere, and that one would not.
 */
function fontRefOf(input: Record<string, unknown>, family: string): FontRef | null {
  const shipped = embeddedFontOf(family) !== null
  const source = oneOf(input, 'fontSource', FONT_SOURCES) ?? (shipped ? 'embedded' : 'system')

  return source === 'embedded' && !shipped ? null : { source, family }
}

function text(input: Record<string, unknown>): ActionOutcome {
  const colour = packedColour(textOf(input, 'color') ?? '')
  const size = numberOf(input, 'size')
  const written = textOf(input, 'text')
  const align = oneOf(input, 'align', TEXT_ALIGNS)
  const lineHeight = numberOf(input, 'lineHeight')
  const tracking = numberOf(input, 'tracking')
  const width = numberOf(input, 'width')
  const height = numberOf(input, 'height')
  const family = textOf(input, 'fontFamily')
  const font = family === null ? null : fontRefOf(input, family)
  if (family !== null && font === null)
    return refused(
      'badInput',
      `no embedded face "${family ?? ''}" ships with the studio — fonts.list answers which do, or send fontSource "system" to use one of this machine's`,
    )

  return editCanvasLayer(
    input,
    layer =>
      layer.kind === 'text'
        ? [
            setLayerText(layer.id, {
              ...(written === null ? {} : { text: written }),
              ...(font === null ? {} : { font }),
              ...(size === null ? {} : { size }),
              ...(colour === null ? {} : { color: colour }),
              ...(align === null ? {} : { align }),
              ...(lineHeight === null ? {} : { lineHeight }),
              ...(tracking === null ? {} : { tracking }),
              ...(width === null && height === null
                ? {}
                : {
                    box: {
                      width: width ?? layer.box?.width ?? DEFAULT_PARAGRAPH.width,
                      height: height ?? layer.box?.height ?? DEFAULT_PARAGRAPH.height,
                    },
                  }),
            }),
          ]
        : [],
    'only a text layer takes this — canvas.state answers "layers" with each one\'s "kind"',
  )
}

function locks(input: Record<string, unknown>): ActionOutcome {
  return editCanvasLayer(
    input,
    layer => {
      const named = LOCK_KEYS.filter(padlock => input[padlock] !== undefined)
      if (named.length === 0) return []

      const wanted = Object.fromEntries(named.map(padlock => [padlock, boolOf(input, padlock)]))
      return [setLayerLocks(layer.id, { ...layer.locked, ...wanted })]
    },
    `this call named no padlock — it takes ${LOCK_KEYS.join(', ')}`,
  )
}

function shape(input: Record<string, unknown>): ActionOutcome {
  const fill = packedColour(textOf(input, 'fill') ?? '')
  const stroke = packedColour(textOf(input, 'stroke') ?? '')
  const strokeWidth = numberOf(input, 'strokeWidth')
  const sides = numberOf(input, 'sides')
  const filled = input.filled === undefined ? null : boolOf(input, 'filled')
  const stroked = input.stroked === undefined ? null : boolOf(input, 'stroked')

  return editCanvasLayer(
    input,
    layer => {
      if (layer.kind !== 'shape') return []
      if (isOpenShape(layer.shape) && (filled !== null || fill !== null)) return []

      const painted =
        filled === null ? (fill ?? layer.fill) : filled ? (fill ?? layer.fill ?? SHAPE_INK) : null
      const keeps = stroked === null && stroke === null && strokeWidth === null
      const outlined =
        stroked === false
          ? null
          : keeps
            ? layer.stroke
            : {
                color: stroke ?? layer.stroke?.color ?? SHAPE_INK,
                width: strokeWidth ?? layer.stroke?.width ?? DEFAULT_STROKE_WIDTH,
              }

      if (painted === null && outlined === null) return []

      return [
        setLayerShape(layer.id, {
          fill: painted,
          stroke: outlined,
          ...(sides === null ? {} : { sides }),
        }),
      ]
    },
    'only a shape layer takes this; an open shape (line, arrow) has no inside to fill, and no shape may lose both its fill and its stroke',
  )
}

/**
 * The one dial the layer carries. A field naming another is refused rather than dropped: written
 * into the stack it would be carried, neutral and invisible, by a pass that never reads it.
 */
function adjustment(input: Record<string, unknown>): ActionOutcome {
  return editCanvasLayer(
    input,
    layer => {
      if (layer.kind !== 'adjustment') return []

      const named = ADJUSTMENT_KINDS.filter(kind => input[kind] !== undefined)
      if (named.length !== 1 || named[0] !== layer.adjustment) return []

      const value = numberOf(input, layer.adjustment)
      return value === null
        ? []
        : [setLayerAdjustment(layer.id, { ...layer.values, [layer.adjustment]: value })]
    },
    'only an adjustment layer takes this, and the one dial named must be the one it carries — canvas.state answers "adjustment" on each such layer',
  )
}

function duplicate(input: Record<string, unknown>): ActionOutcome {
  const copyId = newId()
  const outcome = editCanvasLayer(
    input,
    layer => [duplicateLayer(layer.id, copyId, textOf(input, 'name') ?? layer.name, newId)],
    'this layer built no copy',
  )

  return outcome.ok ? { ok: true, data: { layerId: copyId } } : outcome
}

function group(input: Record<string, unknown>): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)

  const layerIds = textsOf(input, 'layerIds')
  const name = textOf(input, 'name')
  if (layerIds.length === 0 || name === null)
    return refused('badInput', '"layerIds" wants at least one layer, and "name" is required')

  const top = new Set(open.state.layers.map(layer => layer.id))
  const aimed = layerIds.map(given => aimedLayer(open.state, given))
  const outside = layerIds.filter((_, at) => {
    const layer = aimed[at]
    return layer === undefined || !top.has(layer.id)
  })
  if (outside.length > 0)
    return refused(
      'notFound',
      `only layers at the top of the stack can be grouped, and ${outside.join(', ')} is not one — canvas.state answers "layers" with their ids and names`,
    )

  const groupId = newId()
  const outcome = runCanvas(
    open.documentId,
    [
      groupLayers(
        aimed.flatMap(layer => (layer ? [layer.id] : [])),
        groupId,
        name,
      ),
    ],
    'those layers built no group',
  )
  return outcome.ok ? { ok: true, data: { layerId: groupId } } : outcome
}

/**
 * The layers of the image in front, as things a sentence may aim at — topmost first, which is the
 * order the stack panel shows. Flattened as `canvas.state` flattens: a name is what a person says,
 * and where the group tree puts it is not something they can be asked to spell.
 */
export const CANVAS_LAYER_HANDLERS: ActionHandlers = {
  'layer.add': newLayer,
  'layer.setOpacityBlendAndVisibility': style,
  'layer.lock': locks,
  'layer.editShapeLayer': shape,
  'layer.setAdjustmentAmount': adjustment,
  'layer.transform': transform,
  'layer.editTextLayer': text,
  'layer.duplicate': duplicate,
  'layer.group': group,
}
