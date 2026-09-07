import { readAdjustments } from '@shared/domain/adjustments'
import { BLEND_MODES } from '@shared/domain/canvasBlend'
import { readFontRef } from '@shared/domain/font'
import { isRecord, oneOf } from '@shared/guards'
import type { Point, Size } from '../core/geometry'
import {
  ADJUSTMENT_KINDS,
  BIT_DEPTHS,
  COLOR_MODES,
  DEFAULT_CANVAS,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_SHAPE_SIDES,
  DEFAULT_TEXT_SIZE,
  GUIDE_AXES,
  IDENTITY,
  pixelCellOf,
  SHAPE_KINDS,
  TEXT_ALIGNS,
  UNLOCKED,
  type AdjustmentKind,
  type CanvasState,
  type Guide,
  type GroupIsolation,
  type GroupLayer,
  type Layer,
  type LayerBase,
  type LayerLocks,
  type ShapeLayer,
  type ShapeStroke,
  type TextLayer,
  type Transform,
} from './canvasState'
import { allLayers, clampOpacity, isGroup } from './canvasStateTree'

const GROUP_ISOLATIONS: readonly GroupIsolation[] = ['pass-through', 'isolate']
function reviveGroup(
  source: Record<string, unknown>,
  base: LayerBase,
  seen: Set<string>,
): GroupLayer {
  return {
    ...base,
    kind: 'group',
    children: Array.isArray(source.children) ? reviveLayers(source.children, seen) : [],
    collapsed: source.collapsed === true,
    isolation: oneOf(GROUP_ISOLATIONS, source.isolation, 'pass-through'),
  }
}

function reviveText(source: Record<string, unknown>, base: LayerBase): TextLayer {
  return {
    ...base,
    kind: 'text',
    text: typeof source.text === 'string' ? source.text : '',
    font: readFontRef(source.font),
    size: typeof source.size === 'number' ? source.size : DEFAULT_TEXT_SIZE,
    color: typeof source.color === 'number' ? source.color : 0x000000,
    box: reviveBox(source.box),
    align: oneOf(TEXT_ALIGNS, source.align, 'left'),
    lineHeight: typeof source.lineHeight === 'number' ? source.lineHeight : DEFAULT_LINE_HEIGHT,
    tracking: typeof source.tracking === 'number' ? source.tracking : 0,
  }
}

function reviveShape(source: Record<string, unknown>, base: LayerBase): ShapeLayer {
  return {
    ...base,
    kind: 'shape',
    shape: oneOf(SHAPE_KINDS, source.shape, 'rectangle'),
    from: revivePoint(source.from),
    to: revivePoint(source.to),
    sides: typeof source.sides === 'number' ? source.sides : DEFAULT_SHAPE_SIDES,
    fill: typeof source.fill === 'number' ? source.fill : null,
    stroke: reviveStroke(source.stroke),
  }
}

function reviveBase(source: Record<string, unknown>): LayerBase | null {
  if (typeof source.id !== 'string') return null
  return {
    id: source.id,
    name: typeof source.name === 'string' ? source.name : source.id,
    visible: source.visible !== false,
    locked: reviveLocks(source.locked),
    opacity: typeof source.opacity === 'number' ? clampOpacity(source.opacity) : 1,
    fillOpacity: typeof source.fillOpacity === 'number' ? clampOpacity(source.fillOpacity) : 1,
    blend: oneOf(BLEND_MODES, source.blend, 'normal'),
    clipped: source.clipped === true,
    transform: reviveTransform(source.transform),
    mask: reviveMask(source.mask),
  }
}

function reviveLayer(raw: unknown, seen: Set<string>): Layer | null {
  if (!isRecord(raw)) return null
  const source = raw
  const base = reviveBase(source)
  if (!base) return null

  if (source.kind === 'group') return reviveGroup(source, base, seen)
  if (source.kind === 'text') return reviveText(source, base)
  if (source.kind === 'shape') return reviveShape(source, base)

  if (source.kind === 'adjustment')
    return {
      ...base,
      kind: 'adjustment',
      adjustment: reviveAdjustment(source.adjustment),
      values: readAdjustments(source.values),
    }

  // No `kind` at all is the pre-groups format, where every layer was a pixel layer.
  return {
    ...base,
    kind: 'pixel',
    fill: typeof source.fill === 'number' ? source.fill : undefined,
    source: typeof source.source === 'string' ? source.source : undefined,
  }
}

/**
 * `seen` spans the whole file, not one level: every lookup and every edit matches by id across
 * the tree, so two layers sharing one would be renamed, hidden and painted together — and
 * removing "it" would empty the stack the last-layer guard exists to protect.
 */
function reviveLayers(raw: readonly unknown[], seen: Set<string>): Layer[] {
  return raw.flatMap(entry => {
    const layer = reviveLayer(entry, seen)
    if (!layer || seen.has(layer.id)) return []
    seen.add(layer.id)
    return [layer]
  })
}

