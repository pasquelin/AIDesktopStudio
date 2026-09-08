export type Language =
  | 'fr'
  | 'en'
  | 'de'
  | 'es'
  | 'hi'
  | 'id'
  | 'it'
  | 'ja'
  | 'ko'
  | 'pt'
  | 'ru'
  | 'tr'
  | 'vi'
  | 'zh'
  | 'ar'

export type LanguageDefinition = {
  code: Language
  /** The language's name in that language — never translated. */
  name: string
  flag: string
  direction: 'ltr' | 'rtl'
}

export const LANGUAGES: readonly LanguageDefinition[] = [
  { code: 'fr', name: 'Français', flag: '🇫🇷', direction: 'ltr' },
  { code: 'en', name: 'English', flag: '🇺🇸', direction: 'ltr' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', direction: 'ltr' },
  { code: 'es', name: 'Español', flag: '🇪🇸', direction: 'ltr' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳', direction: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', direction: 'ltr' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', direction: 'ltr' },
  { code: 'ja', name: '日本語', flag: '🇯🇵', direction: 'ltr' },
  { code: 'ko', name: '한국어', flag: '🇰🇷', direction: 'ltr' },
  { code: 'pt', name: 'Português', flag: '🇧🇷', direction: 'ltr' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', direction: 'ltr' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', direction: 'ltr' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', direction: 'ltr' },
  { code: 'zh', name: '简体中文', flag: '🇨🇳', direction: 'ltr' },
  { code: 'ar', name: 'العربية', flag: '🌐', direction: 'rtl' },
]

export const RTL_LANGUAGES: readonly Language[] = ['ar']

/**
 * The bundle everything else falls back to: the reference, and the fullest — a key missing
 * from another language is read from this one rather than shown as itself.
 *
 * Not the same decision as `UNKNOWN_SYSTEM_LANGUAGE` below, which is why they are two.
 */
export const DEFAULT_LANGUAGE: Language = 'fr'

/**
 * What a machine set to neither language is served. English, because a reader whose system is
 * in German, Spanish or Japanese is far likelier to read it than French — and because the
 * alternative asks them to find the settings, written in French, to discover English exists.
 */
export const UNKNOWN_SYSTEM_LANGUAGE: Language = 'en'

/** What the setting holds: a language, or a deferral to whatever the machine is set to. */
export type LanguagePreference = Language | 'system'

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = [
  'system',
  ...LANGUAGES.map(language => language.code),
]

export function isSupportedLanguage(value: string): value is Language {
  return LANGUAGES.some(language => language.code === value)
}

/** BCP 47 tags (`fr-CA`, `en-GB`) name a language by their primary subtag alone. */
function spokenLanguage(tag: string | undefined): Language | undefined {
  const primary = tag?.split('-')[0]?.toLowerCase()
  return primary && isSupportedLanguage(primary) ? primary : undefined
}

/** The language one tag names, English when the studio speaks nothing it names. */
export function resolveLanguage(tag: string | undefined): Language {
  return spokenLanguage(tag) ?? UNKNOWN_SYSTEM_LANGUAGE
}

/**
 * The first language the studio speaks among the machine's, in the order the machine gives.
 *
 * A LIST rather than the one tag this took until now, and the difference was measured rather
 * than supposed: read through a single tag, a machine whose application locale names a language
 * the studio does not speak was served English even when it asked for French next. Measured on
 * macOS with `--lang=de` on a French system — `['de', 'fr-FR']` now reads French.
 *
 * **The order is the caller's, and it carries a trade-off this function cannot see** — see
 * `machineLanguages` in the main process before changing what feeds it.
 */
export function preferredLanguage(machineTags: readonly string[]): Language {
  for (const tag of machineTags) {
    const spoken = spokenLanguage(tag)
    if (spoken) return spoken
  }
  return UNKNOWN_SYSTEM_LANGUAGE
}

/**
 * The language actually in force. **The main process is the only caller** — it resolves once and
 * every window is told (`StudioBridge['window']['language']`).
 */
export function effectiveLanguage(
  preference: LanguagePreference,
  machineTags: readonly string[],
): Language {
  return preference === 'system' ? preferredLanguage(machineTags) : preference
}
