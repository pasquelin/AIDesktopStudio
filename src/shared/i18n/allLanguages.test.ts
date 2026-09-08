import { describe, expect, it } from 'vitest'
import { isRecord } from '../guards'
import { ENGLISH_COGNATES } from './englishCognates.testFixtures'
import { LANGUAGES, TRANSLATIONS } from './index'

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

describe('all application languages', () => {
  it('ships the same keys and interpolation holes for every locale', () => {
    const reference = flatten(TRANSLATIONS.en)
    for (const { code } of LANGUAGES) {
      const bundle = flatten(TRANSLATIONS[code])
      expect([...bundle.keys()].sort(), code).toEqual([...reference.keys()].sort())
      for (const [key, text] of reference)
        expect(holes(bundle.get(key) ?? ''), `${code}.${key}`).toEqual(holes(text))
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
