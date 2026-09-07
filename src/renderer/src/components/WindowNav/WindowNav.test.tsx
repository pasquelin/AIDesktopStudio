import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WindowNav } from './WindowNav'
import { WindowNavItem } from './WindowNavItem'
import { WRITTEN_SOURCES } from '../testHarness'

/**
 * As `WRITTEN_SOURCES` keys it: the glob resolves against `testHarness.ts`, which sits one
 * folder up now that the entry has a file of its own. It is the ITEM that wears the skin, not
 * the list around it — splitting the two is what made the distinction visible.
 */
const CANONICAL = './WindowNav/WindowNavItem.tsx'

/** An opening `li`, then the skin, with no closing `li` in between. */
const ITEM_WEARING_SKIN = /<li[^>]*>(?:(?!<\/li>)[\s\S])*?windowControl\(/

const entry = (props: Partial<Parameters<typeof WindowNavItem>[0]> = {}) => (
  <WindowNav>
    <WindowNavItem active={false} hint="Opens the account settings" onSelect={() => {}} {...props}>
      Account
    </WindowNavItem>
  </WindowNav>
)

describe('WindowNavItem', () => {
  it('says which entry the pane is showing, and says nothing on the others', () => {
    const { rerender } = render(entry({ active: true }))
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-current', 'page')

    rerender(entry())
    expect(screen.getByRole('button', { name: 'Account' })).not.toHaveAttribute('aria-current')
  })

  /**
   * The words are on screen, so the hint explains instead of repeating them — and an `aria-label`
   * set over a visible label replaces it for a screen reader (WCAG SC 2.5.3).
   */
  it('explains through the tooltip without renaming the entry', () => {
    render(entry())

    const button = screen.getByRole('button', { name: 'Account' })
    expect(button).not.toHaveAttribute('aria-label')
    expect(button).toHaveAttribute('data-tooltip-content', 'Opens the account settings')
  })

  /**
   * The indent is a gauge and never a pixel, and a flat list must keep the left padding its own
   * caller gives it — which is what `undefined` buys, rather than a depth of zero.
   */
  it('indents by the gauge only where a tree says how deep it is', () => {
    const { rerender } = render(entry({ depth: 1 }))
    expect(screen.getByRole('button').style.paddingLeft).toBe('calc(var(--sc-indent) * 2)')

    rerender(entry())
    expect(screen.getByRole('button').style.paddingLeft).toBe('')
  })

  /**
   * 🛑 An entry of this column is CHOSEN, not actioned, and the studio tells the two apart by one
   * token — `accent-soft`, the accent thinned. A full blue here reads as a control, and sat beside
   * the folder browser of the new-document window, which paints a picked row soft, it said the
   * two selections were different things.
   *
   * Not a breach of the boundary the file above draws: that one is about the class STRINGS of
   * `components/styles.ts`, which speak names DaisyUI never heard of. `accent-soft` is declared in
   * the `@theme` block and belongs to neither vocabulary.
   */
  it('paints a chosen entry with the accent thinned, never a full blue', () => {
    render(entry({ active: true }))

    expect(screen.getByRole('button')).toHaveClass('bg-accent-soft')
    expect(screen.getByRole('button')).not.toHaveClass('bg-primary')
  })
})

describe('WindowNav', () => {
  /**
   * The list scrolls, not the column: a window pins a search field above it and a refresh under
   * it, and both have to stay put once the list runs past the window.
   */
  it('scrolls on its own so what a window pins around it stays put', () => {
    render(entry())

    const list = screen.getByRole('list')
    expect(list).toHaveClass('overflow-auto')
    expect(list).toHaveClass('min-h-0')
    expect(list).toHaveClass('flex-1')
  })

  /**
   * The shape the three copies each wrote: the window skin reached INSIDE a list item. Read as
   * an opening `li` with no closing one before the skin, rather than as the two words being in
   * the same file — a file is free to hold a list on one side and the skin on the other, which
   * `ManualWindow` does with its search results and `UsageWindow` with its refresh button.
   *
   * **What it cannot see**: a window reaching the skin through a variable, or one that hands the
   * `li` to a component of its own. Both are ways of writing it again on purpose; this catches
   * the shape the habit produces, which is the one that happened three times.
   */
  it('is the only place where a list item wears the window skin', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => path !== CANONICAL && ITEM_WEARING_SKIN.test(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('reads the shape it means, and not a file that merely holds both words', () => {
    expect(ITEM_WEARING_SKIN.test('<li>\n<button className={windowControl(on)} />\n</li>')).toBe(
      true,
    )
    expect(ITEM_WEARING_SKIN.test('<li>{title}</li>\n<b className={windowControl(false)} />')).toBe(
      false,
    )
  })

  // The partner of the rule above: a rule nobody's code reaches is green on an empty studio.
  it('is worn by the three windows it was extracted from', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => path !== CANONICAL && source.includes('WindowNavItem'),
    )

    expect(wearing.length).toBeGreaterThanOrEqual(3)
  })
})
