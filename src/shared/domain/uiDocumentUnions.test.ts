import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERACTION,
  DEFAULT_PLACEMENT,
  DEFAULT_STYLE,
  HOLDS_CHILDREN,
  UI_ALIGNS,
  UI_ANCHORS,
  UI_CURSORS,
  UI_ELEMENT_TYPES,
  UI_FITS,
  UI_JUSTIFIES,
  UI_MODES,
  UI_SCROLL_AXES,
  UI_TEXT_ALIGNS,
  type UiAlign,
  type UiAnchor,
  type UiCursor,
  type UiElement,
  type UiElementType,
  type UiFit,
  type UiImage,
  type UiJustify,
  type UiMode,
  type UiScrollAxis,
  type UiStack,
  type UiText,
  type UiTextAlign,
} from './ui'

/** Named in order, so a failure says WHICH element rather than which uuid. */
function ids(): () => string {
  let next = 0
  return () => `e${(next += 1)}`
}

const TEXT: UiText = {
  value: '',
  font: { source: 'embedded', family: 'Lato' },
  size: 24,
  weight: 700,
  align: 'center',
  color: '#00ff00',
  wrap: false,
}

const IMAGE: UiImage = { assetId: '', fit: 'cover', tint: '#ff00ff' }

const STACK: UiStack = {
  direction: 'row',
  gap: 16,
  align: 'center',
  justify: 'between',
  wrap: true,
}

/** One element of every type, each carrying something of its own to lose. */
function sample(type: UiElementType, newId: () => string): UiElement {
  const base = baseSample(type, newId)
  if (type === 'screen') return { ...base, type, children: [] }
  if (type === 'stack') return { ...base, type, stack: STACK, children: [] }
  if (type === 'grid') {
    return { ...base, type, grid: { columns: 3, gap: 4, align: 'center' }, children: [] }
  }
  if (type === 'scroll') return { ...base, type, scroll: { axis: 'both' }, children: [] }
  if (type === 'button') return { ...base, type, text: { ...TEXT, value: 'Play' }, children: [] }
  return leafSample(type, base)
}

function baseSample(type: UiElementType, newId: () => string) {
  return {
    id: newId(),
    name: `a ${type}`,
    visible: false,
    enabled: false,
    locked: true,
    place: { ...DEFAULT_PLACEMENT, offset: { x: 12, y: 34 }, grow: 2 },
    style: { ...DEFAULT_STYLE, opacity: 0.5 },
    interaction: { ...DEFAULT_INTERACTION, action: 'poke', focusable: true },
  }
}

function leafSample(type: UiElementType, base: ReturnType<typeof baseSample>): UiElement {
  if (type === 'text') return { ...base, type, text: { ...TEXT, value: 'Score' } }
  if (type === 'image') return { ...base, type, image: { ...IMAGE, assetId: 'asset_1' } }
  if (type === 'progress') {
    return {
      ...base,
      type,
      progress: { value: 0.25, min: 0, max: 1, fill: '#ff0000', track: '#111111' },
    }
  }
  if (type === 'slider') return { ...base, type, slider: { value: 3, min: 0, max: 10, step: 0.5 } }
  if (type === 'input') {
    return {
      ...base,
      type,
      input: { value: 'x', placeholder: 'name', maxLength: 12, secret: true },
    }
  }
  if (type === 'checkbox') return { ...base, type, checkbox: { checked: true } }
  if (type === 'spacer') return { ...base, type }

  return { ...base, type: 'panel', children: [] }
}

describe('every union of the format', () => {
  it('lists every member it declares', () => {
    const modes: Record<UiMode, true> = { screen: true, world: true }
    const types: Record<UiElementType, true> = {
      screen: true,
      panel: true,
      stack: true,
      grid: true,
      scroll: true,
      spacer: true,
      text: true,
      image: true,
      button: true,
      progress: true,
      slider: true,
      input: true,
      checkbox: true,
    }

    expect([...UI_MODES].sort()).toEqual(Object.keys(modes).sort())
    expect([...UI_ELEMENT_TYPES].sort()).toEqual(Object.keys(types).sort())
  })

  it('lists every placement option it declares', () => {
    const anchors: Record<UiAnchor, true> = {
      topLeft: true,
      top: true,
      topRight: true,
      left: true,
      center: true,
      right: true,
      bottomLeft: true,
      bottom: true,
      bottomRight: true,
    }
    const aligns: Record<UiAlign, true> = { start: true, center: true, end: true, stretch: true }
    const justifies: Record<UiJustify, true> = {
      start: true,
      center: true,
      end: true,
      between: true,
      around: true,
    }
    const fits: Record<UiFit, true> = { contain: true, cover: true, fill: true, none: true }
    const cursors: Record<UiCursor, true> = {
      default: true,
      pointer: true,
      text: true,
      notAllowed: true,
    }
    const textAligns: Record<UiTextAlign, true> = { left: true, center: true, right: true }
    const axes: Record<UiScrollAxis, true> = { vertical: true, horizontal: true, both: true }

    expect([...UI_ANCHORS].sort()).toEqual(Object.keys(anchors).sort())
    expect([...UI_ALIGNS].sort()).toEqual(Object.keys(aligns).sort())
    expect([...UI_JUSTIFIES].sort()).toEqual(Object.keys(justifies).sort())
    expect([...UI_FITS].sort()).toEqual(Object.keys(fits).sort())
    expect([...UI_CURSORS].sort()).toEqual(Object.keys(cursors).sort())
    expect([...UI_TEXT_ALIGNS].sort()).toEqual(Object.keys(textAligns).sort())
    expect([...UI_SCROLL_AXES].sort()).toEqual(Object.keys(axes).sort())
  })

  /**
   * `HOLDS_CHILDREN` is a `Record`, so the compiler already refuses a type that answers nothing.
   * What it cannot refuse is a WRONG answer, and one costs the children of every such element.
   */
  it('agrees with what each type carries', () => {
    const carrying = UI_ELEMENT_TYPES.filter(type => 'children' in sample(type, ids()))

    expect(carrying.filter(type => !HOLDS_CHILDREN[type])).toEqual([])
    expect(
      UI_ELEMENT_TYPES.filter(type => HOLDS_CHILDREN[type] && !carrying.includes(type)),
    ).toEqual([])
  })
})
