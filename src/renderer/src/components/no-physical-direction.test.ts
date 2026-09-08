import { describe, expect, it } from 'vitest'
import { WRITTEN_SOURCES } from './testHarness'

/**
 * The studio ships in Arabic, so the shell is laid out from the inline START, never from the
 * left. A `pl-3` reads as an indent in fourteen languages and as an outdent in the fifteenth,
 * and nothing on this machine would show it: the tests render in French, the gates are blind to
 * a class name, and `dir="rtl"` is set on the document by `initI18n` alone.
 *
 * **This sweeps the SHARED components and nothing else** — `renderer/src/components`, what the
 * repository's own rule calls what several features share. A feature drawing its own panel is
 * unread here, and that is a hole, not a decision the guard has measured.
 */
const PHYSICAL_SOURCE = [
  String.raw`(?:ml|mr|pl|pr)-(?:\d[\d.]*|px|auto|full|\(--[\w-]+\)|\[[^\]]+\])`,
  String.raw`(?:left|right)-(?:\d[\d.]*|px|auto|full|\(--[\w-]+\)|\[[^\]]+\])`,
  String.raw`text-(?:left|right)`,
  String.raw`border-[lr](?:-[\w.[\]()-]+)?`,
  String.raw`rounded-(?:l|r|tl|tr|bl|br)(?:-[\w.[\]()-]+)?`,
  String.raw`float-(?:left|right)`,
  String.raw`origin-(?:left|right)`,
]
  .map(one => `(?<![\\w-])${one}(?![\\w-])`)
  .join('|')

/** Fresh each time: a global regexp keeps its `lastIndex`, so a shared one answers by turns. */
const physical = (): RegExp => new RegExp(PHYSICAL_SOURCE, 'g')

/**
 * The two surfaces whose geometry is physical, and why. Both were measured rather than assumed.
 *
 * `WindowTitleBar` clears the native traffic lights, which the main process places by
 * `trafficLightPosition` — an offset from the LEFT edge, in every language. A logical inset would
 * put the title under them in Arabic. Its two paddings stay physical together: `pl-24` beside a
 * `pe-6` would resolve to two `padding-left` rules in Arabic, and which one wins is the order of
 * the stylesheet rather than a decision.
 *
 * `Carousel` positions its cards by `translateX` off a virtualiser measured in pixels, so a
 * logical class alone would mirror the padding and leave the cards where they were. Mirroring a
 * shelf takes an RTL-aware virtualiser, which this batch did not write.
 */
const PHYSICAL_ON_PURPOSE: readonly string[] = [
  './WindowTitleBar.tsx',
  './Carousel/Carousel.tsx',
  './Carousel/CarouselArrow.tsx',
]

// As `WRITTEN_SOURCES` keys them: the glob resolves against `testHarness.ts`, their neighbour.
const shared = WRITTEN_SOURCES.filter(([path]) => path.startsWith('./'))

describe('the direction a shared component lays itself out in', () => {
  it('finds the components at all, so the rule below cannot pass on an empty glob', () => {
    expect(shared.length).toBeGreaterThan(100)
  })

  it('is the inline start, never the left', () => {
    const offenders = shared
      .filter(([path]) => !PHYSICAL_ON_PURPOSE.includes(path))
      .flatMap(([path, source]) =>
        [...source.matchAll(physical())].map(match => `${path} — ${match[0]}`),
      )

    expect(offenders.sort()).toEqual([])
  })

  /** The assertion above is a list expected EMPTY: a reading that finds nothing keeps it green. */
  it('reads a physical class where one is written', () => {
    expect('flex pl-3 gap-2'.match(physical())).toEqual(['pl-3'])
    expect('absolute top-1 right-1'.match(physical())).toEqual(['right-1'])
    expect('shrink-0 border-r pe-2'.match(physical())).toEqual(['border-r'])
    expect('a right-click lands on'.match(physical())).toBeNull()
    expect('flex ps-3 text-start border-e ms-auto'.match(physical())).toBeNull()
  })

  /** An exemption whose file stopped writing one watches nothing, and reads as a rule still held. */
  it('drops an exemption once its file lays itself out logically', () => {
    const idle = PHYSICAL_ON_PURPOSE.filter(path => {
      const source = shared.find(([one]) => one === path)?.[1]
      return source === undefined || source.match(physical()) === null
    })

    expect(idle).toEqual([])
  })
})
