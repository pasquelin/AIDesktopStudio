import { describe, expect, it } from 'vitest'
import { AA_NON_TEXT, blend, contrastRatio } from '@shared/domain/color'
import { THEME_ATTRIBUTE } from '@shared/domain/settings'
import { stylesheet } from '../indexCss-fixtures'
import { WRITTEN_SOURCES } from './testHarness'

const THEMES = [
  { name: 'dark', from: stylesheet.indexOf('@theme {') },
  { name: 'light', from: stylesheet.indexOf(`name: '${THEME_ATTRIBUTE.light}'`) },
]

/**
 * Read per theme: the light theme restates every token, and an ink that clears its dark
 * background is exactly the wrong colour on the light one. The dark values are the reference and
 * live in `@theme`; the light ones restate them from its own daisyUI block onwards, so reading
 * from each starting point and keeping the FIRST value of each name gives that theme's palette.
 */
function palette(from: number): Record<string, string> {
  const found: Record<string, string> = {}
  for (const [, name = '', value = ''] of stylesheet
    .slice(from)
    .matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    found[name] ??= value
  }

  return found
}

/** A colour's hue in degrees — all this file needs of one, and it needs it for one rule. */
function hueOf(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
  const high = Math.max(r, g, b)
  const span = high - Math.min(r, g, b)
  if (span === 0) return 0

  const turn = high === r ? (g - b) / span : high === g ? 2 + (b - r) / span : 4 + (r - g) / span
  return (turn * 60 + 360) % 360
}

describe('the hue each section is inked in', () => {
  const SECTIONS = ['image', 'video', '3d', 'code', 'audio', 'skyboxes', 'materials']

  const GROUNDS = ['panel', 'surface', 'chassis']

  /**
   * 🛑 The SELECTED row is a ground too, and it is the one that was missed: `rowSkin` fills a
   * chosen row `bg-accent-soft`, the accent thinned over whatever is beneath, and the glyph goes
   * on wearing its section's hue on top. Every ground therefore counts twice.
   *
   * The share is READ per theme, never written here: the dark theme thins to 55 % and the light
   * to 22 %, so one number would measure a colour neither theme paints.
   */
  const softShareIn = (from: number): number =>
    Number(
      /--color-accent-soft:\s*color-mix\(in srgb, var\(--color-accent\) (\d+)%/.exec(
        stylesheet.slice(from),
      )?.[1] ?? 0,
    ) / 100

  for (const theme of THEMES) {
    it(`clears what a glyph owes, on every ground, ${theme.name}`, () => {
      const tokens = palette(theme.from)
      const share = softShareIn(theme.from)
      expect(share).toBeGreaterThan(0)

      const grounds = GROUNDS.flatMap((ground): [string, string][] => [
        [ground, tokens[ground] ?? ''],
        [`a chosen row over ${ground}`, blend(tokens.accent ?? '', tokens[ground] ?? '', share)],
      ])

      const under = SECTIONS.flatMap(section =>
        grounds
          .filter(
            ([, ground]) => contrastRatio(tokens[`domain-${section}`] ?? '', ground) < AA_NON_TEXT,
          )
          .map(([name]) => `domain-${section} on ${name}`),
      )

      expect(under).toEqual([])
    })
  }

  /**
   * The grid tints the FOLDER, so a section's ink becomes a GROUND — one the sweep above never
   * measures, its own being the panel's. The token is READ from the source: named here, this
   * would go on measuring chassis the day `EntryFace` wore something else.
   */
  for (const theme of THEMES) {
    it(`clears what the emblem of a tinted folder owes, ${theme.name}`, () => {
      const tokens = palette(theme.from)
      const face = WRITTEN_SOURCES.find(([path]) => path.endsWith('/EntryFace.tsx'))
      const [, written = ''] = /folder-emblem text-([^"\s]+)/.exec(face?.[1] ?? '') ?? []
      // Up to the quote rather than to the token name: `text-chassis/70` would otherwise be read
      // as `chassis` and measured at full opacity, which is the very thing this holds.
      expect(tokens[written]).toBeDefined()

      const under = SECTIONS.filter(
        section =>
          contrastRatio(tokens[written] ?? '', tokens[`domain-${section}`] ?? '') < AA_NON_TEXT,
      )

      expect(under).toEqual([])
    })
  }

  it('gives no section a hue the accent could be mistaken for', () => {
    const tokens = palette(THEMES[0]?.from ?? 0)
    const accent = hueOf(tokens.accent ?? '')

    const near = SECTIONS.filter(section => {
      const away = Math.abs(hueOf(tokens[`domain-${section}`] ?? '') - accent)
      return Math.min(away, 360 - away) <= 45
    })

    expect(near).toEqual([])
  })
})
