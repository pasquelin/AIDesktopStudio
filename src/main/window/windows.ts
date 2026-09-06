import { BrowserWindow, dialog, screen, type WebPreferences } from 'electron'
import { join } from 'node:path'
import { chromeColor } from './theme'
import { MIRROR_BACKGROUND } from '@shared/constants'
import { JOURNAL_ROUTE } from '@shared/domain/activity'
import { fileInfoRoute } from '@shared/domain/fileInfo'
import { LICENCES_ROUTE } from '@shared/domain/licence'
import { MANUAL_ROUTE } from '@shared/domain/manual'
import { GAME_WINDOW_ROUTE } from '@shared/domain/gameWindow'
import { playerModuleRoute } from '@shared/domain/playerModuleWindow'
import { MIRROR_ROUTE } from '@shared/domain/mirror'
import { NEW_DOCUMENT_ROUTE } from '@shared/domain/newDocument'
import { settingsRoute, type SettingsSectionId } from '@shared/domain/settings'
import { USAGE_ROUTE } from '@shared/domain/usage'
import { TRANSLATIONS } from '@shared/i18n'
import { EVENTS } from '@shared/ipc'
import { APP_ICON_PATH } from '@main/resources'
import { isDevelopment } from '@main/environment'
import { trackWindowState } from './controls'
import { windowLanguage } from './language'
import { revealWindow } from './reveal'
import { loadWindow } from './loadWindow'

/**
 * The floor below which the layout stops being usable: the two rails take 96 px, the side
 * columns roughly 250 and 300, and the video workspace puts a source and a program viewer side
 * by side in what is left — under 1280 they become thumbnails. Height is the same argument
 * stacked: workspace bar, tabs, viewer, timeline and status bar. Resolve asks for the same.
 */
const LAYOUT_FLOOR = { width: 1280, height: 720 }

/**
 * The floor for every window: none may weaken these — a second window with looser settings
 * would be a second, quieter way to reach the bridge (CLAUDE.md, invariant 1). The splash
 * spreads them and tightens further, dropping the preload entirely.
 */
