import { BrowserWindow, screen } from 'electron'
import { APP_ICON_PATH } from '@main/resources'
import { completedOnboarding, needsWelcome, WELCOME_ROUTE } from '@shared/domain/welcome'
import type { SettingsStore } from '@main/settings/store'
import { splashColor } from './theme'
import { revealWindow } from './reveal'
import { centredIn } from './placement'
import { load, studioWindow, WEB_PREFERENCES } from './windows'

/**
 * A splash-shaped window: no chrome, native rounded corners, the mark's tile colour underneath.
 * NOTHING scrolls here (Alban) — a slide that does not fit is a slide to shorten.
 */
const WELCOME_SIZE = { width: 960, height: 840 }

const WINDOW_ICON = process.platform === 'darwin' ? undefined : APP_ICON_PATH

let welcomeWindow: BrowserWindow | null = null
let discarded = false
let settingsStore: SettingsStore | null = null

export function bindWelcomeSettings(store: SettingsStore): void {
  settingsStore = store
}

function markSeen(): void {
  if (!settingsStore) return
  if (!needsWelcome(settingsStore.read().onboarding)) return
  settingsStore.write({ onboarding: completedOnboarding(new Date().toISOString()) })
}

function revealStudio(): void {
  const studio = studioWindow()
  if (studio && !studio.isDestroyed() && !studio.isVisible()) studio.show()
}

function dismissed(): void {
  markSeen()
  revealStudio()
}

/**
 * Closes a welcome nobody read — a renderer that failed to load. `destroy()` alone emits `closed`,
 * which stamps the onboarding as seen and buries the screen for good on a transient failure.
 */
export function discardWelcomeWindow(): void {
  if (!welcomeWindow || welcomeWindow.isDestroyed()) return
  discarded = true
  welcomeWindow.destroy()
}

export function openWelcomeWindow(options: { deferShow?: boolean } = {}): BrowserWindow {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    revealWindow(welcomeWindow)
    return welcomeWindow
  }

  const window = new BrowserWindow({
    // The primary display, as `createMainWindow` takes: this window opens OVER the studio.
    ...centredIn(screen.getPrimaryDisplay().workArea, WELCOME_SIZE),
    resizable: false,
    frame: false,
    roundedCorners: true,
    fullscreenable: false,
    show: false,
    backgroundColor: splashColor(),
    icon: WINDOW_ICON,
    webPreferences: WEB_PREFERENCES,
  })

  if (!options.deferShow) window.once('ready-to-show', () => window.show())
  load(window, { hash: WELCOME_ROUTE })

  welcomeWindow = window
  window.on('closed', () => {
    if (welcomeWindow === window) welcomeWindow = null
    if (discarded) {
      discarded = false
      revealStudio()
      return
    }
    dismissed()
  })
  return window
}
