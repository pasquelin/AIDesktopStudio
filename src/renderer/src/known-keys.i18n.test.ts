import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { isRecord } from '@shared/guards'
import { LANGUAGES, TRANSLATIONS, type Language } from '@shared/i18n'

/** Every file the renderer ships, as text — read through Vite, as `tokens.test.ts` does. */
const SOURCES: Record<string, string> = import.meta.glob(
  ['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'],
  { query: '?raw', import: 'default', eager: true },
)

/**
 * i18next appends a plural category to the key it looks up, so a bundle holds `pushed_one` and
 * `pushed_other` where the caller wrote `pushed`. English and French use two of them; the list
 * is CLDR's, so a language with more can be added without touching this.
 */
const PLURAL_SUFFIXES = ['', '_zero', '_one', '_two', '_few', '_many', '_other']

/**
 * What a table's value has to look like to be read as a key rather than as data.
 *
 * Shaped, not merely dotted: a URL, a path or a selector all carry a dot, and this guard exists
 * to say which key is missing — not to argue about what counts as one.
 *
 * The hyphen and the underscore are NOT decoration: 147 of the bundle's keys carry one, between
 * i18next's plural suffixes (`jobs.running_one`) and the hyphenated failure codes the account
 * settings use (`accounts.errors.too-long`). Refusing them would have skipped
 * four keys of `AccountSettings` in silence — a guard that looks wider and covers less.
 */
const KEY_SHAPED = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]+)+$/

function resolve(code: Language, key: string): unknown {
  // Widened, not cast: the bundle's inferred type has no index signature.
  const bundle: unknown = TRANSLATIONS[code]
  return key
    .split('.')
    .reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), bundle)
}

function isKnown(code: Language, key: string): boolean {
  return PLURAL_SUFFIXES.some(suffix => typeof resolve(code, `${key}${suffix}`) === 'string')
}

/** `t('…')`, and the `…Key` fields the registries carry so a row names itself from a bundle. */
type Interpolated = { key: string; given: readonly string[]; line: number }

/**
 * The literals an expression can resolve to. A control that says two things writes a ternary —
 * `t(pinned ? 'inspector.pinned' : 'inspector.pin')` — and reading the outer node alone saw a
 * `ConditionalExpression`, took nothing, and moved on. Walking in adds 36 keys to what this
 * guard reads, measured by running both versions over the same sources; one of them named a
 * key no bundle held.
 *
 * The third copy of this walk, after both `no-hardcoded-text.test.ts`. Narrower on purpose: those
 * two hunt WORDS, so they join the parts of a template, while a key is one literal or none.
 */
function literalsOf(node: ts.Expression | undefined): ts.StringLiteral[] {
  if (node === undefined) return []
  if (ts.isStringLiteral(node)) return [node]
  if (ts.isConditionalExpression(node))
    return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)]
  if (ts.isParenthesizedExpression(node)) return literalsOf(node.expression)
  return []
}

