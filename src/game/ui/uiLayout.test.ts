// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERACTION,
  DEFAULT_PLACEMENT,
  DEFAULT_STACK,
  DEFAULT_STYLE,
  DEFAULT_TEXT,
  SCREEN_PLACEMENT,
  type UiAlign,
  type UiBox,
  type UiElement,
  type UiExtent,
  type UiJustify,
  type UiPlacement,
  type UiScreen,
  type UiSize,
  type UiSizing,
  type UiStyle,
} from '@shared/domain/ui'
import { layoutOf, type UiMeasure } from './uiLayout'

const VIEWPORT: UiSize = { width: 1000, height: 500 }

/** Every leaf is the same size, so a failure is about placement and never about a font. */
const measured: UiMeasure = () => ({ width: 40, height: 20 })

const shared = {
  name: '',
  visible: true,
  enabled: true,
  locked: false,
  style: DEFAULT_STYLE,
  interaction: DEFAULT_INTERACTION,
}

const at = (place: Partial<UiPlacement>): UiPlacement => ({ ...DEFAULT_PLACEMENT, ...place })

const px = (value: number): UiSizing => ({ mode: 'fixed', length: { unit: 'px', value } })

const percent = (value: number): UiSizing => ({ mode: 'fixed', length: { unit: 'percent', value } })

const sized = (width: number, height: number): UiExtent => ({
  width: px(width),
  height: px(height),
})

const stretch: UiSizing = { mode: 'stretch' }

const leaf = (id: string, place: Partial<UiPlacement> = {}): UiElement => ({
  ...shared,
  id,
  type: 'text',
  text: DEFAULT_TEXT,
  place: at(place),
})

const panel = (
  id: string,
  children: readonly UiElement[],
  place: Partial<UiPlacement> = {},
  style: UiStyle = DEFAULT_STYLE,
): UiElement => ({ ...shared, id, type: 'panel', children, place: at(place), style })

const stack = (
  id: string,
  children: readonly UiElement[],
  over: Partial<typeof DEFAULT_STACK> = {},
  place: Partial<UiPlacement> = {},
): UiElement => ({
  ...shared,
  id,
  type: 'stack',
  stack: { ...DEFAULT_STACK, ...over },
  children,
  place: at(place),
})

const screen = (children: readonly UiElement[]): UiScreen => ({
  ...shared,
  id: 'root',
  type: 'screen',
  place: SCREEN_PLACEMENT,
  children,
})

const boxOf = (root: UiScreen, id: string, viewport = VIEWPORT): UiBox => {
  const box = layoutOf(root, viewport, measured).get(id)
  expect(box, `no box for ${id}`).toBeDefined()
  return box ?? { x: 0, y: 0, width: 0, height: 0 }
}

describe('solving a screen', () => {
  it('fills whatever it is shown on', () => {
    expect(boxOf(screen([]), 'root')).toEqual({ x: 0, y: 0, width: 1000, height: 500 })
  })

  it('answers a box for every element of the tree', () => {
    const boxes = layoutOf(screen([panel('p', [leaf('a'), leaf('b')])]), VIEWPORT, measured)

    expect([...boxes.keys()].sort()).toEqual(['a', 'b', 'p', 'root'])
  })

  /** A layout that answered differently twice could not be snapped or dragged against. */
  it('answers the same boxes twice', () => {
    const root = screen([stack('s', [leaf('a'), leaf('b')], { direction: 'row' })])

    expect(layoutOf(root, VIEWPORT, measured)).toEqual(layoutOf(root, VIEWPORT, measured))
  })
})

describe('how big an element is', () => {
  it('takes the pixels it names', () => {
    expect(boxOf(screen([leaf('a', { size: sized(120, 40) })]), 'a')).toMatchObject({
      width: 120,
      height: 40,
    })
  })

  it('takes a share of its parent when it names a percentage', () => {
    expect(
      boxOf(screen([leaf('a', { size: { width: percent(25), height: percent(50) } })]), 'a'),
    ).toMatchObject({ width: 250, height: 250 })
  })

  it('fills what its parent leaves when it stretches', () => {
    const place: Partial<UiPlacement> = { size: { width: stretch, height: px(30) } }

    expect(boxOf(screen([leaf('a', place)]), 'a')).toMatchObject({ width: 1000, height: 30 })
  })

  it('asks the measure for a leaf that names no size', () => {
    expect(boxOf(screen([leaf('a')]), 'a')).toMatchObject({ width: 40, height: 20 })
  })

  it('takes what its children cover when a container names no size', () => {
    const inner = leaf('a', { size: sized(60, 30) })

    expect(boxOf(screen([panel('p', [inner])]), 'p')).toMatchObject({ width: 60, height: 30 })
  })

  it('holds itself to its bounds', () => {
    const small = { size: sized(500, 500), max: { width: 100, height: 80 } }
    const big = { size: sized(5, 5), min: { width: 50, height: 60 } }

    expect(boxOf(screen([leaf('a', small)]), 'a')).toMatchObject({ width: 100, height: 80 })
    expect(boxOf(screen([leaf('b', big)]), 'b')).toMatchObject({ width: 50, height: 60 })
  })

  /** A `max` of zero is no maximum: an element cannot be told to have no width. */
  it('reads a maximum of zero as no maximum at all', () => {
    expect(boxOf(screen([leaf('a', { size: sized(120, 40) })]), 'a')).toMatchObject({ width: 120 })
  })

  it('takes its height from its width when it names a ratio', () => {
    const place = { size: { width: px(160), height: px(999) }, aspect: 2 }

    expect(boxOf(screen([leaf('a', place)]), 'a')).toMatchObject({ width: 160, height: 80 })
  })
})

