import { describe, expect, it } from 'vitest'
import {
  AA_NON_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
  HOVER_IS_SEEN,
  hoverFor,
} from '@shared/domain/color'
import { THEME_ATTRIBUTE } from '@shared/domain/settings'
import { stylesheet } from '../indexCss-fixtures'

/**
 * The inks this rule holds. `accent` is absent because it is a fill, see below.
 *
 * The four status hues joined on 2026-08-12, when the palette decision they were waiting on was
 * taken: on the LIGHT theme they read 3.68, 3.27, 3.71 and 2.01 on the chassis — the last below
 * even the 3:1 WCAG 1.4.11 asks of a glyph — and each was moved toward black until it cleared.
 * `create` is held here although it also fills, because two sources write `text-create` — and a
 * green that carries a word at 4.5 carries the rail's white glyph well past the 3:1 of 1.4.11.
 * `create-hover` is NOT: it is the darker state of that fill, and no source writes a word in it.
 */
const INKS = ['text', 'muted', 'accent-ink', 'danger', 'warning', 'success', 'create']

/**
 * The three surfaces this rule covers — the ones a word sits on at rest.
 *
 * NOT every surface a word is read on, and the difference is measured: `muted` reads 3.25:1 on
 * `bg-accent-soft` and 3.51 on `bg-elevated` in the dark theme. Raising the token would move the
 * selection colour itself, so those two are answered a row at a time instead — `Row` lifts its
 * subtitle to `text` on exactly those states, and the rule below holds THAT pair.
 */
const READING_SURFACES = ['chassis', 'panel', 'surface']

const THEMES = [
  { name: 'dark', from: stylesheet.indexOf('@theme {') },
  { name: 'light', from: stylesheet.indexOf(`name: '${THEME_ATTRIBUTE.light}'`) },
]

/** The soft accent as DECLARED, which `palette` cannot return: it only reads hexadecimals. */
function softFill(from: number): string {
  return (
    /--color-accent-soft:\s*([^;]+);/.exec(
      stylesheet.slice(from).replace(/--color-accent:[^;]+;/, ''),
    )?.[1] ?? ''
  ).trim()
}