export const WEB_PREFERENCES: WebPreferences = {
  preload: join(import.meta.dirname, '../preload/index.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  // Dropping the menu entries hides the command; this refuses the feature. A compromised
  // dependency calling `openDevTools()` would otherwise still reach `window.studio`.
  devTools: isDevelopment,
}

/**
 * macOS reads the icon from the bundle and ignores this option; Windows and Linux need it
 * spelled out, or the window wears the default Electron icon.
 */
const WINDOW_ICON = process.platform === 'darwin' ? undefined : APP_ICON_PATH

export const load = loadWindow

/** What separates one window of a family from the next. Everything else about them is identical. */
type WindowSize = { width: number; height: number; minWidth: number; minHeight: number }

/** The tail every factory here shares: follow the window, then show it once it has a first frame. */
function shown(window: BrowserWindow): BrowserWindow {
  trackWindowState(window)
  window.once('ready-to-show', () => window.show())
  return window
}

/**
 * Where macOS floats the three buttons, for every window of the studio that hides its bar.
 *
 * ONE offset, because `WindowTitleBar` stands exactly as tall as the studio's own `TitleBar`:
 * two windows side by side put their lights on one line, which two offsets could not do. Both
 * bars are `--sc-title-bar` tall — 2 × `y` plus the lights' 12px diameter, so a title is centred
 * on them; `theme.test.ts` holds the two numbers together.
 */
const TRAFFIC_LIGHTS = { x: 16, y: 14 }
type WindowOptions = NonNullable<ConstructorParameters<typeof BrowserWindow>[0]>

/**
 * The shape shared by every window that is not a document: a size typed here rather than taken
 * from the screen, and no full screen — macOS would give it a space of its own, hiding the studio
 * behind it.
 *
 * Written once because it was written three times, and it now dresses the skeleton window too: a
 * floor added to one of them silently left the others behind.
 */
function auxiliaryWindow(size: WindowSize, title?: string): BrowserWindow {
  return shown(
    new BrowserWindow({
      ...size,
      show: false,
      backgroundColor: chromeColor(),
      titleBarStyle: 'hiddenInset',
      // The studio's own offset, not one per family: `WindowTitleBar` stands as tall as `TitleBar`,
      // so two windows side by side put their lights on one line.
      trafficLightPosition: TRAFFIC_LIGHTS,
      fullscreenable: false,
      title,
      icon: WINDOW_ICON,
      webPreferences: WEB_PREFERENCES,
    }),
  )
}

/**
 * The windows there is only ever one of, held by the route that identifies them — a route is what
 * the window IS here, and no two auxiliary windows share one.
 */
const auxiliaryWindows = new Map<string, BrowserWindow>()

/**
 * Reveals the window a route already has, or builds it. Settings does not come through here: it
 * carries a section to announce and a close it may refuse, neither of which the other two have.
 */
export function openAuxiliaryWindow(hash: string, size: WindowSize, title?: string): BrowserWindow {
  const held = auxiliaryWindows.get(hash)
  if (held && !held.isDestroyed()) {
    revealWindow(held)
    return held
  }

  const window = auxiliaryWindow(size, title)
  // Identity-checked, as `createMainWindow` is: an older window closing must not clear a slot a
  // newer one now holds.
  window.on('closed', () => {
    if (auxiliaryWindows.get(hash) === window) auxiliaryWindows.delete(hash)
  })

  load(window, { hash })
  auxiliaryWindows.set(hash, window)
  return window
}

let mainWindow: BrowserWindow | null = null

/**
 * `deferShow` hands the decision to the caller instead of showing on `ready-to-show`. Startup
 * uses it so the window waits for the splash to be gone: two windows on screen at once, one
 * over the other, is what a splash is supposed to prevent.
 */
export function createMainWindow(options: { deferShow?: boolean } = {}): BrowserWindow {
  /**
   * The screen decides the size, not a number typed here: a studio opens filled.
   *
   * `workArea` and not `size`: the latter is the panel itself, menu bar and Dock included, and
   * a window given those numbers hides part of itself behind both. Its `x`/`y` come along —
   * on a second display the work area does not start at the origin.
   *
   * Not `maximize()`: that is a window STATE, and macOS restores out of it to whatever size
   * was set before — which would be this same one. One mechanism, not two.
   */
  const { workArea } = screen.getPrimaryDisplay()

  const window = new BrowserWindow({
    ...workArea,
    // Never above the screen itself: Electron RAISES a window to its minimum size, so a floor
    // wider than a 1024-wide display would push a quarter of the window off it, with no way to
    // resize back. The floor is a limit on shrinking, not a demand for room that is not there.
    minWidth: Math.min(LAYOUT_FLOOR.width, workArea.width),
    minHeight: Math.min(LAYOUT_FLOOR.height, workArea.height),
    show: false,
    backgroundColor: chromeColor(),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: TRAFFIC_LIGHTS,
    icon: WINDOW_ICON,
    webPreferences: WEB_PREFERENCES,
  })

  trackWindowState(window)

  if (!options.deferShow) window.once('ready-to-show', () => window.show())
  load(window)

  mainWindow = window
  // Identity-checked: an older window closing must not clear a slot a newer one now holds.
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  return window
}

/**
 * Answers a second launch. On macOS every window can be closed while the process stays in the
 * Dock, so there may be nothing left to reveal.
 */
export function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) revealWindow(mainWindow)
  else createMainWindow()
}

/**
 * The window that shows the studio itself, and the only one that mounts the assistant.
 *
 * Named rather than "whichever is in front": the settings, licences, usage and mirror windows
 * load the same bundle on another route, so they are focusable and they answer `frontWindow` —
 * and none of them subscribes to anything the assistant sends. An action from outside must reach
 * this one or be refused; anything else is a two-minute wait for a message nobody heard.
 */
export function studioWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

let settingsWindow: BrowserWindow | null = null

/**
 * Names the section to the window's renderer, waiting for it to be loaded if it is not yet.
 * `send` on a renderer still parsing its bundle is dropped without a trace — the subscription
 * it would have reached does not exist until React has mounted.
 */
function showSection(window: BrowserWindow, section: SettingsSectionId): void {
  const { webContents } = window

  if (webContents.isLoading()) {
    webContents.once('did-finish-load', () => webContents.send(EVENTS.settingsSection, section))
    return
  }

  webContents.send(EVENTS.settingsSection, section)
}

/**
 * Whether the settings window is holding changes nobody applied. Published by its renderer,
 * because closing a window is the main process's decision and it has no other way to know.
 */
let settingsPending = false

export function markSettingsPending(pending: boolean): void {
  settingsPending = pending
}

/**
 * Settings live in their own window, opened by ⌘,. One at a time: a second copy of the
 * account form could save a different key than the one the first is still showing.
 *
 * `section` is what a panel asks for when it sends the user here — the account form, from a
 * panel that has just said no API key is set.
 */
