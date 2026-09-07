/**
 * Opening the studio: everything a run spawned as one client's way in must never evaluate.
 *
 * Reached by `import()` so it lands in its own chunk — measured 2026-08-26, alternating series:
 * 241 ms to the way in's first answer before, 131 ms after, which is a bare Electron's own time.
 * The entry it leaves behind is 17 Ko, against 1,6 Mo.
 */
import { type BrowserWindow, app, session } from 'electron'
import { APP_NAME } from '@shared/constants'
import { EVENTS } from '@shared/ipc'
import { registerAboutPanel } from '@main/aboutPanel'
import { APP_ICON_PATH } from '@main/resources'
import { buildMenu, noteNavigationPreset } from '@main/menu'
import { broadcast } from '@main/ipc/broadcast'
import { isDevelopment } from '@main/environment'
import { registerIpc } from '@main/ipc/register'
import { log, mirrorLogsTo, recordLogsTo } from '@main/log'
import { createLogFile, logsFolder } from '@main/logFile'
import { createServices, createSettings } from '@main/services'
import { createShutdown } from '@main/shutdown'
import { armQuit } from '@main/window/controls'
import type { SettingsStore } from '@main/settings/store'
import { registerFieldMenu } from '@main/window/contextMenu'
import { lockNavigation } from '@main/window/navigation'
import { lockPermissions, rendererOrigin } from '@main/window/permissions'
import { type Splash } from '@main/window/splash'
import { openSplashWindow } from '@main/window/splashWindow'
import { quitsOnLastWindow } from '@main/window/lastWindow'
import { createMainWindow, showMainWindow } from '@main/window/windows'
import {
  bindWelcomeSettings,
  discardWelcomeWindow,
  openWelcomeWindow,
} from '@main/window/welcomeWindow'
import { needsWelcome } from '@shared/domain/welcome'

/** The two windows a launch can open, and which of them the splash hands over to. */
function openStudioWindows(splash: Splash, settings: SettingsStore): void {
  // `deferShow`: the window stays hidden until the splash is gone, so one does not appear over
  // the other. Only a second launch overrides that — see `revealWindow`.
  const main = createMainWindow({ deferShow: true })

  // A first launch opens on the welcome instead, and the studio waits behind it: closing the
  // welcome is what reveals it. `bindWelcomeSettings` first — the window stamps the onboarding
  // as seen on its way out, and it needs the store to do it.
  bindWelcomeSettings(settings)
  const welcome = needsWelcome(settings.read().onboarding)
    ? openWelcomeWindow({ deferShow: true })
    : null

  const showOnceSplashIsGone = async (): Promise<void> => {
    await splash.finish()
    if (welcome && !welcome.isDestroyed()) {
      welcome.show()
      return
    }
    if (!main.isDestroyed()) main.show()
  }

  const reveal = (): void => void showOnceSplashIsGone()

  // Whichever of the two is meant to be seen first — the other stays hidden behind it.
  ;(welcome ?? main).once('ready-to-show', reveal)

  // Without this a window stays hidden forever: `window-all-closed` never fires, so the process
  // lives on with no UI and macOS `activate` refuses to reopen anything. Both are watched — the
  // studio is revealed by the welcome's close, and a failure there would leave a painted-over box.
  const failed = (window: BrowserWindow, andThen: () => void): void => {
    window.webContents.once('did-fail-load', (_event, code: number, description: string) => {
      log.error('renderer', `startup window failed to load (${code}): ${description}`)
      andThen()
    })
  }

  // Discarded rather than destroyed: `destroy()` emits `closed`, which stamps the onboarding as
  // seen — a transient load failure would bury the welcome for good.
  if (welcome)
    failed(welcome, () => {
      discardWelcomeWindow()
      reveal()
    })
  failed(main, reveal)
}

/**
 * Everything below blocks the main loop from end to end — `createServices()` opens SQLite
 * synchronously. Deferred by one turn so the splash gets its frame first; without it the
 * splash surfaces once the work it covers is already finished.
 */