describe('where an element hangs', () => {
  it('sits at the corner it names, by the corner of itself it names', () => {
    const place: Partial<UiPlacement> = {
      size: sized(100, 50),
      anchor: 'bottomRight',
      pivot: 'bottomRight',
    }

    expect(boxOf(screen([leaf('a', place)]), 'a')).toEqual({
      x: 900,
      y: 450,
      width: 100,
      height: 50,
    })
  })

  it('centres on a point when its pivot is its middle', () => {
    const place: Partial<UiPlacement> = { size: sized(100, 50), anchor: 'center', pivot: 'center' }

    expect(boxOf(screen([leaf('a', place)]), 'a')).toEqual({
      x: 450,
      y: 225,
      width: 100,
      height: 50,
    })
  })

  it('moves by its offset, from wherever it hangs', () => {
    const place: Partial<UiPlacement> = {
      size: sized(10, 10),
      anchor: 'topRight',
      offset: { x: -30, y: 12 },
    }

    expect(boxOf(screen([leaf('a', place)]), 'a')).toMatchObject({ x: 970, y: 12 })
  })

  /**
   * The whole promise of an anchor: a HUD laid out for one screen keeps its corner on another,
   * with nothing recomputed in the document.
   */
  it('keeps a corner on a viewport of another shape', () => {
    const place: Partial<UiPlacement> = {
      size: sized(100, 50),
      anchor: 'bottomRight',
      pivot: 'bottomRight',
    }
    const root = screen([leaf('a', place)])

    expect(boxOf(root, 'a', { width: 640, height: 360 })).toEqual({
      x: 540,
      y: 310,
      width: 100,
      height: 50,
    })
  })

  it('is pushed in by its own margin', () => {
    const place = { size: sized(10, 10), margin: { top: 7, right: 0, bottom: 0, left: 5 } }

    expect(boxOf(screen([leaf('a', place)]), 'a')).toMatchObject({ x: 5, y: 7 })
  })

  it('hangs inside what the padding of its parent leaves', () => {
    const style = { ...DEFAULT_STYLE, padding: { top: 10, right: 20, bottom: 0, left: 30 } }
    const inner = leaf('a', { size: sized(10, 10), anchor: 'topRight', pivot: 'topRight' })
    const root = screen([panel('p', [inner], { size: sized(200, 100) }, style)])

    // The right edge lands on the padded edge — 200 less 20 — so the box starts ten before it.
    const box = boxOf(root, 'a')

    expect(box.x + box.width).toBe(180)
    expect(box).toMatchObject({ x: 170, y: 10 })
  })
})