/** The names an options object hands over — `t('x', { name, count })`. */
function namesOf(options: ts.ObjectLiteralExpression, source: ts.SourceFile): string[] {
  return options.properties.flatMap(property => {
    const name = property.name?.getText(source)
    return name === undefined ? [] : [name.replace(/['"]/g, '')]
  })
}

/** `{{name}}`, and every other hole the sentence expects its caller to fill. */
function holesOf(text: unknown): string[] {
  // The capture is there whenever the pattern matched, but the compiler counts it optional.
  return [...String(text).matchAll(/\{\{(\w+)/g)].flatMap(match =>
    match[1] === undefined ? [] : [match[1]],
  )
}

function keysIn(
  path: string,
  code: string,
): { keys: { key: string; line: number }[]; filled: Interpolated[] } {
  // No `ScriptKind`: TypeScript reads it off the name, and forcing TSX on a `.ts` was worse than
  // useless — `const f = <T,>(x: T) => x` opens a tag, the parser drops into error recovery, and
  // nothing after it is visited. Measured on this glob: 697 nodes of `features/shell/documentIo.ts` seen
  // out of 1653.
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true)
  const keys: { key: string; line: number }[] = []
  const filled: Interpolated[] = []

  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1

  // The literal's own line, not the call's: the two keys of a ternary spread over four lines
  // would otherwise be reported at the same place, as if one of them were a duplicate.
  const take = (literal: ts.StringLiteral): void => {
    keys.push({ key: literal.text, line: lineOf(literal) })
  }

  const takeCallKeys = (node: ts.Node): void => {
    if (!ts.isCallExpression(node)) return
    const callee = node.expression.getText(source)
    if (callee !== 't' && !callee.endsWith('.t')) return
    const [first, second] = node.arguments
    const given =
      second !== undefined && ts.isObjectLiteralExpression(second)
        ? namesOf(second, source)
        : undefined
    for (const literal of literalsOf(first).filter(one => one.text.includes('.'))) {
      take(literal)
      if (given !== undefined) filled.push({ key: literal.text, given, line: lineOf(node) })
    }
  }

  const takePropertyKeys = (node: ts.Node): void => {
    if (!ts.isPropertyAssignment(node) || !node.name.getText(source).endsWith('Key')) return
    for (const literal of literalsOf(node.initializer).filter(one => one.text.includes('.'))) {
      take(literal)
    }
  }

  const takeRecordKeys = (node: ts.Node): void => {
    if (
      !ts.isVariableDeclaration(node) ||
      node.type === undefined ||
      node.initializer === undefined
    )
      return
    if (!ts.isTypeReferenceNode(node.type) || node.type.typeName.getText(source) !== 'Record')
      return
    keysUnder(node.initializer)
  }

  const visit = (node: ts.Node): void => {
    takeCallKeys(node)
    takePropertyKeys(node)
    takeRecordKeys(node)
    ts.forEachChild(node, visit)
  }

  /**
   * Values only, never the property names: a table may be keyed BY a dotted string — the main
   * process has one keyed by log scope, `'scene.model': 'document'` — and a name read as a key
   * would send this guard hunting for a bundle entry nobody ever wrote.
   */
  const keysUnder = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      keysUnder(node.initializer)
      return
    }
    if (ts.isStringLiteral(node) && KEY_SHAPED.test(node.text)) take(node)
    ts.forEachChild(node, keysUnder)
  }

  visit(source)
  return { keys, filled }
}

/**
 * A key written by hand and never added to the bundles reads as itself on screen — i18next
 * answers with the key it was given rather than failing. Nothing else here catches that: the
 * composed keys are checked against their registries, and this is the other half.
 */
describe('every key the renderer names outright', () => {
  it.each(LANGUAGES.map(language => language.code))('is in the %s bundle', code => {
    const missing = Object.entries(SOURCES).flatMap(([path, source]) =>
      keysIn(path, source)
        .keys.filter(({ key }) => !isKnown(code, key))
        .map(({ key, line }) => `${path}:${line} ${key}`),
    )

    expect(missing).toEqual([])
  })

  it('accepts a key the bundle only holds in plural form', () => {
    expect(isKnown('fr', 'assets.count')).toBe(true)
  })

  /**
   * The half of a module this check could not see. Nothing was lost — the one key-shaped literal
   * behind a generic arrow turned out to be a `LogScope` — but the check that catches the
   * costliest defect of all, a raw key on screen, was reading half of three modules.
   */
  it('reads a module whose generic arrow used to open a tag', () => {
    // Without the comma, which is how `app/documentIo.ts:105` writes it — `<T,>` stays a
    // generic even in TSX, so a probe using it would pass whatever the mode.
    const code = "const asIs = <S>(state: S): unknown => state\nconst title = t('panels.assets')"

    expect(keysIn('probe.ts', code).keys.map(found => found.key)).toEqual(['panels.assets'])
  })

  it('still reads a component, where the arrow really is a tag', () => {
    const code = "const View = () => <p>{t('panels.assets')}</p>"

    expect(keysIn('probe.tsx', code).keys.map(found => found.key)).toEqual(['panels.assets'])
  })

  it('would see a key nobody translated', () => {
    expect(isKnown('fr', 'jobs.thereIsNoSuchKey')).toBe(false)
  })

  /**
   * Both branches, and every branch of a nested one: a control that says two things names two
   * keys, and only one of them is the one somebody forgot to translate.
   */
  it('reads every key a ternary can resolve to', () => {
    const code = "t(a ? 'inspector.pinned' : b ? 'inspector.pinFull' : 'inspector.pin')"

    expect(keysIn('probe.ts', code).keys.map(found => found.key)).toEqual([
      'inspector.pinned',
      'inspector.pinFull',
      'inspector.pin',
    ])
  })

  // The hole check follows the key it was written for, whichever branch named it.
  it('reads the holes of a key named in a branch', () => {
    const code = "t(full ? 'inspector.pinFull' : 'inspector.pin', { max })"

    expect(keysIn('probe.ts', code).filled.map(one => one.key)).toEqual([
      'inspector.pinFull',
      'inspector.pin',
    ])
  })

  // The other way a key is named, and it had the same hole: four registries write it this way.
  it('reads both keys of a registry field that toggles', () => {
    const code = "const row = { labelKey: playing ? 'transport.pause' : 'transport.play' }"

    expect(keysIn('probe.ts', code).keys.map(found => found.key)).toEqual([
      'transport.pause',
      'transport.play',
    ])
  })

  // Parentheses are the silent way back to the old blindness: no test would have failed.
  it('sees through parentheses around a ternary', () => {
    const code = "t((full ? 'inspector.pinFull' : 'inspector.pin'))"

    expect(keysIn('probe.ts', code).keys.map(found => found.key)).toEqual([
      'inspector.pinFull',
      'inspector.pin',
    ])
  })
})

/**
 * A sentence with a hole left unfilled draws the hole: i18next writes `{{name}}` where the name
 * belongs, and says nothing about it. The bundles are checked against each other for holes; this
 * checks them against the callers, which is the other half.
 *
 * Only calls that pass an options object outright are read — a body assembled elsewhere and
 * handed over under one name is beyond a check that reads a file at a time.
 */
describe('the holes a sentence leaves for its caller', () => {
  it('are all filled where the caller writes them out', () => {
    const unfilled = Object.entries(SOURCES).flatMap(([path, source]) =>
      keysIn(path, source).filled.flatMap(({ key, given, line }) => {
        const text =
          resolve('fr', key) ?? resolve('fr', `${key}_other`) ?? resolve('fr', `${key}_one`)
        const missing = holesOf(text).filter(hole => !given.includes(hole))
        return text === undefined || missing.length === 0
          ? []
          : [`${path}:${line} ${key} ${missing}`]
      }),
    )

    expect(unfilled).toEqual([])
  })

  it('reads the holes out of a sentence, plural forms included', () => {
    expect(holesOf('{{count}} asset pushed to {{where}}')).toEqual(['count', 'where'])
    expect(holesOf('nothing to fill')).toEqual([])
  })
})
