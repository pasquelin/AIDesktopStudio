import frDictionary from './model-text.fr.json'
import type { Language } from './languages'

/**
 * What a model wrote about itself, said in the studio's language.
 *
 * The generation form is built from `GET /models/{modelId}` — invariant 5 — and Scenario answers
 * in English only: no `Accept-Language`, no locale parameter, nothing in the SDK. So the labels,
 * the descriptions and the group headings are translated here or not at all.
 *
 * Keyed by the English text rather than by the field's `key`, because half of what the panel
 * shows is a sentence the model chose, not a field name: keying on `key` would translate
 * `Max splat points` and leave its description in English right below it.
 *
 * The cost of that choice is that a wording changed on Scenario's side falls back to English
 * instead of failing loudly. `normalizeModelText` absorbs the edits that cost nothing to absorb —
 * case, spacing, typographic punctuation — and the fallback is the English sentence itself, so
 * the worst case is the panel we already had.
 *
 * A word stays in English only where no surface and no glossary entry names it in French.
 * `KEPT_IN_ENGLISH`, in `modelText.i18n.test.ts`, holds that list and is what decides.
 */
const DICTIONARIES: Partial<Record<string, Record<string, string>>> = { fr: frDictionary }

/**
 * The shape a text is looked up by. Every difference it erases is one Scenario can introduce
 * without meaning anything by it — a capital, a line break, a curly quote, a full stop.
 */
export function normalizeModelText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.;:!?]+$/, '')
}

/** The French for a text a model wrote, or that very text when nobody has translated it. */
export function translateModelText(text: string, language: Language): string {
  return DICTIONARIES[language]?.[normalizeModelText(text)] ?? text
}