function startUp(splash: Splash, settings: SettingsStore): void {
  // Main-process API calls appear in devtools only through this development-only mirror.
  if (isDevelopment) mirrorLogsTo(entry => broadcast(EVENTS.log, entry))

  // An unpackaged run wears the Electron bundle's own identity, so the Dock shows Electron's
  // atom instead of this application's mark. The icon can be replaced at runtime; the name
  // beside it cannot — macOS reads that from the bundle, and it is right in a packaged build.
  if (isDevelopment && process.platform === 'darwin') app.dock?.setIcon(APP_ICON_PATH)

  // Before the window: the renderer's first `invoke` must find its handlers registered.
  const services = createServices(settings)
  registerIpc(services)

  // Fire and forget: whether a newer version exists has no bearing on the window opening, and
  // a check that fails leaves the studio exactly as usable as it was.
  void services.updates.check()

  // Apply the current MCP setting before subscribing because subscriptions only report changes.
  services.mcp.apply(settings.read())
  settings.subscribe(services.mcp.apply)

  // The journal batches, so up to a flush's worth of it is still in memory at any moment — and
  // the most ordinary way to lose it is the one that matters: an export fails, the user quits.
  const settleBeforeQuit = (): Promise<unknown> => {
    // Not awaited with the rest: the recognition process holds no state worth settling, and a
    // model still loading would otherwise keep the studio on screen for seconds.
    services.dictation.dispose()
    // Await MCP shutdown so its endpoint file cannot outlive the port it names.
    return Promise.all([
      services.disposeAiEngine(),
      services.journal.flush(),
      services.flushJobs(),
      services.flushMissions(),
      services.project.settled(),
      services.mcp.stop(),
      // Awaited among them: what is still queued is an append to a file the next launch reads
      // back, and a thread killed mid-write leaves a line nothing can parse.
      services.memory.close(),
      // Before the memories themselves have to be, and for a plainer reason: it holds a forked
      // process, and a `utilityProcess` nobody kills outlives the studio that forked it.
      services.closeRetrieval(),
    ])
  }

  app.on('will-quit', createShutdown({ settle: settleBeforeQuit, quit: () => app.quit() }))

  openStudioWindows(splash, settings)

  // After the window, so Chromium starts parsing the renderer bundle sooner. Neither the
  // application menu nor the About panel is reachable before a window exists.
  registerAboutPanel()
  buildMenu(services.settings.read().shortcuts.overrides)
  // Seeded here like the overrides above: `onChange` only fires on a WRITE, so without this the
  // ticked row lies on a stored preset and every row of it is inert until some other setting moves.
  noteNavigationPreset(services.settings.read().three, preset =>
    services.settings.write({
      three: { ...services.settings.read().three, navigationPreset: preset },
    }),
  )

  // Subscribed here, not beside the lock: reached any earlier, `showMainWindow` would find no
  // window yet and open one before `registerIpc` above — a renderer whose every `invoke` fails.
  // Never fires in development, where no lock is held: this path is exercised by a packaged run.
  app.on('second-instance', showMainWindow)
  app.on('activate', showMainWindow)
}

/** Called once `index.ts` has registered the asset scheme, which `ready` would otherwise beat. */
export function bootstrap(): void {
  // Before any window, and every window is born below: one opened earlier would be created
  // outside the navigation lock and would hold no menu in its fields.
  lockNavigation()
  registerFieldMenu()

  void openWhenReady()

  /**
   * Windows and Linux quit with the last window. macOS stays in the Dock: `activate` in
   * `startUp` recreates the studio, which is what a Dock click is for. Safe during start-up:
   * the main window is created before the splash is dismissed, so launch never sees zero windows.
   */
  app.on('window-all-closed', () => {
    if (quitsOnLastWindow(process.platform)) app.quit()
  })
  app.on('before-quit', armQuit)
}

async function openWhenReady(): Promise<void> {
  await app.whenReady()
  // First, so what follows leaves a trace — but resolved on the first LINE, never here: a throw
  // on the way to the folder would take the splash and the permission lock with it.
  recordLogsTo(createLogFile(logsFolder))
  log.info('startup', `${APP_NAME} ${app.getVersion()} starting`)

  // The session only exists once ready, and no window may exist before it is locked: with no
  // handler installed Electron grants every permission a page asks for.
  lockPermissions(session.defaultSession, rendererOrigin())

  // Before the splash: it is painted from the theme, and reading the settings is a JSON file —
  // the rest of the services open SQLite synchronously, far too late to decide what to paint.
  const settings = createSettings()
  const splash = openSplashWindow()

  setImmediate(() => startUp(splash, settings))
}
