import { app, BrowserWindow, screen } from 'electron'
import { splashColor } from './theme'
import { createSplashController, type Splash } from './splash'
import { centredIn } from './placement'
import { WEB_PREFERENCES, load } from './windows'

const SPLASH_SIZE = { width: 420, height: 260 }

/**
 * Frameless with native rounded corners rather than `transparent: true`: CLAUDE.md forbids
 * window transparency, and the native option gets the same shape without opening that door.
 *
 * Its own HTML entry, not a route of the main one: pulling in the renderer bundle would make
 * the splash as slow to appear as what it exists to cover.
 */
export function openSplashWindow(): Splash {
  let window: BrowserWindow | null = new BrowserWindow({
    // Read the same way as the welcome it hands over to: on the BOUNDS, the two jumped by half a
    // menu bar between them.
    ...centredIn(screen.getPrimaryDisplay().workArea, SPLASH_SIZE),
    frame: false,
    roundedCorners: true,
    resizable: false,
    // `show: true`, not the usual `ready-to-show` dance: that handler runs on the main loop,
    // which synchronous startup holds from end to end. Waiting for it would surface the
    // splash only once the work it covers is already done. `backgroundColor` is what keeps
    // the first frame from flashing white.
    show: true,
    // Never takes focus: ⌘N while it is up would otherwise reach a window with no bridge and
    // vanish — the silent drop `sendToFocused` exists to prevent.
    focusable: false,
    skipTaskbar: true,
    backgroundColor: splashColor(),
    // Spread rather than retyped: `WEB_PREFERENCES` carries the guarantee that no window
    // reaches the bridge with weaker settings. The splash needs no bridge at all.
    webPreferences: { ...WEB_PREFERENCES, preload: undefined, devTools: false },
  })

  load(window, { entry: 'splash.html', hash: `${app.getVersion()} · ${__COMMIT_HASH__}` })

  return createSplashController(
    {
      now: () => Date.now(),
      schedule: (callback, delay) => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      },
    },
    () => {
      if (window && !window.isDestroyed()) window.close()
      // Dropped so closing frees the wrapper instead of waiting for the last closure to die.
      window = null
    },
  )
}
