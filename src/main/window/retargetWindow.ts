import { retargetRoute } from '@shared/domain/retargetWindow'
import { TRANSLATIONS } from '@shared/i18n'
import { windowLanguage } from './language'
import { openAuxiliaryWindow } from './windows'

export function openRetargetWindow(sessionId: string) {
  return openAuxiliaryWindow(
    retargetRoute(sessionId),
    { width: 1280, height: 800, minWidth: 960, minHeight: 600 },
    TRANSLATIONS[windowLanguage()].character.retarget.title,
  )
}
