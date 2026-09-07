import { describe, expect, it } from 'vitest'
import { AA_NON_TEXT, contrastRatio } from '@shared/domain/color'
import { THEME_ATTRIBUTE } from '@shared/domain/settings'
import { stylesheet } from '../indexCss-fixtures'
import { WRITTEN_SOURCES } from './testHarness'

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

function dimmingPercent(fraction = '', unit = '', step = ''): number {
  if (!fraction) return Number(step)

  return unit ? Number(fraction) : Number(fraction) * 100
}

/**
 * `opacity-70`, `hover:opacity-90`, and Tailwind's arbitrary `opacity-[0.7]` — a dimming written
 * on an element. The arbitrary form is a FRACTION, so it is read apart: a regex that swallowed
 * both spellings as digits read `[0.7]` as `0` and let it through as a reveal.
 */
const DIMMING = /\bopacity-(?:\[([0-9.]+)(%?)\]|(\d{1,3}))/g

const VOCABULARY = Object.keys(SURFACES_OF).join('|')

/**
 * A partial opacity, on a source that has not said why.
 *
 * **This is the third angle, and it is the one the two above cannot reach.** `text-muted/70`
 * names its ink, so the sweep can compose it; `opacity-70` names nothing — it dims whatever the
 * element inherits, and what that is lives on an ancestor no text can follow. A file-level guard
 * that tried to read colour through it was written and RETIRED on 2026-08-12, proven to catch
 * none of the five defects it was written for.
 *
 * So this holds the only thing a text can hold, and says so: **no site dims without a reason.**
 * It is what would have caught the price inside the primary button — white at `opacity-70` on
 * the accent, 3.03:1 at rest — which is neither an ink with an alpha nor a token, and which
 * fourteen iterations and two guards walked past.
 *
 * `opacity-0` and `opacity-100` are not dimmings but reveals, and a `disabled` on the same line
 * is WCAG 1.4.3's own exemption: a control that refuses the click owes no ratio.
 *
 * Comments are cut away first, and that is not a detail: this rule flagged its OWN explanation
 * and the one in `styles.ts` on its first run. A guard that reddens when somebody writes down why
 * is a guard that teaches people to stop writing down why.
 *
 * **What it does NOT hold**, so nobody reads it as more than it is: `style={{ opacity: 0.7 }}`
 * writes no class and is invisible to it; `disabled` is looked for on the LINE, so an unrelated
 * `disabled &&` on a long `cn()` call excuses a dimming beside it; and an exemption is by FILE,
 * so a second dimming added to `Tree.tsx` inherits the first one's reason. None of the three
 * has a live case today — the renderer's sixteen `opacity-N` sites were read one by one.
 */
function dimmedWithoutReason(sources: readonly (readonly [string, string])[]): string[] {
  const offenders: string[] = []

  for (const [path, source] of sources) {
    if (Object.keys(DIMMING_ALLOWED).some(one => path.endsWith(one))) continue

    const written = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

    for (const line of written.split('\n')) {
      if (/\bdisabled\b/.test(line)) continue

      for (const [, fraction, unit, step] of line.matchAll(DIMMING)) {
        const percent = dimmingPercent(fraction, unit, step)
        if (percent > 0 && percent < 100) offenders.push(`${path} opacity-${percent}`)
      }
    }
  }

  return offenders
}

/**
 * The sites that dim without a `disabled` beside them, each with the reason it may.
 *
 * Kept as paths rather than folded into the rule because none is derivable from the text: one
 * dims a picture, another is a disabled control whose `disabled` prop sits twelve lines above
 * the class. A rule that guessed either would guess wrong on the next site.
 *
 * The reasons here are prose, and prose is what a reviewer has to check — `staleExemptions`
 * below asks whether an entry is still NEEDED, never whether it is true. `ShelfTile` held the
 * first one and left with the home's library band; its entry went the same day, which is the
 * whole point of that rule.
 */
const DIMMING_ALLOWED: Record<string, string> = {
  // MEASURED on 2026-08-17: a folder tile is
  // `bare`, so its caption is `text-text` on the panel rather than white on a gradient — 13.3:1
  // dark and 16.1:1 light at full ink, but 4.28 and 3.20 once cut. A file tile keeps the gradient
  // and its ~17:1. The bar is missed in the light theme for a folder on its way out, and the
  // remedy is a decision about how a cut tile is drawn, not a token.
  '/EntryCard.tsx':
    'a tile that has been CUT and is waiting for a paste, dimmed as every file browser dims one — a picture has no ink to quieten, and a folder caption reads 3.20 while it waits',
  '/TreeViewRow.tsx':
    'the row a drag is holding, for the length of the gesture, while the ghost reads at full ink',
  '/TimelineRow.tsx':
    'the timeline row a drag is holding, for the length of the gesture — the same dimming as the outliner above, and the rows it reads against are at full ink',
}

/**
 * A glyph that INFORMS, held at the 3:1 of WCAG 1.4.11 rather than the 4.5 of a word. Two sites:
 * the type icon a media tile falls back to while its poster is being made, and the folder shape
 * an explorer tile is drawn as — which IS the message, the name under it saying nothing about
 * whether the tile is a folder or a file.
 */
