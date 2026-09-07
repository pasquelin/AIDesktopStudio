import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WINDOW_CHROME_COLOR } from '@shared/constants'
import { THEME_ATTRIBUTE } from '@shared/domain/settings'

/**
 * The stylesheet is the whole token layer, and the only place a hex value may live. It is read
 * here as data, because nothing else can tell that a colour was added to one theme and forgotten
 * in the other — the symptom of that is a panel still dark inside a light interface, and it only
 * shows up by looking at the running application.
 *
 * It lives here rather than beside the stylesheet for two reasons: the renderer tests run in
 * jsdom, where `import.meta.url` is an http URL and no file can be read — and this IS a main
 * process contract, since the window chrome is painted from values it cannot read off the CSS.
 */
const SHEETS = new URL('../../renderer/src/', import.meta.url)

/** Every piece of the token layer, from the folder rather than from a list that would go stale. */
const pieces = readdirSync(SHEETS)
  .filter(name => /^index-.*\.css$/.test(name))
  .sort()

const stylesheet = pieces.map(name => readFileSync(new URL(name, SHEETS), 'utf8')).join('\n')

/**
 * The window loads `index.css`, which is nothing but `@import` lines since the split. A piece on
 * disk that it does not import is dead to the application while every guard here still reads it —
 * and a piece it imports that is gone breaks the window with the whole suite green.
 */
describe('the pieces of the stylesheet', () => {
  it('is exactly what index.css imports', () => {
    const index = readFileSync(new URL('index.css', SHEETS), 'utf8')
    const imported = [...index.matchAll(/@import '\.\/([^']+)'/g)].map(match => match[1]).sort()

    expect(imported).toEqual(pieces)
  })
})

/** The declarations of one block, from its opening line to the brace in the first column. */
function blockFrom(opening: string): string {
  const start = stylesheet.indexOf(opening)
  expect(start, `\`${opening}\` is gone from index.css`).toBeGreaterThan(-1)
  return stylesheet.slice(start, stylesheet.indexOf('\n}', start))
}

function colorsIn(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g)].map(match => [match[1]!, match[2]!]),
  )
}

/** macOS draws each light 12px across; the bar centres its text on that circle. */
const LIGHT_DIAMETER = 12

/**
 * The bar over a window is a CSS gauge and the lights are placed by this process: two numbers in
 * two trees that nothing else relates. Off by one padding, every title sat above the lights.
 */
describe('the title bar and the traffic lights', () => {
  const lights = /TRAFFIC_LIGHTS = \{ x: \d+, y: (\d+) \}/.exec(
    readFileSync(new URL('./windows.ts', import.meta.url), 'utf8'),
  )
  const bar = /--sc-title-bar: (\d+)px;/.exec(blockFrom(':root {'))

  it('centres a title on the lights: the bar is twice their offset plus their diameter', () => {
    expect(lights?.[1]).toBeDefined()
    expect(Number(bar?.[1])).toBe(2 * Number(lights?.[1]) + LIGHT_DIAMETER)
  })

  // The lights are placed once, whatever the density: a bar that shrank with it would leave them.
  it('does not let the compact density move the bar', () => {
    expect(blockFrom(":root[data-density='compact'] {")).not.toContain('--sc-title-bar')
  })
})

const reference = colorsIn(blockFrom('@theme {'))
const dark = colorsIn(blockFrom(`name: '${THEME_ATTRIBUTE.dark}'`))
const light = colorsIn(blockFrom(`name: '${THEME_ATTRIBUTE.light}'`))

/**
 * A token whose value is drawn from another token rather than written — `--color-accent-veil`
 * composes the accent. It is not a colour and cannot stay on a dark value: the substitution
 * happens on the element that reads it, so whichever accent this theme declares is the one it
 * composes. Restating it would put the same text in two blocks and mean nothing.
 *
 * Read off the value rather than listed by name, so the next one costs nothing — and so nobody
 * has to notice that the rule below would otherwise ask for a duplicate.
 */
function isDerived(value: string): boolean {
  return value.includes('var(--color-')
}

describe('the light theme', () => {
  it('restates every studio colour, so none of them stays on its dark value', () => {
    // `@theme` declares the dark values in `:root`, and a theme block only wins where it
    // declares something. A token missed here is a surface that never turns light.
    const missing = [...reference]
      .filter(([name, value]) => !light.has(name) && !isDerived(value))
      .map(([name]) => name)

    expect(missing).toEqual([])
    // The exemption is narrow, and shown to be: a colour written out is still owed a light one.
    expect(isDerived('#346ef2')).toBe(false)
  })

  it('actually changes them, rather than restating the dark value', () => {
    // Deliberately shared: the accent reads on either background, and the monitor stays black
    // because a picture is judged against the black it will be shown on — not against the
    // studio's chrome.
    // The marquee joins it for the monitor's reason: its two strokes are drawn over the
    // document, which does not turn light with the studio around it.
    //
    // `create` and `create-hover` LEFT this list on 2026-08-12, and the decision they carried —
    // one green in both themes, so the action that creates is one mark — was reversed knowingly.
    // It was unreachable, not merely unmet: clearing 4.5:1 on both chassis at once asks for a
    // luminance at or below 0.122 and at or above 0.292. The ratios are in `design/tokens.test.ts`,
    // which now holds the light value; the mark stays green and only its lightness follows the
    // theme, as `muted` and `accent-ink` already do.
    const shared = [
      '--color-accent',
      // Shared because the fill it sits on is: one blue in both themes, one ink written on it.
      '--color-accent-content',
      // And the fill under the pointer, for the same reason and derived from the same blue —
      // `hoverFor` draws it, so it parts from the dark value on the day the accent does.
      '--color-accent-hover',
      '--color-monitor',
      '--color-marquee-light',
      '--color-marquee-dark',
      // And the pixel grid, ruled over the same document for the same reason.
      '--color-grid-cell',
      '--color-grid-pixel',
      // The three axis stripes, and their reason is arithmetic rather than editorial: a stripe
      // has to clear 3:1 against `surface` on BOTH themes, which pinches its luminance between
      // 0.146 and 0.273 — a window narrow enough that one value serves the two. Measured in
      // `design/tokens.test.ts`, which holds the ratios on either theme.
      '--color-axis-x',
      '--color-axis-y',
      '--color-axis-z',
    ]
    const unchanged = [...reference]
      .filter(([name, value]) => light.get(name) === value)
      .map(([name]) => name)

    expect(unchanged.sort()).toEqual([...shared].sort())
  })
})

describe('the dark theme block', () => {
  it('never contradicts the reference tokens it shares a namespace with', () => {
    // daisyUI's variables and the studio's are the same variables, and a theme block wins on
    // layer order. `--color-accent` was declared in both with different values, which silently
    // painted the playhead, the marquee and every `bg-accent` with `accent-soft`.
    const contradicted = [...dark]
      .filter(([name, value]) => reference.has(name) && reference.get(name) !== value)
      .map(([name]) => name)

    expect(contradicted).toEqual([])
  })
})

describe('WINDOW_CHROME_COLOR', () => {
  // The main process paints a window before any stylesheet is parsed, so it cannot read the
  // token and the value is unavoidably written twice. Pinning it turns a repainted palette into
  // a failing test rather than a window with the wrong frame around the right interface.
  it('matches the dark chassis token', () => {
    expect(reference.get('--color-chassis')).toBe(WINDOW_CHROME_COLOR.dark)
  })

  it('matches the light chassis token', () => {
    expect(light.get('--color-chassis')).toBe(WINDOW_CHROME_COLOR.light)
  })
})
