import { LANGUAGES, type Language } from './languages'

/**
 * The characters French typography needs and a keyboard does not offer.
 *
 * Written as escapes on purpose: a literal no-break space is indistinguishable from an ordinary
 * one in a diff, in a review, and in the test that compares against it — which is exactly how it
 * gets lost. `bundles.test.ts` refuses an ordinary space before `;` `:` `!` `?` and `»`.
 */
export const NO_BREAK_SPACE = '\u00a0'

const ORDINARY = '\u0020'

/**
 * The symbols the studio writes after a number, and nothing else, per language.
 *
 * A WORD is not one: French writes `2 derniers`, `3 assets`, `24 étapes`, and that space may
 * break — some fifty of them do. Telling `Mo` from `au` is what needs a list, and it is why this
 * one is written out rather than derived. A new unit goes in here, with the value that introduced
 * it.
 *
 * `o`, `Kio`, `Mio` and `Gio` are here for the day a bundle writes one, and a review measured that
 * none can arrive by that road today: `units.*` holds the bare symbols, and it is `formatBytes`
 * that joins them to the figure. That join is in CODE, so no guard reading French values can see
 * it — which is why it binds with `NO_BREAK_SPACE` rather than trusting this list.
 *
 * English carries the byte family for the same reason, and the two lists must MIRROR each other:
 * a list holding `Mio` and not `MiB` reddens on a French value while its English twin passes, and
 * the two bundles drift apart in typography with nothing to say so. What English does not carry
 * is a word — `8 asset`, `3 days`, `24 hours` — which the boundary already lets through.
 */
export const UNIT_SYMBOLS: Record<string, readonly string[]> = {
  fr: ['UC', 'o', 'Kio', 'Mio', 'Gio', 'Mo', 'j', 'h', 'LUFS'],
  en: ['CU', 'B', 'KiB', 'MiB', 'GiB', 'KB', 'MB', 'GB', 'd', 'h', 'LUFS'],
}

/** Multiplication ties to BOTH numbers: bound on the left alone, the second one leaves the line. */
const TIMES = '×'

const escaped = (symbol: string): string => symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type BreakRule = { pattern: RegExp; what: string }

/** A figure binds to its unit in both languages; only the punctuation half is French. */
const rulesFor = (language: Language): readonly BreakRule[] => {
  const unit = `(?:${[...(UNIT_SYMBOLS[language] ?? UNIT_SYMBOLS.en ?? []), TIMES].map(escaped).join('|')})`

  return [
    {
      pattern: new RegExp(`(?:\\d+|\\}\\})${ORDINARY}${unit}(?![\\p{Letter}\\d])`, 'gu'),
      what: 'unit',
    },
    { pattern: new RegExp(`${TIMES}${ORDINARY}(?=\\d|\\{\\{)`, 'gu'), what: 'times' },
    { pattern: new RegExp(`\\d${ORDINARY}(?=\\d{3}(?!\\d))`, 'gu'), what: 'thousands' },
    ...(language === 'fr'
      ? [
          { pattern: new RegExp(`${ORDINARY}[;:!?»]`, 'gu'), what: 'punctuation' },
          { pattern: new RegExp(`«${ORDINARY}`, 'gu'), what: 'quote' },
        ]
      : []),
  ]
}

/** Built once: the guards call this on every value of both bundles. */
const RULES: Record<string, readonly BreakRule[]> = Object.fromEntries(
  LANGUAGES.map(language => [language.code, rulesFor(language.code)]),
)

/**
 * Every ordinary space the language would not break there, named by what it separates.
 *
 * The interpolation counts as a number — `{{units}} UC` is the most frequent readout the studio
 * draws, and no pattern looking for a digit ever saw it.
 */
export function breakableSpots(text: string, language: Language): string[] {
  return (RULES[language] ?? RULES.en ?? []).flatMap(({ pattern, what }) =>
    [...text.matchAll(pattern)].map(match => `${what}: ${match[0].trim()}`),
  )
}
