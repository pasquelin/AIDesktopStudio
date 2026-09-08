import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  effectiveLanguage,
  LANGUAGE_PREFERENCES,
  LANGUAGES,
  preferredLanguage,
  resolveLanguage,
  RTL_LANGUAGES,
} from './languages'

describe('resolving one tag', () => {
  it('keeps only the primary subtag, which is all that names a language', () => {
    expect(resolveLanguage('fr-CA')).toBe('fr')
    expect(resolveLanguage('en-GB')).toBe('en')
  })

  /**
   * English rather than French, and the two are not the same decision. A reader whose machine
   * is set to German, Spanish or Japanese is far likelier to read English than French, and the
   * studio is the only thing standing between them and a window they cannot use — they would
   * have to find the settings, in French, to discover that English exists.
   */
  it('serves the language named by a regional tag', () => {
    expect(resolveLanguage('de-DE')).toBe('de')
    expect(resolveLanguage('es-ES')).toBe('es')
    expect(resolveLanguage('ja-JP')).toBe('ja')
    // `i18next.language` is `undefined` until `initI18n` resolves, and `pseudo` under the flag.
    expect(resolveLanguage(undefined)).toBe('en')
    expect(resolveLanguage('pseudo')).toBe('en')
  })

  // The bundle a missing key falls back to stays French: it is the reference, and the fullest.
  it('keeps French as the bundle behind a key nobody translated', () => {
    expect(DEFAULT_LANGUAGE).toBe('fr')
  })
})

describe('choosing among the machine languages', () => {
  /**
   * The shape the main process builds — the application's own locale, then the system's
   * preferences. Both cases were measured on macOS, on a machine whose system says `fr-FR`:
   * `--lang=en-GB` gives `['en-GB', 'fr-FR']`, and `--lang=de` gives `['de', 'fr-FR']`.
   *
   * The first is why the application locale leads: macOS lets a reader set a language for one
   * application, and answering French there would overrule what they chose. The second is what
   * the list was added for — the studio spoke English to that reader before it.
   */
  it('prefers the language set for the application over the system preferences', () => {
    expect(preferredLanguage(['en-GB', 'fr-FR'])).toBe('en')
  })

  it('chooses the first supported system language', () => {
    expect(preferredLanguage(['de', 'fr-FR'])).toBe('de')
    expect(preferredLanguage(['br-FR', 'de-DE', 'en-US'])).toBe('de')
  })

  /**
   * The half this order does NOT win, kept as a test so it stays a decision. Chromium answers
   * `en-US` both for a reader who chose English and for one whose choice it ships no bundle for,
   * and nothing separates the two — so English wins here before `fr-FR` is ever read. Measured:
   * `--lang=fr-CA` on a French machine builds exactly this list.
   */
  it('cannot tell a chosen English from a fallen-back one, and serves English to both', () => {
    expect(preferredLanguage(['en-US', 'fr-FR'])).toBe('en')
  })

  // `getPreferredSystemLanguages()` answers a list, and a list can come back empty.
  it('serves English when the machine names nothing at all', () => {
    expect(preferredLanguage([])).toBe('en')
  })
})

describe('the language in force', () => {
  // The main process is the only caller: it resolves once and tells the renderer, because a
  // machine tag read on both sides is how a native menu ends up in a different language from
  // the window under it.
  it('takes the machine languages only when the setting defers to them', () => {
    expect(effectiveLanguage('system', ['en-GB'])).toBe('en')
    expect(effectiveLanguage('fr', ['en-GB'])).toBe('fr')
  })
})

describe('what the setting may hold', () => {
  it('offers every translated language, plus deferring to the machine', () => {
    expect(LANGUAGE_PREFERENCES).toEqual(['system', ...LANGUAGES.map(entry => entry.code)])
  })

  // Shown as-is in the settings: a language names itself in its own language, so these are the
  // one set of labels no bundle translates.
  it('names each language in that language', () => {
    for (const language of LANGUAGES) {
      expect(language.name.trim(), `${language.code} has no name`).not.toBe('')
    }
  })

  /**
   * The fifteen the site offers, written out rather than counted: a count stays green the day
   * one language is dropped and another added, and what a reader coming from the site checks is
   * that the one they were promised is here.
   */
  it('speaks the fifteen languages the site offers', () => {
    expect([...LANGUAGES.map(entry => entry.code)].sort()).toEqual([
      'ar',
      'de',
      'en',
      'es',
      'fr',
      'hi',
      'id',
      'it',
      'ja',
      'ko',
      'pt',
      'ru',
      'tr',
      'vi',
      'zh',
    ])
  })

  // The picker shows the flag before the name, and a missing one shifts every label beside it.
  it('gives each language a flag to be picked out by', () => {
    const flagless = LANGUAGES.filter(entry => entry.flag.trim() === '').map(entry => entry.code)

    expect(flagless).toEqual([])
  })
})

/**
 * `RTL_LANGUAGES` and the `direction` of the table are two spellings of one fact, and the window
 * reads one while the guards read the other — `initI18n` sets `document.documentElement.dir` off
 * the table. A language added to one and not the other lays itself out one way and hyphenates
 * the other, with nothing to say so.
 */
describe('the direction a language reads in', () => {
  it('lists as right-to-left exactly what the table marks as one', () => {
    expect([...RTL_LANGUAGES].sort()).toEqual(
      LANGUAGES.filter(entry => entry.direction === 'rtl')
        .map(entry => entry.code)
        .sort(),
    )
  })

  it('reads Arabic from the right', () => {
    expect(RTL_LANGUAGES).toContain('ar')
  })
})