describe('a stack', () => {
  const three = (over = {}, place = {}) =>
    screen([
      stack(
        's',
        [
          leaf('a', { size: sized(100, 20) }),
          leaf('b', { size: sized(100, 20) }),
          leaf('c', { size: sized(100, 20) }),
        ],
        { direction: 'row', gap: 10, ...over },
        { size: sized(500, 100), ...place },
      ),
    ])

  it('lays a row out left to right, with its gap between', () => {
    const root = three()

    expect(boxOf(root, 'a').x).toBe(0)
    expect(boxOf(root, 'b').x).toBe(110)
    expect(boxOf(root, 'c').x).toBe(220)
  })

  it('lays a column out top to bottom', () => {
    const root = three({ direction: 'column' })

    expect(boxOf(root, 'a').y).toBe(0)
    expect(boxOf(root, 'b').y).toBe(30)
  })

  it.each([
    ['start' as UiJustify, 0],
    ['center' as UiJustify, 90],
    ['end' as UiJustify, 180],
  ])('sets the line %s along the stack', (justify, first) => {
    expect(boxOf(three({ justify }), 'a').x).toBe(first)
  })

  it('spreads the slack between the children when told to', () => {
    const root = three({ justify: 'between' })

    expect(boxOf(root, 'a').x).toBe(0)
    expect(boxOf(root, 'c').x).toBe(400)
  })

  /** One line takes the whole cross room, so `align` sets a child against the CONTAINER. */
  it.each([
    ['start' as UiAlign, 0],
    ['center' as UiAlign, 40],
    ['end' as UiAlign, 80],
  ])('sets a child %s across the one line it has', (align, top) => {
    expect(boxOf(three({ align }), 'a').y).toBe(top)
  })

  it('stretches a child across the whole of a single line', () => {
    expect(boxOf(three({ align: 'stretch' }), 'a').height).toBe(100)
  })

  /**
   * 🛑 Several lines take what each HOLDS, not the container — and the rule reads the same in a
   * row and in a column. A column that stretched to the container instead overran every line
   * but the first, and its second line landed on top of the first.
   */
  it('gives each line its own thickness once it wraps, whichever way it runs', () => {
    const laid = (direction: 'row' | 'column') =>
      screen([
        stack(
          's',
          [leaf('a', { size: sized(30, 60) }), leaf('b', { size: sized(30, 60) })],
          { direction, gap: 0, wrap: true, align: 'stretch' },
          { size: sized(direction === 'row' ? 30 : 200, direction === 'row' ? 200 : 60) },
        ),
      ])

    expect(boxOf(laid('column'), 'b')).toMatchObject({ x: 30, width: 30 })
    expect(boxOf(laid('row'), 'b')).toMatchObject({ y: 60, height: 60 })
  })

  /** A spacer of grow 1 between two labels pushes them apart rather than squashing them. */
  it('shares what is left among the children that ask to grow', () => {
    const root = screen([
      stack(
        's',
        [
          leaf('a', { size: sized(100, 20) }),
          leaf('gap', { size: sized(0, 0), grow: 1 }),
          leaf('b', { size: sized(100, 20) }),
        ],
        { direction: 'row', gap: 0 },
        { size: sized(400, 100) },
      ),
    ])

    expect(boxOf(root, 'gap').width).toBe(200)
    expect(boxOf(root, 'b').x).toBe(300)
  })

  it('cuts into lines when told to wrap, and leaves them alone otherwise', () => {
    const wide = [1, 2, 3].map(one => leaf(`w${one}`, { size: sized(200, 20) }))
    const laid = (wrap: boolean) =>
      screen([stack('s', wide, { direction: 'row', gap: 0, wrap }, { size: sized(400, 100) })])

    expect(boxOf(laid(true), 'w3')).toMatchObject({ x: 0, y: 20 })
    expect(boxOf(laid(false), 'w3')).toMatchObject({ x: 400, y: 0 })
  })

  /** Wrapping one away would leave an empty line and the element nowhere. */
  it('keeps a child wider than the line on a line of its own', () => {
    const root = screen([
      stack(
        's',
        [leaf('a', { size: sized(600, 20) }), leaf('b', { size: sized(100, 20) })],
        { direction: 'row', gap: 0, wrap: true },
        { size: sized(400, 100) },
      ),
    ])

    expect(boxOf(root, 'a')).toMatchObject({ x: 0, y: 0 })
    expect(boxOf(root, 'b')).toMatchObject({ x: 0, y: 20 })
  })
})

describe('a grid', () => {
  const nine = (columns: number) =>
    screen([
      {
        ...shared,
        id: 'g',
        type: 'grid',
        grid: { columns, gap: 10, align: 'start' },
        children: [1, 2, 3, 4, 5].map(one => leaf(`c${one}`, { size: sized(50, 30) })),
        place: at({ size: sized(430, 200) }),
      },
    ])

  /** 430 less two gaps of 10, cut three ways: the column pitch is what the positions say. */
  it('cuts its width into equal columns, gaps taken out first', () => {
    const root = nine(3)

    expect(boxOf(root, 'c1').x).toBe(0)
    expect(boxOf(root, 'c2').x).toBeCloseTo(146.67, 1)
    expect(boxOf(root, 'c3').x).toBeCloseTo(293.33, 1)
  })

  /** A cell is only as wide as the column; what fills it is what `align` says. */
  it('leaves a child its own width, and gives it the column when told to stretch', () => {
    const held = (align: UiAlign): number => {
      const root = screen([
        {
          ...shared,
          id: 'g',
          type: 'grid',
          grid: { columns: 3, gap: 10, align },
          children: [leaf('c1', { size: sized(50, 30) })],
          place: at({ size: sized(430, 200) }),
        },
      ])
      return boxOf(root, 'c1').width
    }

    expect(held('start')).toBe(50)
    expect(held('stretch')).toBeCloseTo(136.67, 1)
  })

  it('starts a new row once the columns are full', () => {
    const root = nine(3)

    expect(boxOf(root, 'c4')).toMatchObject({ x: 0, y: 40 })
  })

  it('makes a row as tall as the tallest thing on it', () => {
    const root = screen([
      {
        ...shared,
        id: 'g',
        type: 'grid',
        grid: { columns: 2, gap: 0, align: 'start' },
        children: [leaf('a', { size: sized(10, 30) }), leaf('b', { size: sized(10, 90) })],
        place: at({ size: sized(100, 200) }),
      },
    ])

    expect(boxOf(root, 'a').height).toBe(30)
    expect(boxOf(root, 'b').height).toBe(90)
  })
})

/**
 * The six a review measured on 2026-08-28, each a way for a HUD to land somewhere nobody asked
 * for while every gate stayed green.
 */
