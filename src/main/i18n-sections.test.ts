import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES, TRANSLATIONS, type Language } from '@shared/i18n'

// Here rather than beside the bundles: `shared/` is compiled by the web tsconfig too, which has
// no Node types, so a guard that reads the tree cannot live there.
const I18N = new URL('../shared/i18n/', import.meta.url)
const CODES: readonly Language[] = LANGUAGES.map(({ code }) => code)

function sectionFiles(language: Language): readonly string[] {
  return readdirSync(new URL(`${language}/`, I18N))
    .filter(name => name.endsWith('.json'))
    .sort()
}

function rootsOf(language: Language, file: string): readonly string[] {
  const parsed: unknown = JSON.parse(readFileSync(new URL(`${language}/${file}`, I18N), 'utf8'))
  if (parsed === null || typeof parsed !== 'object')
    throw new Error(`${language}/${file} is not an object`)
  return Object.keys(parsed)
}

function quotedKey(
  source: string,
  start: number,
  line: number,
): { key: string; line: number; end: number } {
  let end = start + 1
  while (end < source.length && source[end] !== '"') end += source[end] === '\\' ? 2 : 1
  return { key: source.slice(start + 1, end), line, end }
}

/**
 * The keys a file declares twice inside ONE object, with the line of the loser.
 *
 * Read off the TEXT, because `JSON.parse` keeps the last of the two and drops the other without
 * a word: by the time an object exists the defect is gone. Strings are walked rather than
 * matched — a French value holds `{{name}}`, colons and braces of its own.
 */
function duplicateKeysOf(source: string): string[] {
  const duplicates: string[] = []
  const containers: (Set<string> | null)[] = []
  let last: { key: string; line: number } | null = null
  let line = 1

  for (let at = 0; at < source.length; at += 1) {
    const char = source[at]

    if (char === '\n') line += 1
    else if (char === '"') {
      const quoted = quotedKey(source, at, line)
      last = quoted
      at = quoted.end
    } else if (char === '{') containers.push(new Set())
    else if (char === '[') containers.push(null)
    else if (char === '}' || char === ']') containers.pop()
    else if (char === ':') {
      const held = containers.at(-1)
      if (held && last) {
        if (held.has(last.key)) duplicates.push(`${last.key} (line ${last.line})`)
        held.add(last.key)
      }
    }
  }

  return duplicates
}

/**
 * The bundles are split by functional surface, and they are the most contested path of the
 * repository — so they are also the most likely to be merged wrong. Each failure below loses
 * screen text without breaking anything the compiler or a rendering test would notice.
 */
describe('i18n sections', () => {
  it('has no flat locale file left beside the directories', () => {
    const flat = readdirSync(I18N).filter(name => CODES.some(code => name === `${code}.json`))

    // A merge conflict between a branch that split the bundle and one that edited the flat file
    // is offered as "deleted by us / modified by them", and keeping the flat file looks like the
    // safe answer. Measured: it is the worst one, and the two resolvers disagree about it.
    // `tsc` reads `./fr` as the directory index, so the typecheck stays GREEN; Vite reads it as
    // `fr.json`, the named export is gone, and `TRANSLATIONS.fr` is undefined at run time — the
    // whole language, not one key. This suite is the only thing that says so.
    expect(flat).toEqual([])
  })

  it('carries the same sections in every language', () => {
    const found = Object.fromEntries(CODES.map(code => [code, sectionFiles(code)]))
    const reference = sectionFiles(DEFAULT_LANGUAGE)

    expect(found).toEqual(Object.fromEntries(CODES.map(code => [code, reference])))
  })

  it.each(CODES)('takes the sections of %s from its own directory', language => {
    const index = readFileSync(new URL(`${language}/index.ts`, I18N), 'utf8')
    const valueImports = [...index.matchAll(/^import (?!type )[^']+'([^']+\.json)'/gm)]

    // `en/index.ts` carries one `'../fr/…'` type import per section right above its `'./…'` value
    // one, and swapping that value import for the French file compiles green and satisfies every
    // other assertion here — the roots match, only the words change language. Measured: the whole
    // of `scene` turns French that way, 183 leaves, caught by nothing but `bundles.test.ts`.
    expect(valueImports.map(([, path]) => path)).toEqual(
      sectionFiles(language).map(file => `./${file}`),
    )
  })

  it.each(CODES)('spreads every section of %s into the bundle', language => {
    const claimed = new Map<string, string>()

    for (const file of sectionFiles(language))
      for (const root of rootsOf(language, file)) {
        // Two files claiming one root is not an error at run time: the later spread wins and the
        // earlier file becomes dead weight nobody sees is dead.
        expect(claimed.get(root)).toBeUndefined()
        claimed.set(root, file)
      }

    // A section file the directory index forgets to import parses fine and reaches nothing.
    expect([...claimed.keys()].sort()).toEqual(Object.keys(TRANSLATIONS[language]).sort())
  })

  /**
   * Measured on `inspector.path`, declared twice in fr AND in en: the second spelling won, and
   * the section of a camera rail was titled "Emplacement" / "Location" for as long as rails had
   * existed. Nothing else could see it — the compiler reads one key, the parity of the two
   * languages was perfect since the defect was symmetrical, and the key WAS translated.
   */
  it.each(CODES)('declares no key twice inside one object in %s', language => {
    const twice = sectionFiles(language)
      .map(file => ({
        file,
        keys: duplicateKeysOf(readFileSync(new URL(`${language}/${file}`, I18N), 'utf8')),
      }))
      .filter(({ keys }) => keys.length > 0)

    expect(twice).toEqual([])
  })

  // The reading above is only worth its green if it can go red: a walker that never names a key
  // would pass every file of the tree.
  it('reads a doubled key off the text, and leaves values that look like one alone', () => {
    const source = '{\n "a": { "x": "1" },\n "b": "{{x}}: 2",\n "x": "3",\n "x": "4"\n}'

    expect(duplicateKeysOf(source)).toEqual(['x (line 5)'])
  })
})
