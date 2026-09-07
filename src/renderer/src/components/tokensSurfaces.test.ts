import { describe, expect, it } from 'vitest'
import { AA_NON_TEXT, blend, contrastRatio, HOVER_IS_SEEN } from '@shared/domain/color'
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

describe('the selection of the take editor', () => {
  const VEIL =
    /--color-accent-veil:\s*color-mix\(in srgb, var\(--color-accent\) (\d+)%, transparent\)/

  it('carries its state on edges at the full accent, the veil being what the wave shows through', () => {
    const [, percent = ''] = stylesheet.match(VEIL) ?? []
    // Read from the sheet, never recopied: a veil composed at an alpha nobody measures is the
    // defect this whole file exists to refuse.
    expect(percent).toMatch(/^\d+$/)

    for (const theme of THEMES) {
      const tokens = palette(theme.from)
      const veiled = blend(tokens.accent ?? '', tokens.chassis ?? '', Number(percent) / 100)

      // The edges, at the bar a control owes — the same one the accent answers as a line.
      expect(contrastRatio(tokens.accent ?? '', tokens.chassis ?? '')).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      )
      // The veil, which does NOT reach it. Written as a measurement rather than left unsaid:
      // this is the fact the edges exist for, and raising the alpha would not fix it.
      expect(contrastRatio(veiled, tokens.chassis ?? '')).toBeLessThan(AA_NON_TEXT)
      // And what the veil is for: the wave under it stays a shape one can still read.
      expect(contrastRatio(tokens.muted ?? '', veiled)).toBeGreaterThanOrEqual(AA_NON_TEXT)
    }
  })

  /**
   * The edges and their colour are joined by a class name and a shadow part, and by nothing a
   * compiler can follow: rename either and the border quietly falls back to the plugin's own
   * black, with every suite green — the failure `--sc-tooltip` taught this file.
   */
  it('is joined to its surface by a class the editor actually writes', () => {
    const editor = WRITTEN_SOURCES.find(([path]) => path.endsWith('/TakeEditor.tsx'))

    expect(editor?.[1]).toContain('sc-wave')
    expect(stylesheet).toContain('.sc-wave div::part(region-handle-left)')
  })

  /**
   * Tailwind prunes the `@theme` variables nothing names, and this one is never a class: it is
   * read by NAME in JavaScript. Composing that name would drop the declaration from `:root`
   * altogether, and the editor would hand the region an empty string — an invisible selection,
   * with nothing on screen or in a suite to say why.
   */
  it('names the veil in full somewhere, which is what keeps it in the sheet at all', () => {
    const written = WRITTEN_SOURCES.filter(([, source]) => source.includes("'--color-accent-veil'"))

    expect(written).not.toEqual([])
  })
})
describe('what an app window lays on its ground', () => {
  const SPEAKS_THE_WINDOW_VOCABULARY = /from '@\/components\/windowStyles'/

  /** `transparent` is the absence of a fill, which no contrast describes. Nothing else may skip. */
  const NOT_A_FILL = ['transparent']

  const laid = [
    ...new Set(
      WRITTEN_SOURCES.filter(
        ([path, source]) =>
          path.endsWith('/windowStyles.ts') || SPEAKS_THE_WINDOW_VOCABULARY.test(source),
      ).flatMap(([, source]) => [
        ...[...source.matchAll(/hover:bg-([a-z][a-z0-9-]*)/g)].flatMap(([, name]) => name ?? []),
        // The rule between two rows, and `base-\d00` rather than any name: `border-` is also
        // Tailwind's width and side scale, where `border-b` and `border-none` name no colour.
        ...[...source.matchAll(/border-(base-\d00)/g)].flatMap(([, name]) => name ?? []),
      ]),
    ),
  ].filter(name => !NOT_A_FILL.includes(name))

  it('finds what is laid at all, so the rules below cannot pass on an empty list', () => {
    expect(laid).toContain('base-200')
    expect(laid).toContain('base-300')
  })

  for (const theme of THEMES) {
    /**
     * An unresolved name fails rather than falling through: `contrastRatio` answers `NaN` for a
     * token the palette has no hexadecimal for, and `NaN < HOVER_IS_SEEN` is false — a misspelt
     * fill would have left the one guard written to measure fills green.
     */
    it(`is seen on the chassis these windows stand on, ${theme.name}`, () => {
      const tokens = palette(theme.from)
      const unseen = laid.filter(name => {
        const ratio = contrastRatio(tokens[name] ?? '', tokens['chassis'] ?? '')
        return !(ratio >= HOVER_IS_SEEN)
      })

      expect(unseen).toEqual([])
    })
  }
})
