// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERACTION,
  DEFAULT_PLACEMENT,
  DEFAULT_STACK,
  DEFAULT_STYLE,
  DEFAULT_TEXT,
  SCREEN_PLACEMENT,
  type UiBox,
  type UiElement,
  type UiExtent,
  type UiPlacement,
  type UiScreen,
  type UiSize,
  type UiSizing,
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

describe('what a margin, a bound and a stretch owe each other', () => {
  it('keeps a stretched element inside its parent when it hangs on the right', () => {
    const place: Partial<UiPlacement> = {
      size: { width: stretch, height: px(20) },
      margin: { top: 0, right: 20, bottom: 0, left: 20 },
      anchor: 'topRight',
      pivot: 'topRight',
    }
    const box = boxOf(screen([leaf('a', place)]), 'a')

    expect(box).toMatchObject({ x: 20, width: 960 })
    expect(box.x + box.width).toBe(980)
  })

  it('holds a growing child to its maximum', () => {
    const root = screen([
      stack(
        's',
        [leaf('a', { size: sized(50, 20), max: { width: 80, height: 0 }, grow: 1 })],
        { direction: 'row', gap: 0 },
        { size: sized(400, 100) },
      ),
    ])

    expect(boxOf(root, 'a').width).toBe(80)
  })

  it('counts a margin along a stack, and pushes the child in by it', () => {
    const root = screen([
      stack(
        's',
        [
          leaf('a', { size: sized(50, 20), margin: { top: 0, right: 30, bottom: 0, left: 30 } }),
          leaf('b', { size: sized(50, 20) }),
        ],
        { direction: 'row', gap: 0 },
        { size: sized(400, 100) },
      ),
    ])

    expect(boxOf(root, 'a').x).toBe(30)
    expect(boxOf(root, 'b').x).toBe(110)
  })

  it('counts a margin inside a grid cell', () => {
    const root = screen([
      {
        ...shared,
        id: 'g',
        type: 'grid',
        grid: { columns: 2, gap: 0, align: 'start' },
        children: [
          leaf('a', { size: sized(20, 20), margin: { top: 5, right: 0, bottom: 0, left: 7 } }),
        ],
        place: at({ size: sized(200, 100) }),
      },
    ])

    expect(boxOf(root, 'a')).toMatchObject({ x: 7, y: 5 })
  })

  /** The author typed 200; the inspector, the pick and the renderer must all read 200. */
  it('lets a grid child wider than its column overflow rather than trimming it', () => {
    const root = screen([
      {
        ...shared,
        id: 'g',
        type: 'grid',
        grid: { columns: 4, gap: 0, align: 'start' },
        children: [leaf('a', { size: sized(200, 30) })],
        place: at({ size: sized(400, 100) }),
      },
    ])

    expect(boxOf(root, 'a').width).toBe(200)
  })

  /** Along a stack, stretching asks for a SHARE — taking the room whole stacked the siblings. */
  it('shares the room between two children that both stretch along the stack', () => {
    const wide: Partial<UiPlacement> = { size: { width: stretch, height: px(20) } }
    const root = screen([
      stack(
        's',
        [leaf('a', wide), leaf('b', wide)],
        { direction: 'row', gap: 0 },
        { size: sized(400, 100) },
      ),
    ])

    expect(boxOf(root, 'a')).toMatchObject({ x: 0, width: 200 })
    expect(boxOf(root, 'b')).toMatchObject({ x: 200, width: 200 })
  })
})
