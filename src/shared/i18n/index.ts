import { isRecord } from '../guards'
import { en } from './en'
import { fr } from './fr'
import { ar } from './ar'
import { de } from './de'
import { es } from './es'
import { hi } from './hi'
import { id } from './id'
import { it } from './it'
import { ja } from './ja'
import { ko } from './ko'
import { pt } from './pt'
import { ru } from './ru'
import { tr } from './tr'
import { vi } from './vi'
import { zh } from './zh'
import type { Language } from './languages'

/**
 * Translations live in `shared/`: the native menu is built by the main process and the UI by
 * the renderer, and both must say the same thing. One directory of sections per language,
 * merged by that directory's index — see `fr/index.ts` for why the storage is split.
 */
export const TRANSLATIONS: Record<Language, typeof fr> = {
  fr,
  en,
  ar,
  de,
  es,
  hi,
  id,
  it,
  ja,
  ko,
  pt,
  ru,
  tr,
  vi,
  zh,
}

export type { Translations } from './fr'

/**
 * A bundle line in English, looked up by a key composed at runtime.
 *
 * English on purpose, and that is the whole reason this exists: what it serves is read by the
 * assistant's model, which reasons in English — the same catalogue or the same refusal read in
 * French would change what it decides from one user to the next. Anything bound for a screen
 * goes through `useTranslation` in the window, or `TRANSLATIONS[language]` in the main process.
 *
 * Both sides ask: the main process composes the instruction, the window composes the history of
 * what it did. `''` for a key nothing names, rather than the key itself — this text lands inside
 * a sentence written for a model, where a raw key reads as an instruction it cannot follow.
 */
export function englishText(key: string): string {
  return textAt(TRANSLATIONS.en, key)
}

/**
 * The same lookup in whichever language a caller holds — for text that DOES land on a screen and
 * is keyed at runtime: the form of a local model names its knobs by key, not by sentence.
 */
export function textAt(bundle: typeof fr, key: string): string {
  const text = key
    .split('.')
    .reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), bundle)
  return typeof text === 'string' ? text : ''
}

/**
 * A bundle line with its `{{holes}}` filled, for the side that has no i18next.
 *
 * EVERY occurrence of each hole — a sentence may name the same value twice, and the four sites
 * this replaces used `String.replace` with a literal, which rewrites the FIRST match only.
 *
 * A hole nothing names is left standing rather than blanked: nothing here can tell a forgotten
 * argument from a value that is legitimately absent, and a sentence with a gap in it reads as
 * finished. `main/no-unfilled-placeholder.test.ts` says what stands guard over that.
 *
 * NOT i18next, and `{{count, number}}` is the one format it answers — grouped through `Intl`, the
 * same reading the window gets. It used to leave that shape whole, on the promise that every one
 * of them lived in a section only the window read: true at 14 occurrences on 2026-08-15, false at
 * 61, and the trash dialog printed `Ces {{count, number}} éléments` on a screen.
 *
 * Every OTHER format is still left whole — `{{value, number(maximumFractionDigits: 1)}}` and
 * whatever comes next — as is a hole named with a dot or a dash. Guessing is worse than standing
 * out, and `main/no-unfilled-placeholder.test.ts` names the one main file that reaches a
 * formatted key, so a second one cannot arrive unread.
 */
export function fillHoles(
  sentence: string,
  values: Record<string, string | number>,
  language: Language,
): string {
  return sentence.replace(/\{\{(\w+)(,\s*number)?\}\}/g, (hole, name: string, format?: string) => {
    // `hasOwn`, not `in`: `in` walks the prototype chain, and `{{toString}}` would print a
    // function's source into a sentence. Measured, before it was written this way.
    if (!Object.hasOwn(values, name)) return hole

    const value = values[name]
    return format !== undefined && typeof value === 'number'
      ? new Intl.NumberFormat(language).format(value)
      : String(value)
  })
}

export * from './languages'
export * from './modelText'
export * from './pseudo'
