import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, PSEUDO_LANGUAGE, pseudoLocalize, TRANSLATIONS } from '@shared/i18n'
import { LANGUAGES } from '@shared/i18n/languages'
import type { Bundle, Language } from '@shared/i18n'

const NAMESPACE = 'studio'

/**
 * The switch that swaps the interface for the pseudo-locale, read from this window's storage
 * so it survives a reload and can be flipped from the devtools or the debug port.
 *
 * Development builds only, and the guard is `import.meta.env.DEV` rather than a setting: the
 * pseudo-locale is a detector, not a language, and a user who found it would face a studio
 * nobody can read.
 */
export const PSEUDO_LOCALE_FLAG = 'ai-desktop-studio.pseudo-locale'

function pseudoRequested(): boolean {
  return import.meta.env.DEV && localStorage.getItem(PSEUDO_LOCALE_FLAG) === 'on'
}

/**
 * What the document says it is written in. A screen reader picks its voice from it, so an
 * English interface under `lang="fr"` is read with French phonetics — `index.html` shipped the
 * attribute hardcoded, and it was wrong for every user who did not run the studio in French.
 */
function declareLanguage(language: Language): void {
  document.documentElement.lang = language
  document.documentElement.dir = LANGUAGES.find(one => one.code === language)?.direction ?? 'ltr'
}

export async function initI18n(language: Language = DEFAULT_LANGUAGE): Promise<void> {
  const pseudo = pseudoRequested()
  const spoken = pseudo ? PSEUDO_LANGUAGE : language

  // The pseudo text is the source language wearing accents, so that is what the document says
  // it is written in — `pseudo` is not a language tag, and a screen reader given one it does
  // not know falls back to the system voice instead of the French one.
  declareLanguage(pseudo ? DEFAULT_LANGUAGE : language)

  if (i18next.isInitialized) {
    // Built once: the settings call this again on every change, and the bundle is 1700 strings.
    if (pseudo && !i18next.hasResourceBundle(PSEUDO_LANGUAGE, NAMESPACE))
      i18next.addResourceBundle(PSEUDO_LANGUAGE, NAMESPACE, pseudoBundle())
    await i18next.changeLanguage(spoken)
    return
  }

  await i18next.use(initReactI18next).init({
    lng: spoken,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: NAMESPACE,
    ns: [NAMESPACE],
    resources: {
      ...Object.fromEntries(
        LANGUAGES.map(({ code }) => [code, { [NAMESPACE]: TRANSLATIONS[code] }]),
      ),
      ...(pseudo ? { [PSEUDO_LANGUAGE]: { [NAMESPACE]: pseudoBundle() } } : {}),
    },
    interpolation: { escapeValue: false },
  })
}

function pseudoBundle(): Bundle {
  return pseudoLocalize(TRANSLATIONS[DEFAULT_LANGUAGE])
}
