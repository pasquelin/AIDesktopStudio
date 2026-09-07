import { defaultSettings } from '@shared/domain/settings'
import { effectiveLanguage } from '@shared/i18n/languages'
import { EVENTS } from '@shared/ipc'
import { app } from 'electron'
import { isDevelopment } from './environment'
import { broadcast } from './ipc/broadcast'
import { setLogVerbosity } from './log'
import { buildMenu, noteNavigationPreset, noteRecent } from './menu'
import { createElectronAdapter } from './settings/adapter'
import { createSettingsStore, type SettingsStore } from './settings/store'
import { setWindowLanguage } from './window/language'
import { applyTheme } from './window/theme'

// Chromium's locale preserves a per-application choice; system preferences provide its fallback.
// `--lang=de` measured `['de', 'fr-FR']`, while an unsupported locale falls back to `en-US`.
function machineLanguages(): string[] {
  return [app.getLocale(), ...app.getPreferredSystemLanguages()]
}

export function createSettings(): SettingsStore {
  const settings = createSettingsStore(createElectronAdapter(), {
    defaults: defaultSettings(isDevelopment),
    onChange: current => {
      applyTheme(current.appearance.theme)
      setLogVerbosity(current.advanced.logLevel)
      setWindowLanguage(effectiveLanguage(current.general.language, machineLanguages()))
      buildMenu(current.shortcuts.overrides)
      noteNavigationPreset(current.three, preset =>
        settings.write({ three: { ...settings.read().three, navigationPreset: preset } }),
      )
      noteRecent(current.storage.recentProjects, current.storage.recentDocuments)
      broadcast(EVENTS.settingsChanged, current)
    },
  })
  const stored = settings.read()
  applyTheme(stored.appearance.theme)
  setLogVerbosity(stored.advanced.logLevel)
  setWindowLanguage(effectiveLanguage(stored.general.language, machineLanguages()))
  settings.settleAccounts()
  return settings
}
