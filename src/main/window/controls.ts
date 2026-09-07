import { app, BrowserWindow } from 'electron'
import { INITIAL_WINDOW_STATE, type WindowState } from '@shared/domain/window'
import { CHANNELS, EVENTS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { broadcast } from '@main/ipc/broadcast'
import { followWindowLanguage, windowLanguage } from './language'

/** Set by `before-quit`; a window close that is not a quit leaves this false. */
let quitArmed = false

export function armQuit(): void {
  quitArmed = true
}

function resumeLeave(sender: Electron.WebContents, proceed: boolean): void {
  const shouldQuit = quitArmed
  quitArmed = false
  if (!proceed) return
  if (shouldQuit) {
    app.quit()
    return
  }
  const window = BrowserWindow.fromWebContents(sender)
  if (window && !window.isDestroyed()) window.close()
}

function stateOf(target: BrowserWindow): WindowState {
  return {
    active: target.isFocused(),
    fullScreen: target.isFullScreen(),
    maximized: target.isMaximized(),
  }
}

export function toggleFullScreen(target: BrowserWindow | null): void {
  const window = target ?? BrowserWindow.getFocusedWindow()
  if (!window) return
  window.setFullScreen(!window.isFullScreen())
}

/**
 * Pushes window state to the renderer. The title bar needs it: in full screen macOS removes
 * the traffic lights, and the inset would otherwise leave a 96 px gap left of the workspace
 * tabs.
 */
export function trackWindowState(window: BrowserWindow): void {
  const push = (): void => {
    if (window.isDestroyed()) return
    window.webContents.send(EVENTS.windowState, stateOf(window))
  }

  window.on('focus', push)
  window.on('blur', push)
  window.on('maximize', push)
  window.on('unmaximize', push)
  window.on('enter-full-screen', push)
  window.on('leave-full-screen', push)
  window.webContents.on('did-finish-load', push)
}

export function registerWindowControls(): void {
  handle(CHANNELS.windowToggleFullScreen, event =>
    toggleFullScreen(BrowserWindow.fromWebContents(event.sender)),
  )

  handle(CHANNELS.windowLanguage, () => Promise.resolve(windowLanguage()))

  // Every window follows the one copy, the same call the native surfaces follow. Registered
  // here rather than at each window: a window opened later reads the current value on load.
  followWindowLanguage(language => broadcast(EVENTS.windowLanguage, language))

  // The window always exists here: the event comes from one of its own renderers. Falling
  // back to the initial state keeps the return type honest rather than leaking a null.
  handle(CHANNELS.windowState, event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? stateOf(window) : INITIAL_WINDOW_STATE
  })

  handle(CHANNELS.windowResumeLeave, (event, proceed) => {
    resumeLeave(event.sender, proceed)
  })
}
