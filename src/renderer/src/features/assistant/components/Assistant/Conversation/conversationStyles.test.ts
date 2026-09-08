import { describe, expect, it } from 'vitest'
import { spellsOut, WRITTEN_SOURCES } from '@/components/testHarness'
import {
  CONVERSATION_ACTIONS,
  CONVERSATION_CARD,
  CONVERSATION_FIELD_TYPE,
} from './conversationStyles'

/** As `WRITTEN_SOURCES` keys it: the glob resolves against `design/testHarness.ts`. */
const GUARDED = '../features/assistant/components/Assistant/Conversation/conversationStyles.ts'

/**
 * The radius is left out on purpose: the two copies this constant replaces agreed on all eight
 * other words and differed on THAT one. A rule demanding the whole set would walk past the very
 * drift it exists to catch.
 */
const spellsOutCard = spellsOut(
  CONVERSATION_CARD.split(' ').filter(one => !one.startsWith('rounded-')),
)

describe('the card of the assistant conversation', () => {
  it('finds the sources and the constant at all, so the rule below cannot pass on nothing', () => {
    expect(WRITTEN_SOURCES.length).toBeGreaterThan(100)
    expect(WRITTEN_SOURCES.map(([path]) => path)).toContain(GUARDED)
    expect(spellsOutCard(`className="${CONVERSATION_CARD}"`)).toBe(true)
  })

  it('is worn rather than written out a third time', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => path !== GUARDED && spellsOutCard(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })
})

describe('the assistant composer action row', () => {
  it('keeps the picker, context and actions on one responsive line', () => {
    expect(CONVERSATION_ACTIONS).toContain('flex-nowrap')
    expect(CONVERSATION_ACTIONS).toContain('min-w-0')
  })
})

/** The conversation and its parts, as `WRITTEN_SOURCES` keys them. */
const CONVERSATION = '../features/assistant/components/Assistant/Conversation/'

/**
 * 🛑 The field and whatever mirrors it wear ONE constant: written out on either side they drift,
 * and the grey tail lands a character off the writing it continues.
 *
 * `design/GhostText.tsx` is named beside the folder because the mirror moved there — a rule left
 * on the folder alone would have gone on passing while half of what it guards lived elsewhere. Not
 * read across all of `WRITTEN_SOURCES`: `px-1 text-xs` is a pairing half the studio reaches for.
 */
describe('the type of the field one writes in', () => {
  /** `design/` is where the glob is anchored, so its own files key from `./` and not from `../`. */
  const MIRROR = './GhostText.tsx'

  const spellsOutType = spellsOut(CONVERSATION_FIELD_TYPE.split(' '))

  it('finds the constant and the mirror, so the rule below cannot pass on nothing', () => {
    expect(spellsOutType(`className="${CONVERSATION_FIELD_TYPE}"`)).toBe(true)
    expect(WRITTEN_SOURCES.map(([path]) => path)).toContain(MIRROR)
  })

  it('is worn by the field and its mirror, never written out beside them', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) =>
        path !== GUARDED && path.startsWith(CONVERSATION) && spellsOutType(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })
})

/** A reading width, in the two spellings a caller reaches for. Never `max-w-56`, a control's cap. */
const PAGE_WIDTHS = ['mx-auto', 'max-w-prose', 'max-w-2xl', 'max-w-3xl', 'max-w-(--sc-chat-width)']

/**
 * 🛑 The conversation FILLS what its host gives it. It was a full-screen modal until 28 August and
 * carried the frame of one — a reading width, a centring margin, the type of a page — into a
 * column the reader can drag down to `MIN_SIZE`.
 *
 * **Blind twice, and both are the price of reading raw text**: a width composed at run time, and
 * any spelling not listed above. What it does cover is every quoted string, `cn(…)` included.
 */
describe('the conversation inside a panel', () => {
  const parts = WRITTEN_SOURCES.filter(([path]) => path.startsWith(CONVERSATION))

  it('finds the sources, and the rules below read the form the folder writes', () => {
    expect(parts.length).toBeGreaterThan(3)
    expect(spellsOut(['mx-auto'])(`className={cn(PANEL_SCROLL, 'mx-auto gap-2')}`)).toBe(true)
    expect(spellsOut(['text-base'])('className="text-base"')).toBe(true)
    // The subtlety the rule rests on: `text-base-content` is a DaisyUI COLOUR, not a rung.
    expect(spellsOut(['text-base'])('className="text-base-content"')).toBe(false)
  })

  // The host decides how wide the reading is: the empty centre is a window, the panel a column.
  it('sets no reading width and no centring margin of its own', () => {
    const offenders = parts
      .filter(([, source]) => PAGE_WIDTHS.some(width => spellsOut([width])(source)))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })

  /**
   * The rungs the docks read at. `text-body` is title chrome — a panel header, the title bar — and
   * `text-base` up is a window's prose; a thread set in either read a size larger than the studio
   * around it. Written as an allow-list: `\btext-(base|lg)\b` also matches `text-base-content`,
   * which is a DaisyUI COLOUR.
   */
  it('reads at the scale the rest of the docks read at', () => {
    const offenders = parts
      .filter(([, source]) =>
        ['text-body', 'text-base', 'text-lg'].some(step => spellsOut([step])(source)),
      )
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })
})