/** What a translucent fill actually shows, which is the only thing a contrast can be read on. */
function over(mix: string, surface: string): string {
  const share = Number(/(\d+)%/.exec(mix)?.[1] ?? 0) / 100
  const [ink, under] = [/#[0-9a-f]{6}/i.exec(mix)?.[0] ?? '', surface].map(hex =>
    [1, 3, 5].map(at => parseInt(hex.substr(at, 2), 16)),
  )

  return `#${(ink ?? [])
    .map((band = 0, at) =>
      Math.round(band * share + (under?.[at] ?? 0) * (1 - share))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

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

describe('the contrast of the inks', () => {
  for (const theme of THEMES) {
    it(`clears AA on every surface a word is read on, ${theme.name}`, () => {
      const tokens = palette(theme.from)
      // Both blocks are found and told apart, so neither list below can be silently empty.
      expect(theme.from).toBeGreaterThan(-1)
      expect([...INKS, ...READING_SURFACES].filter(name => !(name in tokens))).toEqual([])

      const failing = INKS.flatMap(ink =>
        READING_SURFACES.filter(
          surface => contrastRatio(tokens[ink] ?? '', tokens[surface] ?? '') < AA_NORMAL_TEXT,
        ).map(surface => `${ink} on ${surface}`),
      )

      expect(failing).toEqual([])
    })
  }

  /**
   * `error` is daisyUI's name for the red the studio calls `danger`, and the two are declared
   * apart — unlike `warning` and `success`, which are one variable serving both. Held equal here
   * rather than measured twice: a settings pane writing `text-error` and a job row writing
   * `text-danger` would otherwise drift into two reds, and only one of them would be covered above.
   */
  it('keeps daisyUI red and the studio red the same colour, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)

      // Read as a colour first, so two missing names cannot agree with each other.
      expect(tokens.danger).toMatch(/^#[0-9a-f]{6}$/)
      expect(tokens.error).toBe(tokens.danger)
    }
  })

  /**
   * The one blue, thinned — never a second one. Two hand-picked hexadecimals were rejected on
   * sight before this: any opaque value is a colour of its own however close the hue is, and the
   * eye reads the drop in saturation long before the drop in lightness.
   */
  it('draws the chosen-row fill from the accent itself, in both themes', () => {
    for (const theme of THEMES) {
      expect(softFill(theme.from)).toMatch(
        /^color-mix\(in srgb, var\(--color-accent\) \d{1,2}%, transparent\)$/,
      )
    }
  })

  /**
   * The two fills a list row takes, with the ink that sits on them — the soft one READ THROUGH,
   * since a translucent fill shows whatever it lies on. `muted` is not held here on purpose: it
   * sits under 4.5 on both, so `Row` lifts its subtitle to `text` on exactly these two states.
   */
  it('carries the full ink on the two backgrounds a row takes, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)
      const fills = [
        ...['panel', 'surface'].map(under => over(softFill(theme.from), tokens[under] ?? '')),
        tokens.elevated ?? '',
      ]

      expect(fills.filter(fill => contrastRatio(tokens.text ?? '', fill) < AA_NORMAL_TEXT)).toEqual(
        [],
      )
    }
  })

  /**
   * The green a sound clip is filled with, held against BOTH inks the strip paints on it: the
   * clip's name in `text`, at the 4.5 of WCAG 1.4.3, and its waveform in `muted`, at the 3 of
   * 1.4.11 — a shape rather than a word, and the one that decided how green the green could be.
   *
   * Measured rather than eyeballed because a canvas escapes every other rule in this file: the
   * painter reads these tokens through `engines/core/palette.ts`, so no class names them and no
   * sweep above composes them.
   */
  it('carries a sound clip the strip can be read on, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)
      const green = tokens['clip-audio'] ?? ''

      expect(green).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrastRatio(tokens.text ?? '', green)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      expect(contrastRatio(tokens.muted ?? '', green)).toBeGreaterThanOrEqual(AA_NON_TEXT)
    }
  })
})

describe('the contrast of level and axis inks', () => {
  /**
   * The calm end of the scale a meter paints a level on, held on BOTH grounds its canvases stand
   * on: the chassis under the programme wave, and the toolbar's own fill under the spectrum. The
   * other two bands are `warning` and `danger`, already measured as inks above; this one has no
   * sweep to fall under, being read by `engines/core/palette.ts` and named by no class.
   *
   * At the 3 of WCAG 1.4.11 rather than 4.5: a waveform and a meter bar are shapes that inform,
   * never words. Held apart from `create` too — one green meaning both "this is quiet" and "this
   * creates" is a green that cannot be moved for either.
   */
  it('carries a level a meter can be read at on both its grounds, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)
      const green = tokens['level-safe'] ?? ''

      expect(green).toMatch(/^#[0-9a-f]{6}$/)
      const failing = ['chassis', 'surface'].filter(
        ground => contrastRatio(green, tokens[ground] ?? '') < AA_NON_TEXT,
      )

      expect(failing).toEqual([])
      expect(green).not.toBe(tokens.create)
    }
  })

  /**
   * The three axis stripes, on the field each one edges. At the 3 of WCAG 1.4.11 rather than 4.5:
   * a stripe is a shape that informs, never a word — and the letter beside it says which axis it
   * is anyway, which is what keeps colour from being the only carrier (WCAG 1.4.1).
   *
   * ONE value serves both themes, and that is the point of measuring them together rather than a
   * theme at a time: the window where a colour clears 3:1 against `surface` dark AND light is
   * narrow, so a hue nudged for one theme is exactly how the other silently falls under.
   */
  it('carries three axis stripes readable on every fill a row can wear, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)
      const stripes = ['axis-x', 'axis-y', 'axis-z'].map(name => tokens[name] ?? '')

      expect(stripes.every(stripe => /^#[0-9a-f]{6}$/.test(stripe))).toBe(true)
      /**
       * BOTH sides of the stripe: it is the field's left border, so `surface` meets it on the
       * right and whatever fills the row meets it on the left — `panel`, the section's own.
       *
       * Reading `surface` alone is not enough, and that was measured rather than reasoned: a
       * zebra fill striping every other row `elevated` took the same three stripes to 2.34, 2.42
       * and 2.11 IN THE DARK THEME with this case still green — it clears 3 in the light one
       * (3.61, 3.50, 4.02), which is why the sweep runs over both. `elevated` is deliberately NOT
       * swept, since no property row wears it: a fill that brought it back would have to bring
       * its own measurement, of both themes.
       */
      const failing = ['panel', 'surface'].flatMap(ground =>
        stripes
          .filter(stripe => contrastRatio(stripe, tokens[ground] ?? '') < AA_NON_TEXT)
          .map(stripe => `${stripe} on ${ground}`),
      )

      expect(failing).toEqual([])
      // Three axes read as three only while no two of them are the same colour.
      expect(new Set(stripes).size).toBe(3)
    }
  })
})

describe('the contrast of action inks', () => {
  /**
   * The one ink in the studio that is darker than its fill on one theme and lighter on the other.
   * Held at AA rather than at the 3:1 of WCAG 1.4.11 that a glyph would need: the rail's plus is
   * a glyph today, and a token that only ever cleared the glyph bar would be the wrong thing to
   * hand the first label somebody writes on that button.
   */
  it('carries an ink the create button can be drawn in, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)

      expect(tokens['create-content']).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrastRatio(tokens['create-content'] ?? '', tokens.create ?? '')).toBeGreaterThan(
        AA_NORMAL_TEXT,
      )
    }
  })

  /**
   * The ink written ON the accent, which the sheet ships and `useAppearance` recomputes for a
   * picked one. Held here because the sheet's own answer has to be right too: the accent was
   * darkened to #336fe6 on 2026-08-12 for exactly this pair, white on it going 4.28 → 4.61.
   */
  it('carries an ink the accent can be written on, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)

      expect(tokens['accent-content']).toMatch(/^#[0-9a-f]{6}$/)
      expect(
        contrastRatio(tokens['accent-content'] ?? '', tokens.accent ?? ''),
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  /**
   * The other half of that pair, and it is the reason `rowSkin`'s loud fill swaps BOTH inks rather
   * than only the fill: the studio's ordinary ink does NOT clear the bar on the accent. Measured
   * rather than written in a comment beside the skin — a token nudged until `text` happened to pass
   * would leave `ROW_INK`'s variant looking like decoration.
   */
  it('leaves the ordinary ink unreadable on that same fill, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)

      expect(contrastRatio(tokens.text ?? '', tokens.accent ?? '')).toBeLessThan(AA_NORMAL_TEXT)
    }
  })

  /**
   * The same ink under the POINTER, which was nobody's question and is where it failed. The
   * primary button hovered at `bg-accent/85` — an alpha, so the surface showed through: it
   * darkened the blue on a dark panel and LIGHTENED it on a light one, taking the white label to
   * 3.52:1. A state a word cannot be read in is not a hover, and no ratio of this file saw it,
   * because every one of them measured a token and this colour was composed at paint time.
   *
   * The token is held to `hoverFor` rather than to a number: the sheet ships one accent and the
   * user may pick another, so a hand-written hex here would be right for exactly one of them.
   */
  it('carries a hover the accent keeps its ink on, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)
      const accent = tokens.accent ?? ''
      const hover = tokens['accent-hover'] ?? ''

      expect(hover).toBe(hoverFor(accent))
      expect(contrastRatio(tokens['accent-content'] ?? '', hover)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      )
      // And it is a hover at all — the fill has to move, or pointing at the button says nothing.
      expect(contrastRatio(accent, hover)).toBeGreaterThanOrEqual(HOVER_IS_SEEN)
    }
  })

  /**
   * The `create` pair the sheet writes BY HAND, held against the same function. It is what says
   * the step of `hoverFor` is the studio's own rather than a number fitted to the accent: a human
   * drew this green's hover by eye, in both themes, and the function lands on it to the byte.
   *
   * Read from the stylesheet and not recopied here, which is the difference between holding the
   * claim and restating it: the day the green moves, this is what says whether it still holds.
   */
  it('redraws the one hover pair a human picked, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)

      expect(tokens['create-hover']).toBe(hoverFor(tokens.create ?? ''))
    }
  })
})
