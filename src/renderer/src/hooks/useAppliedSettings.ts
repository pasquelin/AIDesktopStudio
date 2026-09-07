import { useAppearance } from './useAppearance'
import { useLanguage } from './useLanguage'
import { useGamepadNavigation } from './useGamepadNavigation'

/**
 * Everything a window has to apply to itself from the settings. One entry point rather than a
 * list each window repeats: a second window that published the theme and forgot the language
 * would be a bug nobody notices until someone opens it.
 */
export function useAppliedSettings(): void {
  useAppearance()
  useLanguage()
  useGamepadNavigation()
}