export function openSettingsWindow(section?: SettingsSectionId): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // Already open, possibly on another section: reloading it would throw away a half-typed
    // key, so the window is told to move rather than sent back through its route.
    if (section) showSection(settingsWindow, section)

    revealWindow(settingsWindow)
    return settingsWindow
  }

  const window = auxiliaryWindow({ width: 760, height: 540, minWidth: 560, minHeight: 420 })

  /**
   * Nothing is written until Apply, so closing on a pending buffer throws the work away in
   * silence. Two choices rather than three: applying from here would mean asking the renderer
   * to do it and waiting for the answer, when going back and clicking Apply is one click.
   *
   * `showMessageBoxSync` because `close` cannot be awaited — the window would already be gone.
   */
  window.on('close', event => {
    if (!settingsPending) return

    const t = TRANSLATIONS[windowLanguage()].settings
    const chosen = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: t.discardTitle,
      detail: t.discardBody,
      // Cancel first, and as the default: the safe answer is the one a stray Return should give.
      buttons: [t.cancel, t.discard],
      defaultId: 0,
      cancelId: 0,
    })

    if (chosen === 0) event.preventDefault()
    else settingsPending = false
  })

  window.on('closed', () => {
    settingsPending = false
    settingsWindow = null
  })

  load(window, { hash: settingsRoute(section) })
  settingsWindow = window
  return window
}

/**
 * The notice the licences of everything shipped ask for, as its own window rather than a
 * settings section: it is read once, printed or copied from, and belongs beside About in Help
 * — not among things one changes.
 */
export function openLicencesWindow(): BrowserWindow {
  return openAuxiliaryWindow(LICENCES_ROUTE, {
    width: 720,
    height: 600,
    minWidth: 480,
    minHeight: 360,
  })
}

/**
 * The journal at length, as its own window: the flyout it is read from hangs off the status line
 * and closes on the next press, where this stays open beside the work it reports on.
 */
export function openJournalWindow(): BrowserWindow {
  return openAuxiliaryWindow(JOURNAL_ROUTE, {
    width: 760,
    height: 720,
    minWidth: 420,
    minHeight: 320,
  })
}

/**
 * What every stored key has spent, as its own window rather than a panel: it is read on its
 * own, not while working, and none of it belongs beside a document.
 *
 * Wider than the licences window — four sections, tables and charts side by side.
 */
export function openUsageWindow(): BrowserWindow {
  return openAuxiliaryWindow(USAGE_ROUTE, {
    width: 900,
    height: 620,
    minWidth: 680,
    minHeight: 440,
  })
}

/**
 * The user manual, as its own window rather than a panel: it is read BESIDE the work, often
 * while the studio is doing the thing being read about, and a dock would take the space the
 * subject of the reading occupies.
 *
 * The widest of the three — a chapter list down one side and prose with tables beside it.
 */
export function openManualWindow(): BrowserWindow {
  return openAuxiliaryWindow(MANUAL_ROUTE, {
    width: 1000,
    height: 700,
    minWidth: 640,
    minHeight: 420,
  })
}

/**
 * Everything the studio knows about one file, as its own window — the ⌘I of this application.
 *
 * One window PER FILE, which the route carries: comparing two files means having both open, and
 * a single window following the last right-click would close the comparison as it opened it.
 */
export function openFileInfoWindow(path: string): BrowserWindow {
  return openAuxiliaryWindow(fileInfoRoute(path), {
    width: 460,
    height: 560,
    minWidth: 380,
    minHeight: 320,
  })
}

/**
 * What a document about to be made is called and where it goes — a window, not a modal drawn
 * over the studio: it is moved, put beside the folder one is looking at, and closed the way
 * every other window is, which is what closing it has to mean here (nothing is made).
 *
 * The floor is read off the browser rather than chosen: three 160 px columns and their rules —
 * under that the walk is three slots of clipped names.
 */
export function openNewDocumentWindow(): BrowserWindow {
  return openAuxiliaryWindow(NEW_DOCUMENT_ROUTE, {
    width: 860,
    height: 680,
    minWidth: 720,
    minHeight: 520,
  })
}

/**
 * The shape the two windows that show a PICTURE share: full screen allowed, no title bar inset,
 * and the monitor's own black behind the image so that nothing beside it tints the judgement.
 */
