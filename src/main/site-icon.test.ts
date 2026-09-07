import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * GitHub Pages serves only what the build hands it, so the site's favicon is a COPY of the
 * application icon rather than a link to it, and nothing else compares the two.
 *
 * **Two blind spots, in the open, and the second is the costly one.** `apple-touch-icon.png` beside
 * it is a flattened RENDER no test reopens — a stale one shows on an iOS home screen alone. But
 * `build/icon.png` is a render too, and it SHIPS: About panel, Windows and Linux window icon, dev
 * Dock. A redrawn `icon.svg` reddens both guards here, and the packaged icon keeps the old mark.
 */
const fileAt = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('the site icon', () => {
  it('is the application icon itself', () => {
    expect(fileAt('site/assets/images/icon.svg')).toBe(fileAt('build/icon.svg'))
  })

  // Two empty files are equal too: the case above passes on a pair of them.
  it('draws the mark rather than nothing', () => {
    expect(fileAt('build/icon.svg')).toContain('#346ef2')
    expect(fileAt('build/icon.svg')).toContain('id="aid-mark"')
  })

  it('is what the page links to', () => {
    expect(fileAt('site/template.html')).toContain('href="{{root}}assets/images/icon.svg"')
  })
})
