import { describe, expect, it } from 'vitest'
import chassisStylesheet from '@pasquelin/panels/styles.css?raw'
import { stylesheet } from '../indexCss-fixtures'

/**
 * The bridge between the chassis' tokens and the studio's, held to what the library actually
 * reads — in BOTH directions, and neither failure is visible on screen in a way anyone reports.
 *
 * A token the library reads and the bridge forgets keeps the library's own shipped value: a
 * hardcoded colour that follows neither the theme nor the density, on a stylesheet where every
 * gate is green. A token the bridge declares and the library no longer reads is a line nobody
 * will think to delete when the studio's own gauge moves.
 */
const bridged = (): string[] => {
  const block = /\.pnl-root\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? ''
  return [...block.matchAll(/(--pnl-[a-z-]+)\s*:/g)].map(match => match[1] ?? '').sort()
}

/** What the library's own stylesheet reads back — `var(--pnl-…)`, never a declaration. */
const consumed = (): string[] =>
  [
    ...new Set(
      [...chassisStylesheet.matchAll(/var\((--pnl-[a-z-]+)/g)].map(match => match[1] ?? ''),
    ),
  ].sort()

describe('the tokens handed to the chassis', () => {
  it('are exactly the ones the library reads', () => {
    expect(bridged()).toEqual(consumed())
  })

  /**
   * 🛑 BOTH selectors. `:root` is what a `Surface` mounted outside `<Panels>` needs — the skeleton
   * window mounts two, and they fell to no background at all. `.pnl-root` is still needed: the
   * library declares its own palette ON that element, and a declaration there beats an inherited
   * one whatever the specificity. Dropping either is invisible above and silent below.
   */
  it('reach a Surface outside the docks, and still win inside them', () => {
    expect(stylesheet).toContain(':root,\n.pnl-root {\n  --pnl-rail:')
  })

  // Referenced, never copied: a hex or a pixel written here is a second source of truth for a
  // value `index.css` already holds, and the two drift the day one of them moves.
  it('reference a studio token rather than restating its value', () => {
    const block = /\.pnl-root\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? ''

    for (const [, name, value] of block.matchAll(/(--pnl-[a-z-]+)\s*:\s*([^;]+);/g)) {
      expect(`${name}: ${value}`).toMatch(/:\s*var\(--/)
    }
  })
})