function monitorWindow(
  size: WindowSize,
  title: string,
  over: Partial<WindowOptions> = {},
): BrowserWindow {
  return shown(
    new BrowserWindow({
      ...size,
      show: false,
      backgroundColor: MIRROR_BACKGROUND,
      title,
      icon: WINDOW_ICON,
      webPreferences: WEB_PREFERENCES,
      ...over,
    }),
  )
}

/** The one video return, held apart from the auxiliary ones — see `openMirrorWindow`. */
let mirrorWindow: BrowserWindow | null = null

/**
 * The video return: the program monitor on a screen of its own.
 *
 * NOT an auxiliary window, and the difference is the whole point of a separate function. Those
 * refuse full screen — macOS would give one a space of its own and hide the studio behind it,
 * which is exactly right for a settings panel and exactly wrong for a monitor one puts on the
 * second screen and fills. It also wears no title bar inset and no chrome colour: what is behind
 * the picture is the monitor's own black, so that nothing beside the image tints the judgement.
 *
 * One window, revealed rather than stacked: a second return would decode the same sequence twice
 * more for nothing, and there is only ever one screen to watch.
 */
export function openMirrorWindow(): BrowserWindow {
  if (mirrorWindow && !mirrorWindow.isDestroyed()) {
    revealWindow(mirrorWindow)
    return mirrorWindow
  }

  const window = monitorWindow(
    { width: 960, height: 560, minWidth: 320, minHeight: 200 },
    TRANSLATIONS[windowLanguage()].mirror.title,
  )

  window.on('closed', () => {
    if (mirrorWindow === window) mirrorWindow = null
  })

  load(window, { hash: MIRROR_ROUTE })
  mirrorWindow = window
  return window
}

/** The one game window, held apart from the auxiliary ones — see `openGameWindow`. */
let gameWindow: BrowserWindow | null = null

/**
 * A scene played as a game, in a window of its own. NOT an auxiliary one, for the reason
 * `openMirrorWindow` gives: those refuse full screen, which is wrong for something one plays.
 * 🛑 Its closing is TOLD to the studio — a window torn down has no turn left in which to publish.
 */
export function openGameWindow(): BrowserWindow {
  if (gameWindow && !gameWindow.isDestroyed()) {
    revealWindow(gameWindow)
    return gameWindow
  }

  const window = monitorWindow(
    { width: 1280, height: 720, minWidth: 480, minHeight: 320 },
    TRANSLATIONS[windowLanguage()].game.window.title,
    // 🛑 NO title bar, where the studio only insets its own: a strip of chrome over a game is a
    // strip of somebody else's window. The lights stay — nothing else closes it with a mouse.
    { titleBarStyle: 'hidden', trafficLightPosition: TRAFFIC_LIGHTS },
  )

  window.on('closed', () => {
    // Identity-checked, as every other slot here is: an older window closing must not clear one
    // a newer game now holds, nor tell the studio that the game it just started is over.
    if (gameWindow !== window) return
    gameWindow = null
    studioWindow()?.webContents.send(EVENTS.gameWindowClosed)
  })

  load(window, { hash: GAME_WINDOW_ROUTE })
  gameWindow = window
  return window
}

/** The one module window — one module at a time, as `openPlayerModuleWindow` explains. */
let playerModuleWindow: BrowserWindow | null = null

/**
 * ONE window, turned towards whichever module is opened. It reloads rather than messaging the
 * fragment across, so a window the system restores finds its subject in its own URL.
 */
export function openPlayerModuleWindow(assetId: string): BrowserWindow {
  const hash = playerModuleRoute(assetId)
  if (playerModuleWindow && !playerModuleWindow.isDestroyed()) {
    revealWindow(playerModuleWindow)
    load(playerModuleWindow, { hash })
    return playerModuleWindow
  }

  // Framed like the studio and unlike the mirror or the game: this is a place one EDITS, and a
  // native bar over the studio's own chrome read as another application's window.
  const window = auxiliaryWindow(
    { width: 1180, height: 720, minWidth: 720, minHeight: 480 },
    TRANSLATIONS[windowLanguage()].playerWindow.title,
  )

  window.on('closed', () => {
    if (playerModuleWindow === window) playerModuleWindow = null
  })

  load(window, { hash })
  playerModuleWindow = window
  return window
}

/** What a Stop pressed in the studio does. Silent when there is no game window to close. */
export function closeGameWindow(): void {
  if (gameWindow && !gameWindow.isDestroyed()) gameWindow.close()
}
