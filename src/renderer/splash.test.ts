import { describe, expect, it } from 'vitest'
import { SPLASH_BACKGROUND_COLOR } from '@shared/constants'
import icon from '../../build/icon.svg?raw'
import { stylesheet } from './src/indexCss-fixtures'
import splash from './splash.html?raw'

/**
 * The splash cannot import the token layer: it is a separate Vite entry under a
 * `default-src 'none'` CSP, and pulling in the stylesheet would defeat its whole purpose.
 * Its palette is copied by hand, so it is pinned here — adding a colour to the page without
 * declaring it below fails, which is what keeps the drift visible.
 *
 * The copies are compared to the sheet rather than trusted: this file used to state that the
 * comparison could not be automated, and it was written before the sheet was ever read as text.
 * It could, and the day the muted grey was raised for contrast the splash kept the old one.
 */
const FROM_TOKENS = [
  { value: '#dfe1e5', token: '--color-text' },
  { value: '#91959b', token: '--color-muted' },
  { value: '#34363a', token: '--color-border' },
  { value: '#346ef2', token: '--color-accent' },
  { value: '#6193f3', token: '--color-accent-ink' },
  { value: '#202124', token: '--color-surface' },
  { value: '#191a1c', token: '--color-panel' },
]

function reference(): string {
  const [block = ''] = stylesheet.slice(stylesheet.indexOf('@theme {')).split('\n}')

  return block
}

/**
 * READ from build/icon.svg rather than restated, so the splash and the Dock icon read as one
 * object. A hand-copied list held three greys and went stale the day the mark became a robot.
 */
const ICON_COLOURS = icon.match(/#[0-9a-fA-F]{6}\b/g) ?? []

/**
 * Every drawn shape of an SVG source, whitespace collapsed so an indent or a Prettier-inserted
 * space before `/>` is not read as a different mark.
 */
const shapesOf = (svg: string): string[] =>
  (svg.match(/<(?:path|circle|rect)\b[^>]*>/g) ?? []).map(shape =>
    shape.replace(/\s+/g, ' ').replace(' />', '/>'),
  )

describe('splash palette', () => {
  for (const { value, token } of FROM_TOKENS) {
    it(`still carries ${token}`, () => {
      expect(splash).toContain(value)
    })

    // The `@theme` block alone, which holds the dark reference: `--color-accent` is restated
    // with the same value in two daisyUI blocks, so a search of the whole sheet would still find
    // the old one after the reference had moved on.
    it(`copies what ${token} is worth today`, () => {
      expect(reference()).toContain(`${token}: ${value};`)
    })
  }

  /**
   * The window is created with that colour so the first frame is not a flash, and it was left on
   * the old gradient's middle stop when this page went flat — grey for a few frames, then the
   * page. It is a copy of what the sheet below paints, so it is pinned to it.
   */
  it('is what the window paints before the page does', () => {
    expect(splash).toContain(SPLASH_BACKGROUND_COLOR.dark)
    expect(splash).toContain(SPLASH_BACKGROUND_COLOR.light)
  })

  it('introduces no colour beyond the tokens and the icon', () => {
    const allowed = new Set([...ICON_COLOURS, ...FROM_TOKENS.map(({ value }) => value)])
    const used = new Set(splash.match(/#[0-9a-fA-F]{6}\b/g) ?? [])

    expect([...used].filter(colour => !allowed.has(colour))).toEqual([])
  })

  // An empty allow-list would let the case above pass on any splash at all: the icon has to have
  // been READ for reading it to prove anything.
  it('reads the icon it compares against', () => {
    expect(ICON_COLOURS.length).toBeGreaterThan(3)
  })
})

describe('splash mark', () => {
  /**
   * The colours alone left the GEOMETRY compared to nothing: a redrawn icon kept its palette and
   * the splash kept the old letters, silently. The tile is the icon's alone — this surface paints
   * it — so the mark is contained BY the icon rather than equal to it.
   */
  it('draws the shapes the icon draws', () => {
    expect(shapesOf(icon)).toEqual(expect.arrayContaining(shapesOf(splash)))
  })

  // Containment holds trivially on a splash that draws nothing at all.
  it('draws a mark rather than nothing', () => {
    expect(shapesOf(splash).length).toBeGreaterThan(2)
  })
})
