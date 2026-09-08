import type { Language } from './languages'

/**
 * Every line a language leaves in English ON PURPOSE — the word IS the word that language uses.
 *
 * Read against the pair `en` / `fr`: a line the French translated and another language did not
 * is either a cognate or a line nobody translated, and the two are indistinguishable to a
 * machine. So each one is named here, by the language that keeps it, after a reader of that
 * language looked at it. **A name covered by the brief — a format, a company, an extension — is
 * not here**: those are equal in French too, so the rule never reads them.
 *
 * Blind, and deliberately: a line where the French ALSO kept the English is unchecked in every
 * language. Three hundred and twenty-four of them, all technical names, and reading them would
 * mean deciding for fifteen languages at once what `Ollama` should become.
 */
export const ENGLISH_COGNATES: Record<Language, readonly string[]> = {
  fr: [],
  en: [],
  ar: [],
  de: [],
  es: [],
  hi: [],
  id: [],
  it: [],
  ja: [],
  ko: [],
  pt: [],
  ru: [],
  tr: [],
  vi: [],
  zh: [],
}
