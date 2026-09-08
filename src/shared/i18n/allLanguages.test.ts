import { describe, expect, it } from 'vitest'
import { isRecord } from '../guards'
import { ENGLISH_COGNATES } from './englishCognates.testFixtures'
import { LANGUAGES, TRANSLATIONS, type Language } from './index'

function flatten(
  bundle: unknown,
  prefix = '',
  into = new Map<string, string>(),
): Map<string, string> {
  if (!isRecord(bundle)) return into
  for (const [name, value] of Object.entries(bundle)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (isRecord(value)) flatten(value, key, into)
    else into.set(key, String(value))
  }
  return into
}

const holes = (text: string): string[] =>
  [...text.matchAll(/\{\{[^}]+\}\}/g)].map(match => match[0]).sort()

/** What is left of a line once its holes and its code spans are taken out — the prose alone. */
const bareWords = (text: string): string =>
  text.replace(/\{\{[^}]*\}\}/g, '').replace(/`[^`]*`/g, '')

/**
 * The plural forms a language HAS that the source key set does not name.
 *
 * The keys are French: `_one`, `_many`, `_other`. Arabic separates six counts and Russian four,
 * so a bundle for either carries keys no other bundle does — and it MUST, because `fallbackLng`
 * is French: i18next looks up `key_few`, finds nothing, and prints the FRENCH sentence on an
 * Arabic screen at a count of three.
 */
const extraForms = (code: Language): string[] =>
  new Intl.PluralRules(code)
    .resolvedOptions()
    .pluralCategories.filter(form => !['one', 'many', 'other'].includes(form))

/** Whether a key a bundle carries alone is one of those forms, rather than a stray. */
const isExtraForm = (key: string, code: Language, reference: Map<string, string>): boolean => {
  const cut = key.lastIndexOf('_')
  return (
    cut > 0 &&
    extraForms(code).includes(key.slice(cut + 1)) &&
    reference.has(`${key.slice(0, cut)}_other`)
  )
}

describe('all application languages', () => {
  it('ships every key of the source, and interpolates each of them the same way', () => {
    const reference = flatten(TRANSLATIONS.en)
    for (const { code } of LANGUAGES) {
      const bundle = flatten(TRANSLATIONS[code])
      expect(
        [...reference.keys()].filter(key => !bundle.has(key)),
        code,
      ).toEqual([])
      for (const [key, text] of reference)
        expect(holes(bundle.get(key) ?? ''), `${code}.${key}`).toEqual(holes(text))
    }
  })

  /**
   * The other half, and it is not the same rule: a key the source does not name is a stray —
   * a renamed line left behind, a typo — unless it is a plural form of that language.
   */
  it('adds no key of its own but a plural form its language has', () => {
    const reference = flatten(TRANSLATIONS.en)
    for (const { code } of LANGUAGES) {
      const stray = [...flatten(TRANSLATIONS[code]).keys()].filter(
        key => !reference.has(key) && !isExtraForm(key, code, reference),
      )

      expect(stray, code).toEqual([])
    }
  })

  /**
   * An extra form is the SAME sentence at another count, so it holds the same holes as the
   * `_other` it belongs to — a dropped `{{count}}` there reads as a sentence missing its number.
   */
  it('interpolates an extra plural form the way its own family does', () => {
    const reference = flatten(TRANSLATIONS.en)
    for (const { code } of LANGUAGES) {
      const bundle = flatten(TRANSLATIONS[code])
      for (const [key, text] of bundle) {
        if (reference.has(key) || !isExtraForm(key, code, reference)) continue
        const twin = `${key.slice(0, key.lastIndexOf('_'))}_other`
        expect(holes(text), `${code}.${key}`).toEqual(holes(reference.get(twin) ?? ''))
      }
    }
  })

  it('provides translated content for every locale', () => {
    for (const { code } of LANGUAGES) {
      const bundle = flatten(TRANSLATIONS[code])
      expect(
        [...bundle.values()].every(value => value.trim().length > 0),
        code,
      ).toBe(true)
    }
  })

  /**
   * A line still reading English is what a half-finished translation looks like, and it is the
   * only defect of this batch nothing else could see: the keys match, the holes match, the
   * bundle compiles, and a German reader gets an English sentence.
   *
   * Read against the FRENCH, not against a word list: where the French says the same thing as
   * the English, the line is a name — `Ollama`, `glTF`, `.ora` — and no language has to move it.
   * Where the French found other words, the concept translates, and a bundle repeating the
   * English either borrowed the word on purpose (`ENGLISH_COGNATES`) or was never done.
   */
  it('says every line in its own language, or names the word it borrows', () => {
    const english = flatten(TRANSLATIONS.en)
    const french = flatten(TRANSLATIONS.fr)
    const translatable = [...english].filter(
      ([key, text]) => french.get(key) !== text && /\p{Letter}{3}/u.test(bareWords(text)),
    )

    for (const { code } of LANGUAGES) {
      if (code === 'en') continue
      const bundle = flatten(TRANSLATIONS[code])
      const borrowed = translatable
        .filter(([key, text]) => bundle.get(key) === text)
        .map(([key]) => key)
        .filter(key => !ENGLISH_COGNATES[code].includes(key))

      expect(borrowed, code).toEqual([])
    }
  })

  /**
   * An exemption whose line stopped repeating the English watches nothing, and reads to its next
   * reader as a borrowing still held.
   */
  it('drops a borrowing once its language says the line otherwise', () => {
    const english = flatten(TRANSLATIONS.en)
    const idle = LANGUAGES.flatMap(({ code }) => {
      const bundle = flatten(TRANSLATIONS[code])
      return ENGLISH_COGNATES[code]
        .filter(key => bundle.get(key) !== english.get(key))
        .map(key => `${code}.${key}`)
    })

    expect(idle).toEqual([])
  })

  /**
   * Every form `Intl` says the language HAS, filled — the rule `bundlesStyle.test.ts` holds for
   * French and English, here for the other thirteen.
   *
   * It is not a tidiness rule. `fallbackLng` is FRENCH, so a missing `_few` does not fall back to
   * the key or to English: i18next serves the French sentence. Measured on the key set as the
   * French source names it — `_one`, `_many`, `_other` — Arabic wants three forms more and
   * Russian one, which is 135 keys and 45.
   */
  it('fills every plural form its own language distinguishes', () => {
    const reference = flatten(TRANSLATIONS.en)
    const bases = [...reference.keys()]
      .filter(key => key.endsWith('_other'))
      .map(key => key.slice(0, -'_other'.length))

    for (const { code } of LANGUAGES) {
      const bundle = flatten(TRANSLATIONS[code])
      const forms = new Intl.PluralRules(code).resolvedOptions().pluralCategories
      const missing = forms.flatMap(form =>
        bases.filter(base => !bundle.has(`${base}_${form}`)).map(base => `${base}_${form}`),
      )

      expect(missing, code).toEqual([])
    }
  })

  /**
   * The straight quote and the straight apostrophe, refused for every language as `bundles.test`
   * refuses them for two. A bundle written by hand picks up `'` from a keyboard, and it is the
   * one typographic slip that survives every other guard here.
   */
  it('writes no ASCII quotation mark or apostrophe in any locale', () => {
    for (const { code } of LANGUAGES) {
      const straight = [...flatten(TRANSLATIONS[code])]
        .filter(([, text]) => /["']/.test(text))
        .map(([key]) => key)

      expect(straight, code).toEqual([])
    }
  })
})
