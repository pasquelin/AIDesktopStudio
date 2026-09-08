import { describe, expect, it } from 'vitest'
import { isRecord } from '../guards'
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
})
