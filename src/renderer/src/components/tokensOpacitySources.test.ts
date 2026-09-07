import { describe, expect, it } from 'vitest'
import { AA_NON_TEXT, AA_NORMAL_TEXT, blend, contrastRatio } from '@shared/domain/color'
import { THEME_ATTRIBUTE } from '@shared/domain/settings'
import { stylesheet } from '../indexCss-fixtures'
import { WRITTEN_SOURCES } from './testHarness'

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

const THEMES = [
  { name: 'dark', from: stylesheet.indexOf('@theme {') },
  { name: 'light', from: stylesheet.indexOf(`name: '${THEME_ATTRIBUTE.light}'`) },
]

/**
 * The three surfaces this rule covers — the ones a word sits on at rest.
 *
 * NOT every surface a word is read on, and the difference is measured: `muted` reads 3.25:1 on
 * `bg-accent-soft` and 3.51 on `bg-elevated` in the dark theme. Raising the token would move the
 * selection colour itself, so those two are answered a row at a time instead — `Row` lifts its
 * subtitle to `text` on exactly those states, and the rule below holds THAT pair.
 */
const READING_SURFACES = ['chassis', 'panel', 'surface']

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
 * Where each token is read — **the single table both rules below derive from**, so a token cannot
 * be captured without a background to compose it on, nor given one nothing captures.
 *
 * It was two lists that had to be edited together, which `CLAUDE.md` documented as a trap rather
 * than closing: completing one without the other left the sweep green in silence. Deriving the
 * spellings from the keys makes that impossible to write.
 *
 * The vocabulary decides the background, and that is the design-system boundary: daisyUI's
 * `base-*` belongs to the app windows — settings, usage — and the studio's own tokens to the docks.
 *
 * `accent` is here for the FILL rule and only reachable by it: it is the one token that is a fill
 * rather than an ink, so no source may write it as a word — a separate rule refuses `text-accent`
 * outright — but `bg-accent/30` would be a shape like any other.
 */
const SURFACES_OF: Record<string, string[]> = {
  // `chassis` among them since 2026-09-03: an app window grounds on the studio's chassis — see
  // `WindowShell` — so DaisyUI's ink now lands on a surface its own ladder never names.
  'base-content': ['base-100', 'base-200', 'base-300', 'chassis'],
  ...Object.fromEntries([...INKS, 'accent'].map(ink => [ink, READING_SURFACES])),
}

const VOCABULARY = Object.keys(SURFACES_OF).join('|')

/**
 * `text-muted/70`, `fill-base-content/60` — a token painting a WORD, at an opacity.
 *
 * `fill-` and `stroke-` are here because SVG paints its text with them, and that is not a
 * hypothetical: a chart's graduations were written `fill-base-content/60` and read **3.86:1** on a
 * light `base-300`. Two guards walked past them for reading `text-` alone.
 */
const ALPHA_INK = new RegExp(String.raw`\b(?:text|fill|stroke)-(${VOCABULARY})\/(\d{1,3})\b`, 'g')

/**
 * `bg-muted/40`, `border-create/40` — a token drawing a SHAPE, at an opacity.
 *
 * A separate family, and not the sweep above wearing another hat: that one asks what a WORD reads
 * at, this one what a SHAPE reads at, and they answer to different lines of WCAG. The carousel's
 * unread pagination dots were `bg-muted/40` and stood at 1.99:1 on a panel — a control saying how
 * many pages there are, and how many of them you can see.
 *
 * The vocabulary is the table's, deliberately: `bg-panel/80` and `bg-chassis/75` are SCRIMS — a
 * surface token spent as a translucent surface, which is what a scrim is — and holding them to a
 * contrast bar would be measuring the wrong thing entirely. `from-black/85` names no token at all.
 */
const ALPHA_FILL = new RegExp(
  String.raw`\b(?:bg|border|border-[trblxy]|ring|outline|divide|from|via|to)-(${VOCABULARY})\/(\d{1,3})\b`,
  'g',
)

/**
 * The one site that spends an ink as a translucent fill and may.
 *
 * Spotlight tints its leading slide `bg-create/15` inside a `border-create/40`, both around 2:1 —
 * and neither carries the state alone: the same card's icon turns `text-create` at FULL token
 * when it leads, and `INKS` above holds that at 4.5. The band is emphasis on a state something
 * else already states, which is the same reading `DECORATIVE_GLYPHS` takes of a placeholder.
 */
const ALPHA_FILL_ALLOWED: Record<string, string> = {
  '/SpotlightCard.tsx': 'a tint on a state its own icon states at full `create`',
}

/**
 * Two placeholders, exempt and measured: a crossed-out image on an empty thumbnail (1.65:1 at
 * `/30`) and the large glyph of an empty state (1.96 at `/40`).
 *
 * They carry no information a word does not already carry beside them — `EmptyState` renders its
 * sentence in full `muted` right under the glyph, and on a thumbnail the ABSENCE of a picture is
 * itself the message. **Raising them would say the placeholder is the message.**
 *
 * `MediaTile` was on this list and had no business being here: its glyph is `assetIcon(type)`,
 * so it says whether a tile holds a mesh or a sound, and nothing else on the tile does — the
 * caption is the asset's name and the badge is its sync state. It is measured below instead.
 */