function reviveLocks(raw: unknown): LayerLocks {
  // One boolean was the whole padlock before: it meant "nothing about this layer moves".
  if (raw === true) return { pixels: true, position: true, alpha: true }
  if (!isRecord(raw)) return UNLOCKED
  return {
    pixels: raw.pixels === true,
    position: raw.position === true,
    alpha: raw.alpha === true,
  }
}

/**
 * What the four kinds a document may have been saved with became. `levels` and `curves` both
 * graded tone and `colorBalance` graded colour, so each lands on the dial that does its job —
 * a document written by an older build opens showing something, never an empty row.
 */
const RETIRED_ADJUSTMENTS: Readonly<Record<string, AdjustmentKind>> = {
  levels: 'exposure',
  curves: 'contrast',
  hsl: 'saturation',
  colorBalance: 'temperature',
}

function reviveAdjustment(raw: unknown): AdjustmentKind {
  if (typeof raw === 'string' && raw in RETIRED_ADJUSTMENTS) {
    return RETIRED_ADJUSTMENTS[raw] ?? 'exposure'
  }
  return oneOf(ADJUSTMENT_KINDS, raw, 'exposure')
}

/** No box at all is the POINT caption, and a box read back has to hold a size on both axes. */
function reviveBox(raw: unknown): Size | null {
  if (!isRecord(raw)) return null
  const { width, height } = raw
  if (typeof width !== 'number' || typeof height !== 'number') return null

  return width > 0 && height > 0 ? { width, height } : null
}

/** A shape whose two points collapse has no size, which nothing on screen could ever hold. */
function revivePoint(raw: unknown): Point {
  if (!isRecord(raw)) return { x: 0, y: 0 }
  return {
    x: typeof raw.x === 'number' ? raw.x : 0,
    y: typeof raw.y === 'number' ? raw.y : 0,
  }
}

function reviveStroke(raw: unknown): ShapeStroke | null {
  if (!isRecord(raw)) return null
  if (typeof raw.color !== 'number' || typeof raw.width !== 'number') return null
  return { color: raw.color, width: raw.width }
}

function reviveTransform(raw: unknown): Transform {
  if (!isRecord(raw)) return IDENTITY
  const source = raw
  const number = (key: keyof Transform): number =>
    typeof source[key] === 'number' ? source[key] : IDENTITY[key]

  return {
    x: number('x'),
    y: number('y'),
    scaleX: number('scaleX'),
    scaleY: number('scaleY'),
    rotation: number('rotation'),
    skewX: number('skewX'),
    skewY: number('skewY'),
    originX: number('originX'),
    originY: number('originY'),
  }
}

function reviveMask(raw: unknown): { enabled: boolean; linked: boolean } | undefined {
  if (!isRecord(raw)) return undefined
  const source = raw
  return { enabled: source.enabled !== false, linked: source.linked !== false }
}

function reviveGuides(raw: unknown): Guide[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(entry => {
    if (!isRecord(entry)) return []
    const source = entry
    if (typeof source.id !== 'string' || typeof source.position !== 'number') return []
    return [{ id: source.id, axis: oneOf(GUIDE_AXES, source.axis, 'x'), position: source.position }]
  })
}

/** Unreadable input yields a fresh document: a blank canvas beats an uncaught throw. */
export function deserializeCanvas(raw: string): CanvasState {
  try {
    const source: unknown = JSON.parse(raw)
    if (!isRecord(source)) return DEFAULT_CANVAS
    const layers = Array.isArray(source.layers) ? reviveLayers(source.layers, new Set()) : []
    if (layers.length === 0) return DEFAULT_CANVAS

    const active = source.activeLayerId
    // Paintable, not merely present: a group has no texture of its own, so arming one would
    // swallow every stroke silently.
    const known = allLayers(layers).some(layer => layer.id === active && !isGroup(layer))

    return {
      width: typeof source.width === 'number' ? source.width : DEFAULT_CANVAS.width,
      height: typeof source.height === 'number' ? source.height : DEFAULT_CANVAS.height,
      dpi: typeof source.dpi === 'number' ? source.dpi : DEFAULT_CANVAS.dpi,
      colorMode: oneOf(COLOR_MODES, source.colorMode, 'rgb'),
      bitDepth: oneOf(BIT_DEPTHS, source.bitDepth, 8),
      pixelCell: pixelCellOf(source.pixelCell),
      layers,
      // An id naming no layer would leave the document unpaintable, with no way back.
      activeLayerId:
        known && typeof active === 'string'
          ? active
          : (allLayers(layers).find(layer => !isGroup(layer))?.id ?? null),
      guides: reviveGuides(source.guides),
    }
  } catch {
    return DEFAULT_CANVAS
  }
}