const INFORMATIVE_GLYPHS = ['/MediaTile.tsx', '/EntryFace.tsx']

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
 * `text-muted/70`, `fill-base-content/60` — a token painting a WORD, at an opacity.
 *
 * `fill-` and `stroke-` are here because SVG paints its text with them, and that is not a
 * hypothetical: a chart's graduations were written `fill-base-content/60` and read **3.86:1** on a
 * light `base-300`. Two guards walked past them for reading `text-` alone.
 */
const ALPHA_INK = new RegExp(String.raw`\b(?:text|fill|stroke)-(${VOCABULARY})\/(\d{1,3})\b`, 'g')

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

describe('the contrast of the inks', () => {
  /**
   * The fact the carousel's `w-4` rests on, measured here rather than recopied into a comment
   * beside it. `text` and `muted` are the two fills of a pagination dot, and 1.4.11 asks 3:1 of a
   * state — which they do NOT clear, so the current page has to be said by something else.
   */
  it('leaves two inks too close to tell a state apart on their own', () => {
    for (const theme of THEMES) {
      const tokens = palette(theme.from)

      expect(contrastRatio(tokens.text ?? '', tokens.muted ?? '')).toBeLessThan(AA_NON_TEXT)
    }
  })

  it('leaves no word dimmed by an opacity nobody has justified', () => {
    expect(dimmedWithoutReason(WRITTEN_SOURCES)).toEqual([])
  })

  it('refuses a dimming that says nothing, and takes the two that do', () => {
    // The exact line this batch removed, and the reason the sweep above could not see it.
    expect(
      dimmedWithoutReason([['./probe.tsx', "<span className='text-tiny opacity-70'>"]]),
    ).toEqual(['./probe.tsx opacity-70'])
    expect(dimmedWithoutReason([['./probe.tsx', "disabled && 'opacity-40'"]])).toEqual([])
    // And a comment that NAMES a dimming is not one — the rule flagged its own prose at first.
    expect(dimmedWithoutReason([['./probe.tsx', '/* an `opacity-70` read 3.03:1 */']])).toEqual([])
    expect(dimmedWithoutReason([['./probe.tsx', '// opacity-70 was here']])).toEqual([])
    expect(dimmedWithoutReason([['./probe.tsx', "'opacity-0 group-hover:opacity-100'"]])).toEqual(
      [],
    )
    // Tailwind's arbitrary form, which the first spelling of this rule read as `0` and let past.
    expect(dimmedWithoutReason([['./probe.tsx', "'opacity-[0.7]'"]])).toEqual([
      './probe.tsx opacity-70',
    ])
    expect(dimmedWithoutReason([['./probe.tsx', "'opacity-[70%]'"]])).toEqual([
      './probe.tsx opacity-70',
    ])
  })

  /**
   * The exemptions, held to still be needed. An entry outliving the dimming it excused is how a
   * list like this rots into a hole — `stores/no-bare-shared-word-export.test.ts` learnt it on
   * 2026-08-12, when two names were closed only because their exemption started failing.
   */
  it('carries no exemption for a site that has stopped dimming', () => {
    const stale = Object.keys(DIMMING_ALLOWED).filter(
      one =>
        !WRITTEN_SOURCES.some(
          ([path, source]) => path.endsWith(one) && dimmedWithoutReason([['probe', source]]).length,
        ),
    )

    expect(stale).toEqual([])
    // The reasons are read by a human and by nothing else, so at least require they exist.
    expect(Object.values(DIMMING_ALLOWED).filter(one => one.length < 20)).toEqual([])
  })

  /**
   * The same question asked of the two glyph lists above, which had no such guard and needed one:
   * `DECORATIVE_GLYPHS` has already rotted once — its own comment tells how `MediaTile` sat on it
   * with no business being there, and nothing reddened. An exemption is a claim about a site, and
   * a claim nobody rechecks is how a hole comes to look like a decision.
   */
  it('carries no glyph exemption for a source that has stopped writing an alpha', () => {
    const stale = [...DECORATIVE_GLYPHS, ...INFORMATIVE_GLYPHS].filter(
      one =>
        !WRITTEN_SOURCES.some(([path, source]) => path.endsWith(one) && source.match(ALPHA_INK)),
    )

    expect(stale).toEqual([])
  })

  it('finds an alpha ink at all, so the rule above cannot pass on an empty sweep', () => {
    // `String.match` and not `RegExp.test`: a global regex carries `lastIndex` from one file to
    // the next, and this count read 9 of the 11 that exist before it was written this way.
    const written = WRITTEN_SOURCES.filter(([, source]) => source.match(ALPHA_INK))

    expect(written.length).toBeGreaterThanOrEqual(10)
  })

  /**
   * `accent` is the FILL — a button's background, the playhead, a ring. Lightening it to clear
   * the threshold as ink would take white on it from 4.28 to 3.01, so the two parted ways; a
   * source that writes `text-accent` has picked the one that cannot carry a word.
   */
  it('keeps the fill out of the sources that paint words', () => {
    const offenders = WRITTEN_SOURCES.filter(([, source]) =>
      /\btext-accent(?![\w-])/.test(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })
})
