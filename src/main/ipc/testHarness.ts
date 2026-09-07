import { vi } from 'vitest'

/**
 * Electron in a bottle, for main-process tests — four of them had grown their own copy of
 * `ipcMain`, so any change to `handle()` meant four edits.
 *
 * The registries are module singletons because `vi.mock` factories are hoisted above imports: a
 * const declared in the test file would still be in its temporal dead zone when the factory
 * runs. The test mocks with `async () => (await import(…)).mockElectron()`, whose dynamic
 * import resolves at call time, and reads back the same registries through its own import.
 *
 * The types below describe the DOUBLE, not Electron: the module under test is compiled against
 * the real declarations, and `vi.mock` only ever swaps what runs. That is what lets a listener
 * be typed by what this file hands it rather than by an overload it cannot satisfy.
 */
type Invoke = (...args: unknown[]) => unknown
type Listener = (...args: unknown[]) => void

const registered = new Map<string, Invoke>()

/** What a window announces to the main process — only what the code under test reads. */
export type FakeWindow = {
  webContents: {
    id: number
    send: (channel: string, payload: unknown) => void
    isDestroyed: () => boolean
    once: (event: string, listener: () => void) => void
  }
  isFocusable: () => boolean
  isDestroyed: () => boolean
  on: (event: string, listener: () => void) => void
  close: () => void
  /** What the window was sent, in order — what an assertion on `send` reads. */
  sent: { channel: string; payload: unknown }[]
}

const windows: FakeWindow[] = []
let focused: FakeWindow | null = null
const appListeners = new Map<string, Listener[]>()
const closedListeners = new Map<FakeWindow, (() => void)[]>()
const contentsDestroyedListeners = new Map<FakeWindow, (() => void)[]>()
/** Still listed by `getAllWindows`, but gone — what an `isDestroyed` guard is written for. */
const destroyed = new Set<FakeWindow>()
/** Off the list, and its web contents with it: reading their id throws, as it does for real. */
const closed = new Set<FakeWindow>()
/** Every application menu set, newest last. A rebuild that changes nothing still counts. */
const menus: unknown[] = []

export const quitApp = vi.fn()

export function mockElectron(): {
  ipcMain: { handle: (channel: string, handler: Invoke) => void }
  app: { on: (event: string, listener: Listener) => void; quit: () => void }
  BrowserWindow: {
    getAllWindows: () => FakeWindow[]
    getFocusedWindow: () => FakeWindow | null
    fromWebContents: (contents: unknown) => FakeWindow | null
  }
  Menu: {
    buildFromTemplate: (template: unknown) => unknown
    setApplicationMenu: (menu: unknown) => void
  }
  nativeImage: { createFromBuffer: (bytes: Buffer) => { isEmpty: () => boolean } }
} {
  return {
    // Always empty, which is the honest answer without a live app: every caller of `nativeImage`
    // in the main is written to fall back when the decode gives nothing, and a double that
    // pretended to resize would test the fallback and nothing else.
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) },
    ipcMain: { handle: (channel, handler) => void registered.set(channel, handler) },
    app: {
      on: (event, listener) =>
        void appListeners.set(event, [...(appListeners.get(event) ?? []), listener]),
      quit: () => quitApp(),
    },
    BrowserWindow: {
      getAllWindows: () => [...windows],
      getFocusedWindow: () => focused,
      fromWebContents: contents => windows.find(one => one.webContents === contents) ?? null,
    },
    Menu: {
      // The template travels through untouched, so a test reads what was built rather than an
      // opaque `Menu` the double would have had to invent.
      buildFromTemplate: template => template,
      setApplicationMenu: menu => void menus.push(menu),
    },
  }
}

/** Calls the registered handler, with the event argument every handler ignores. */
export function invoke(channel: string, ...args: unknown[]): unknown {
  return call(channel, {}, args)
}

/** Same, named from a window — for the handlers that read `event.sender.id`. */
export function invokeFrom(window: FakeWindow, channel: string, ...args: unknown[]): unknown {
  return call(channel, { sender: window.webContents }, args)
}

function call(channel: string, event: unknown, args: unknown[]): unknown {
  const handler = registered.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler(event, ...args)
}

let nextWebContentsId = 1

/**
 * Opens a window and announces it, in that order — which is what Electron does, and what makes
 * the `closed` listener the code registers reachable at all.
 *
 * `focusable: false` is the splash: it has no bridge, so a command sent there is lost.
 */
export function openWindow({ focusable = true } = {}): FakeWindow {
  const sent: { channel: string; payload: unknown }[] = []
  const contentsId = nextWebContentsId++
  const window: FakeWindow = {
    webContents: {
      // Faithful to Electron, and the fidelity is the point: touching the web contents of a
      // closed window throws there, so code that reads the id inside a `closed` listener rather
      // than capturing it beforehand has to fail here too.
      get id() {
        if (closed.has(window)) throw new Error('Object has been destroyed')
        return contentsId
      },
      send: (channel, payload) => void sent.push({ channel, payload }),
      isDestroyed: () => destroyed.has(window) || closed.has(window),
      once: (event, listener) => {
        if (event !== 'destroyed') return
        contentsDestroyedListeners.set(window, [
          ...(contentsDestroyedListeners.get(window) ?? []),
          listener,
        ])
      },
    },
    isFocusable: () => focusable,
    isDestroyed: () => destroyed.has(window),
    on: (event, listener) => {
      if (event !== 'closed') return
      closedListeners.set(window, [...(closedListeners.get(window) ?? []), listener])
    },
    close: vi.fn(),
    sent,
  }

  windows.push(window)
  emit('browser-window-created', {}, window)
  return window
}

export function focusWindow(window: FakeWindow | null): void {
  focused = window
  emit('browser-window-focus')
}

/** Closes a window the way Electron does: off the list first, then the event. */
export function closeWindow(window: FakeWindow): void {
  const at = windows.indexOf(window)
  if (at !== -1) windows.splice(at, 1)
  if (focused === window) focused = null
  for (const listener of contentsDestroyedListeners.get(window) ?? []) listener()
  contentsDestroyedListeners.delete(window)
  closed.add(window)
  for (const listener of closedListeners.get(window) ?? []) listener()
  closedListeners.delete(window)
}

/** Gone but still listed — the state a `isDestroyed` guard exists for. */
export function destroyWindow(window: FakeWindow): void {
  destroyed.add(window)
  for (const listener of contentsDestroyedListeners.get(window) ?? []) listener()
  contentsDestroyedListeners.delete(window)
}

/** Private: a case drives the app through `openWindow`, `focusWindow` and `closeWindow`. */
function emit(event: string, ...args: unknown[]): void {
  for (const listener of appListeners.get(event) ?? []) listener(...args)
}

/** How many application menus have been set. A rebuild that changes nothing still counts. */
export function menuBuilds(): number {
  return menus.length
}

export function lastMenu(): unknown {
  return menus.at(-1)
}

export function resetHandlers(): void {
  registered.clear()
  windows.length = 0
  closedListeners.clear()
  contentsDestroyedListeners.clear()
  appListeners.clear()
  destroyed.clear()
  closed.clear()
  menus.length = 0
  focused = null
  // `nextWebContentsId` is NOT reset, and that is the point: Electron never reuses one, and a
  // module keyed by web contents id would otherwise read the previous case's entry as its own.
}