const DECORATIVE_GLYPHS = ['/Thumbnail.tsx', '/EmptyState.tsx']

/**
 * A glyph that INFORMS, held at the 3:1 of WCAG 1.4.11 rather than the 4.5 of a word. Two sites:
 * the type icon a media tile falls back to while its poster is being made, and the folder shape
 * an explorer tile is drawn as — which IS the message, the name under it saying nothing about
 * whether the tile is a folder or a file.
 */
const INFORMATIVE_GLYPHS = ['/MediaTile.tsx', '/EntryFace.tsx']

/**
 * Every token written at an opacity, composed on the surfaces of its vocabulary and measured
 * against the bar the caller's rule asks for. `barFor` answers `null` for a path that is exempt.
 *
 * ONE sweep for the words and the shapes, because the two rules differ in DATA and nowhere else —
 * which spelling paints, and what bar it owes. They were written twice and had already drifted in
 * the hour it took to review them: the second read `READING_SURFACES` where the first read
 * `SURFACES_OF`, so a `bg-danger/40` in a settings pane would have been measured on a dock.
 *
 * Taken as a function so a rule can be run against a source known to FAIL, which is what tells a
 * reader it measures anything at all.
 */
function alphaFailures(
  sources: readonly (readonly [string, string])[],
  spelling: RegExp,
  barFor: (path: string) => number | null,
): string[] {
  const failing: string[] = []

  for (const theme of THEMES) {
    const tokens = palette(theme.from)

    for (const [path, source] of sources) {
      const bar = barFor(path)
      if (bar === null) continue

      for (const [, ink = '', percent = ''] of source.matchAll(spelling)) {
        for (const surface of SURFACES_OF[ink] ?? []) {
          const seen = blend(tokens[ink] ?? '', tokens[surface] ?? '', Number(percent) / 100)
          if (contrastRatio(seen, tokens[surface] ?? '') < bar) {
            failing.push(`${path} ${ink}/${percent} on ${surface}`)
          }
        }
      }
    }
  }

  return failing
}

/** A word written at an opacity: 4.5, or 3 for the one glyph that informs, or exempt. */
function inkFailures(sources: readonly (readonly [string, string])[]): string[] {
  return alphaFailures(sources, ALPHA_INK, path => {
    if (DECORATIVE_GLYPHS.some(one => path.endsWith(one))) return null
    return INFORMATIVE_GLYPHS.some(one => path.endsWith(one)) ? AA_NON_TEXT : AA_NORMAL_TEXT
  })
}

/** A shape drawn at an opacity: the 3:1 of WCAG 1.4.11, or exempt. */
function fillFailures(sources: readonly (readonly [string, string])[]): string[] {
  return alphaFailures(sources, ALPHA_FILL, path =>
    Object.keys(ALPHA_FILL_ALLOWED).some(one => path.endsWith(one)) ? null : AA_NON_TEXT,
  )
}

describe('the contrast of the inks', () => {
  /**
   * An alpha of the accent lets the surface through, and that is the whole defect above. Every
   * state, not just `hover:` — `active:bg-accent/85` on a primary toggle replays it exactly.
   */
  it('leaves no source taking a state of the accent through an alpha', () => {
    const throughAnAlpha = /\b(hover|active|focus|focus-visible|group-hover)[^\s'"]*:bg-accent\/\d/

    const offenders = WRITTEN_SOURCES.filter(([, source]) => throughAnAlpha.test(source)).map(
      ([path]) => path,
    )

    expect(offenders).toEqual([])
    // The rule refuses something, which a sweep that only ever returns nothing cannot show.
    expect(throughAnAlpha.test("'hover:bg-accent/85'")).toBe(true)
    expect(throughAnAlpha.test("'active:bg-accent/85'")).toBe(true)
    expect(throughAnAlpha.test("'hover:bg-accent-hover'")).toBe(false)
  })

  /**
   * The accent as a CONTROL against the surfaces it is drawn over — the title bar's drop target,
   * which rings the space a dragged pill would land in, and which is the only thing saying that
   * the drop will be taken. WCAG 1.4.11 asks 3:1 of it, and that is the second bar the accent is
   * pinned between: white on it needs the blue dark, a line drawn in it needs the blue light.
   *
   * The focus ring was this bar's first holder and is gone since 2026-08-15
   * (`design/no-focus-ring.test.ts`). The measurement stayed: the accent is still drawn as a
   * line, and a bar that outlives the reason it was written is a bar that has to name a new one.
   *
   * **Written because the pair went unmeasured and broke.** On 2026-08-12 the accent was darkened
   * to #336fe6 for the ink alone, taking the ring to 2.997 — under the bar, and recorded in a
   * comment as "3.00, exactly the 3:1", because two decimals hid the crossing. A ratio that a
   * human rounds is a ratio no one is holding.
   */
  it('stays visible as a control on every surface it is drawn over, in both themes', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)

      const failing = READING_SURFACES.filter(
        surface => contrastRatio(tokens.accent ?? '', tokens[surface] ?? '') < AA_NON_TEXT,
      )

      expect(failing).toEqual([])
    }
  })

  /**
   * A white written outright cannot follow a picked accent: on a yellow one it reads 1.71:1, and
   * the token exists so that it does follow. `MediaTile` is the one exemption and it is not an
   * accent case — its caption sits on a PICTURE, contrasted by the gradient beneath it.
   */
  it('leaves no white written by hand where a token would follow the accent', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !path.endsWith('/MediaTile.tsx') && /\btext-white(?![\w-])/.test(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })
})

