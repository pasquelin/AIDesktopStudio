import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { packedColour } from '@shared/domain/color'
import { PIXEL_SHAPES, type PixelShape } from '@shared/domain/pixelShape'
import { resizeCanvas, setPixelCell } from '@/engines/canvas/commands'
import { cellRect, cellsOfLine, cellsOfRect, gridOf } from '@/engines/canvas/pixelGrid'
import type { CanvasState } from '@/engines/canvas/canvasState'
import type { Point } from '@/engines/core/geometry'
import { canvasHost } from '@/features/image/canvasHosts'
import type { ActionHandlers } from './actionHandler'
import { boolOf, numberOf, oneOf, textOf, textsOf } from './actionInputs'
import {
  aimedLayer,
  editCanvas,
  mountedCanvas,
  NO_IMAGE,
  noSuchLayer,
} from './canvasHandlerContext'

function setPixelArt(input: Record<string, unknown>): ActionOutcome {
  const enabled = boolOf(input, 'enabled')
  const cell = numberOf(input, 'cell') ?? 1
  const columns = numberOf(input, 'columns')
  const rows = numberOf(input, 'rows')
  if ((columns === null) !== (rows === null))
    return refused('badInput', 'a grid wants "columns" AND "rows", in cells — or neither of them')

  return editCanvas(() => {
    const sized =
      enabled && columns !== null && rows !== null
        ? [resizeCanvas(columns * cell, rows * cell, { x: 0, y: 0 })]
        : []
    return [...sized, setPixelCell(enabled ? cell : null)]
  }, '')
}

const PIXEL_INPUT: Record<PixelShape, string> = {
  points: '"cells" wants at least one cell, each written "x,y" — for example ["3,4", "3,5"]',
  line: 'a line wants "x", "y", "toX" and "toY", in cells',
  rectangle: 'a rectangle wants "x", "y", "toX" and "toY", in cells — "filled" fills it',
  fill: 'a fill takes the whole layer, or the box named by "x", "y", "toX" and "toY"',
}

const CELL_WRITTEN = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/

function cellsAsked(input: Record<string, unknown>): Point[] | null {
  const written = textsOf(input, 'cells')
  const cells = written.flatMap(one => {
    const said = CELL_WRITTEN.exec(one)
    return said ? [{ x: Number(said[1]), y: Number(said[2]) }] : []
  })
  return cells.length === written.length ? cells : null
}

const within = (value: number, last: number): number => Math.min(Math.max(value, 0), last)

function rectangleCells(
  shape: PixelShape,
  from: Point,
  to: Point,
  columns: number,
  rows: number,
  filled: boolean,
): readonly Point[] {
  if (!filled) return cellsOfRect(from, to, false)
  return cellsOfRect(
    { x: within(from.x, columns - 1), y: within(from.y, rows - 1) },
    { x: within(to.x, columns - 1), y: within(to.y, rows - 1) },
    shape === 'fill' || filled,
  )
}

function shapeCells(
  shape: PixelShape,
  input: Record<string, unknown>,
  columns: number,
  rows: number,
): readonly Point[] | null {
  if (shape === 'points') return cellsAsked(input)
  const x = numberOf(input, 'x')
  const y = numberOf(input, 'y')
  if (shape === 'fill' && x === null)
    return cellsOfRect({ x: 0, y: 0 }, { x: columns - 1, y: rows - 1 }, true)
  if (x === null || y === null) return null
  const toX = numberOf(input, 'toX')
  const toY = numberOf(input, 'toY')
  if (toX === null || toY === null) return null
  const from = { x, y }
  const to = { x: toX, y: toY }
  return shape === 'line'
    ? cellsOfLine(from, to)
    : rectangleCells(shape, from, to, columns, rows, shape === 'fill' || boolOf(input, 'filled'))
}

function paintPixels(
  input: Record<string, unknown>,
  shape: PixelShape,
  color: number | null,
  open: { documentId: string; state: CanvasState },
  grid: { cell: number; columns: number; rows: number },
): ActionOutcome {
  const asked = shapeCells(shape, input, grid.columns, grid.rows)
  if (!asked?.length) return refused('badInput', PIXEL_INPUT[shape])
  const inside = asked.filter(
    at => at.x >= 0 && at.y >= 0 && at.x < grid.columns && at.y < grid.rows,
  )
  if (!inside.length)
    return refused('badInput', `no cell of that lands on a grid of ${grid.columns} by ${grid.rows}`)
  const named = textOf(input, 'layerId')
  const layer = aimedLayer(open.state, named)
  if (named !== null && !layer) return refused('notFound', noSuchLayer(named))
  const painted = canvasHost(open.documentId)?.paintCells(
    layer?.id ?? null,
    inside.map(at => cellRect(at, grid.cell)),
    color,
  )
  return painted
    ? { ok: true }
    : refused(
        'notFound',
        'nothing was painted: no such layer, or it is a group, or its pixels are padlocked, or it is a caption or a shape, or the cells fall outside the selection',
      )
}

function drawPixels(input: Record<string, unknown>): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)
  const grid = gridOf(open.state)
  if (!grid)
    return refused(
      'badInput',
      'this image is not on a pixel grid — canvas.setPixelArt puts it on one',
    )
  const shape = oneOf(input, 'shape', PIXEL_SHAPES)
  if (!shape) return refused('badInput', `"shape" must be one of: ${PIXEL_SHAPES.join(', ')}`)
  const erase = boolOf(input, 'erase')
  const written = textOf(input, 'color')
  if (erase === (written !== null))
    return refused('badInput', 'name a "color" or ask to "erase", one of the two and not both')
  const color = erase ? null : packedColour(written ?? '')
  return !erase && color === null
    ? refused('badInput', `"${written ?? ''}" is not a colour — write one as "#rrggbb"`)
    : paintPixels(input, shape, color, open, grid)
}

export const CANVAS_PIXEL_HANDLERS: ActionHandlers = {
  'canvas.setPixelArt': setPixelArt,
  'canvas.drawPixels': drawPixels,
}