describe('the contrast of translucent inks', () => {
  /**
   * The inks written with an ALPHA, composed on their fill before being measured — the only way
   * to see them at all. `text-muted/70` is not a colour, it is an instruction, and a ratio taken
   * on `muted` alone answers 5.79 where the reader sees 3.50.
   *
   * **This is the angle every guard of this repository was blind to until 2026-08-12**, and it
   * held two real defects: `WINDOW_CAPTION` at `/60` read 3.86:1 on a light `base-300`, and a
   * journal detail at `text-muted/70` failed in BOTH themes. Fourteen iterations measured opaque
   * tokens and found neither.
   *
   * Each vocabulary is composed on its own surfaces: daisyUI's `base-content` belongs to the app
   * windows, the studio's inks to the docks — the boundary `CLAUDE.md` draws.
   */
  it('clears its bar once composed, wherever an ink is written with an alpha', () => {
    expect(inkFailures(WRITTEN_SOURCES)).toEqual([])
  })

  /**
   * The sweep run against a source that is KNOWN bad — the exact state `windowStyles.ts` was in
   * before this batch. Without it, five one-line edits leave the rule green while it measures
   * nothing: `alpha = 1`, an emptied `SURFACES_OF`, the threshold lowered to the glyph bar, a path
   * added to the exemptions. A rule that cannot be shown to refuse anything refuses nothing.
   */
  it('refuses an ink that fails, which is the only way to know it measures at all', () => {
    const bad = inkFailures([['./probe.ts', "'text-base-content/60 text-xs'"]])

    expect(bad).toContain('./probe.ts base-content/60 on base-300')
    // And the same ink one step up passes, so the probe proves the threshold, not the sweep.
    expect(inkFailures([['./probe.ts', "'text-base-content/70'"]])).toEqual([])
  })

  /**
   * The shapes, where the sweep above holds the words. A control identified by nothing but a
   * translucent ink is a control a reader has to guess at — WCAG 1.4.11, 3:1, and the carousel's
   * pagination dots stood at 1.99 on a panel and 1.82 on a light one.
   */
  it('clears the 3:1 of a shape, wherever an ink is spent as a translucent fill', () => {
    expect(fillFailures(WRITTEN_SOURCES)).toEqual([])
  })

  it('refuses a fill that fails, and takes a scrim for what it is', () => {
    // The exact class the dots carried, and the ratio that closed this batch.
    expect(fillFailures([['./probe.tsx', "'bg-muted/40'"]])).toContain(
      './probe.tsx muted/40 on panel',
    )
    expect(fillFailures([['./probe.tsx', "'bg-muted'"]])).toEqual([])
    // A surface token spent as a translucent surface is a scrim, and owes no ratio.
    expect(fillFailures([['./probe.tsx', "'bg-panel/80 bg-chassis/75'"]])).toEqual([])
    // Nor does a gradient stop that names no token at all.
    expect(fillFailures([['./probe.tsx', "'from-black/85 via-black/45'"]])).toEqual([])
    // The spellings a first draft of this rule missed, each a way to draw the same shape.
    expect(fillFailures([['./probe.tsx', "'ring-muted/40'"]])).not.toEqual([])
    expect(fillFailures([['./probe.tsx', "'border-l-create/20'"]])).not.toEqual([])
    // `accent` is in the table for THIS rule alone and no source spends it yet, so without a probe
    // its entry could be deleted with every test still green — measured, it survived that mutant.
    expect(fillFailures([['./probe.tsx', "'bg-accent/30'"]])).not.toEqual([])
  })

  /**
   * The exemption, held by REPLAYING the rule rather than by asking whether the file still writes
   * an opacity. The difference is the whole value: Spotlight raised to 3:1 would keep an exemption
   * it no longer needs, and that exemption would silently cover the next translucent fill added
   * beside it — the exemption being by FILE, not by class.
   */
  it('carries no fill exemption for a source the rule would now pass', () => {
    const stale = Object.keys(ALPHA_FILL_ALLOWED).filter(
      one =>
        !WRITTEN_SOURCES.some(
          ([path, source]) =>
            path.endsWith(one) &&
            alphaFailures([['probe', source]], ALPHA_FILL, () => AA_NON_TEXT).length,
        ),
    )

    expect(stale).toEqual([])
    expect(Object.values(ALPHA_FILL_ALLOWED).filter(one => one.length < 20)).toEqual([])
  })
})
